// Certificate chain check: reads PEM or DER certificates, puts them in chain
// order, verifies each signature with Web Crypto, and reports what clients
// will refuse. No network calls; works in browsers and Node 18+.
import { parseCertificate, pemBlocks, nameAttr, hex, sameBytes, readTlv, children, CURVES } from "./x509.mjs";

const subtle = globalThis.crypto && globalThis.crypto.subtle;

export const TYPES = [
  "private-key-pasted", "unreadable-block", "not-a-certificate", "no-certificates",
  "expired", "not-yet-valid", "expires-soon", "chain-expires-first",
  "hostname-mismatch", "no-san", "partial-wildcard",
  "missing-intermediate", "wrong-order", "unrelated-certificate", "duplicate-certificate", "root-included",
  "bad-signature", "signature-unchecked", "issuer-not-ca", "issuer-no-keycertsign", "path-length-exceeded", "key-id-mismatch",
  "leaf-is-ca", "no-server-auth", "key-usage-mismatch", "validity-too-long",
  "weak-rsa-key", "weak-signature-hash", "weak-curve", "dsa-key", "v1-certificate",
  "precertificate", "no-embedded-sct", "self-signed-leaf", "negative-serial", "duplicate-extension",
  "signature-alg-mismatch", "trailing-data", "must-staple",
];

export const SEVERITY_ORDER = ["error", "high", "medium", "low", "info"];

const DAY = 86400000;

// CA/Browser Forum Baseline Requirements 6.3.2, with ballot SC-081v3 (April 2025):
// the longest a publicly trusted TLS certificate may be valid, by issue date.
export const MAX_VALIDITY = [
  { from: "2029-03-15", days: 47 },
  { from: "2027-03-15", days: 100 },
  { from: "2026-03-15", days: 200 },
  { from: "2020-09-01", days: 398 },
  { from: "2018-03-01", days: 825 },
];

export function maxValidityFor(notBefore) {
  for (const r of MAX_VALIDITY) if (notBefore.getTime() >= Date.parse(r.from + "T00:00:00Z")) return r;
  return null;
}

// BR 1.6.1 counts the validity period inclusively: notAfter - notBefore + 1 second.
export function validityDays(c) {
  return (c.notAfter.getTime() - c.notBefore.getTime() + 1000) / DAY;
}

// ---------------------------------------------------------------- input

const KEY_LABELS = /PRIVATE KEY/;

export function readInput(input) {
  const findings = [];
  const certs = [];
  const notes = [];
  const add = (der, where, label) => {
    try {
      const c = parseCertificate(der);
      c.where = where;
      c.label = label;
      certs.push(c);
      if (c.trailing > 0 && label !== "TRUSTED CERTIFICATE") findings.push({ type: "trailing-data", severity: "low", where, message: `${c.trailing} bytes follow the certificate inside this block. Most tools ignore them; some refuse the file.` });
    } catch (e) {
      findings.push({ type: "unreadable-block", severity: "error", where, message: `This block is not a readable X.509 certificate: ${e.message}.` });
    }
  };
  if (input instanceof Uint8Array && !looksLikeText(input)) {
    add(input, "DER file", "DER");
  } else {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    const blocks = pemBlocks(text);
    for (const b of blocks) {
      const where = `block ${blocks.indexOf(b) + 1} (line ${b.line})`;
      if (KEY_LABELS.test(b.label)) {
        findings.push({ type: "private-key-pasted", severity: "high", where, message: `A ${b.label} block was in the input. It was ignored and not read. A private key never needs to leave the server: if this text was shared anywhere (a ticket, a chat, a log), treat the key as exposed and replace it.` });
        continue;
      }
      if (b.error) { findings.push({ type: "unreadable-block", severity: "error", where, message: `${b.label}: ${b.error}.` }); continue; }
      if (b.label === "CERTIFICATE" || b.label === "X509 CERTIFICATE" || b.label === "TRUSTED CERTIFICATE") add(b.bytes, where, b.label);
      else findings.push({ type: "not-a-certificate", severity: "low", where, message: `A ${b.label} block is not a certificate and was skipped.${b.label === "CERTIFICATE REQUEST" || b.label === "NEW CERTIFICATE REQUEST" ? " A CSR is what you send to the CA; install the certificate it returns." : b.label === "PKCS7" ? " Convert it with: openssl pkcs7 -print_certs -in file.p7b" : ""}` });
    }
    if (!blocks.length) {
      const compact = text.replace(/\s+/g, "");
      if (compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
        try { add(base64ToBytesSafe(compact), "base64 text", "base64"); notes.push("The input had no BEGIN/END lines; it was read as one base64 certificate."); } catch { /* fall through */ }
      }
    }
  }
  return { certs, findings, notes };
}

function base64ToBytesSafe(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function looksLikeText(b) {
  const n = Math.min(b.length, 64);
  for (let i = 0; i < n; i++) if (b[i] === 0 || b[i] > 0x7e) return false;
  return true;
}

// ---------------------------------------------------------------- signatures

function ecdsaRaw(sig, bits) {
  const size = Math.ceil(bits / 8);
  const seq = readTlv(sig, 0);
  const [r, s] = children(sig, seq);
  const out = new Uint8Array(size * 2);
  const put = (n, off) => {
    let b = sig.subarray(n.hdr, n.end);
    while (b.length > size && b[0] === 0) b = b.subarray(1);
    if (b.length > size) throw new Error("ECDSA integer longer than the curve");
    out.set(b, off + size - b.length);
  };
  put(r, 0);
  put(s, size);
  return out;
}

// Does `issuer`'s public key verify `child`'s signature?
// Returns { ok: true|false } or { ok: null, why } when this browser or
// Node cannot check that algorithm.
export async function verifySignature(child, issuer) {
  if (!subtle) return { ok: null, why: "Web Crypto is not available here" };
  const key = issuer.key;
  const h = child.sigHash;
  try {
    if (child.sigKeyType === "RSA" && key.type === "RSA") {
      if (child.pss) {
        if (child.pss.hash !== child.pss.mgfHash || !["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(child.pss.hash)) return { ok: null, why: `RSA-PSS with ${child.pss.hash} and MGF1-${child.pss.mgfHash} is not supported by Web Crypto` };
        const k = await subtle.importKey("spki", spkiAsRsa(key.der), { name: "RSA-PSS", hash: child.pss.hash }, false, ["verify"]);
        return { ok: await subtle.verify({ name: "RSA-PSS", saltLength: child.pss.saltLength }, k, child.signature, child.tbs) };
      }
      if (!["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(h)) return { ok: null, why: `${child.signatureAlgorithm} is not supported by Web Crypto` };
      const k = await subtle.importKey("spki", spkiAsRsa(key.der), { name: "RSASSA-PKCS1-v1_5", hash: h }, false, ["verify"]);
      return { ok: await subtle.verify("RSASSA-PKCS1-v1_5", k, child.signature, child.tbs) };
    }
    if (child.sigKeyType === "EC" && key.type === "EC") {
      if (!["P-256", "P-384", "P-521"].includes(key.curve)) return { ok: null, why: `curve ${key.curve} is not supported by Web Crypto` };
      if (!["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(h)) return { ok: null, why: `${child.signatureAlgorithm} is not supported by Web Crypto` };
      const k = await subtle.importKey("spki", key.der, { name: "ECDSA", namedCurve: key.curve }, false, ["verify"]);
      return { ok: await subtle.verify({ name: "ECDSA", hash: h }, k, ecdsaRaw(child.signature, CURVES[key.curveOid].bits), child.tbs) };
    }
    if (child.sigKeyType === "Ed25519" && key.type === "Ed25519") {
      const k = await subtle.importKey("spki", key.der, { name: "Ed25519" }, false, ["verify"]);
      return { ok: await subtle.verify({ name: "Ed25519" }, k, child.signature, child.tbs) };
    }
    if (child.sigKeyType !== key.type && child.sigKeyType !== "unknown" && key.type !== "unknown") return { ok: false, why: `signed with ${child.sigKeyType}, but the issuer's key is ${key.type}` };
    return { ok: null, why: `${child.signatureAlgorithm} with a ${key.type} key is not supported by Web Crypto` };
  } catch (e) {
    return { ok: null, why: `Web Crypto could not check it (${e.name || "error"}: ${e.message})` };
  }
}

// A key whose algorithm is id-RSASSA-PSS imports into Web Crypto only as
// rsaEncryption; the key bits are the same.
function spkiAsRsa(der) {
  const pss = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0a];
  const idx = indexOf(der, pss);
  if (idx < 0) return der;
  const seq = readTlv(der, 0);
  const [, bits] = children(der, seq);
  const rsaAlg = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const bitsDer = der.subarray(bits.start, bits.end);
  const body = new Uint8Array(rsaAlg.length + bitsDer.length);
  body.set(rsaAlg, 0); body.set(bitsDer, rsaAlg.length);
  return wrapSeq(body);
}

function wrapSeq(body) {
  const n = body.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  const out = new Uint8Array(1 + len.length + n);
  out[0] = 0x30; out.set(len, 1); out.set(body, 1 + len.length);
  return out;
}

function indexOf(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export async function sha256Hex(b) {
  if (!subtle) return null;
  return hex(new Uint8Array(await subtle.digest("SHA-256", b)), ":");
}

// ---------------------------------------------------------------- hostnames

export function normalizeHost(h) {
  return String(h || "").trim().toLowerCase().replace(/\.$/, "");
}

export function isIp(h) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

export function canonicalIp(h) {
  if (!h.includes(":")) return h.split(".").map((x) => String(+x)).join(".");
  let s = h.replace(/^\[|\]$/g, "").toLowerCase();
  let tail = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    tail = [((p[0] << 8) | p[1]).toString(16), ((p[2] << 8) | p[3]).toString(16)];
    s = s.slice(0, -v4[1].length).replace(/:$/, ":0").replace(/:0$/, "");
    if (s.endsWith(":")) s = s.slice(0, -1);
  }
  const [a, b] = s.split("::");
  const left = a ? a.split(":") : [];
  const right = b !== undefined ? (b ? b.split(":") : []) : [];
  const fill = 8 - tail.length - left.length - right.length;
  const words = b !== undefined ? [...left, ...Array(Math.max(0, fill)).fill("0"), ...right, ...tail] : [...left, ...tail];
  const out = words.map((w) => parseInt(w || "0", 16).toString(16));
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (out[i] !== "0") { i++; continue; }
    let j = i;
    while (j < 8 && out[j] === "0") j++;
    if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
    i = j;
  }
  return best < 0 ? out.join(":") : out.slice(0, best).join(":") + "::" + out.slice(best + bestLen).join(":");
}

// Browser rules (RFC 6125 6.4.3 as Chrome, Firefox and Safari apply it): the
// subject common name is ignored; a * matches exactly one whole left-most
// label; partial wildcards such as f*.example.com match nothing.
export function dnsNameMatches(pattern, host) {
  const p = normalizeHost(pattern);
  const h = normalizeHost(host);
  if (!p.startsWith("*.")) return !p.includes("*") && p === h;
  const rest = p.slice(2);
  if (rest.includes("*") || !rest.includes(".")) return false;
  const dot = h.indexOf(".");
  return dot > 0 && h.slice(dot + 1) === rest;
}

export function hostMatches(cert, host) {
  const h = normalizeHost(host);
  const san = cert.san || [];
  if (isIp(h)) {
    let ip;
    try { ip = canonicalIp(h); } catch { return { ok: false, by: null }; }
    const hit = san.find((g) => g.type === "IP" && canonicalIp(g.value) === ip);
    return { ok: !!hit, by: hit ? `IP:${hit.value}` : null };
  }
  const hit = san.find((g) => g.type === "DNS" && dnsNameMatches(g.value, h));
  return { ok: !!hit, by: hit ? `DNS:${hit.value}` : null };
}

// ---------------------------------------------------------------- chain

const isCa = (c) => !!(c.basicConstraints && c.basicConstraints.ca);

function issuedBy(child, cand) {
  if (!sameBytes(child.issuerDer, cand.subjectDer) && child.issuerKey !== cand.subjectKey) return false;
  if (child.aki && cand.ski && child.aki !== cand.ski) return false;
  return true;
}

export const selfIssued = (c) => sameBytes(c.issuerDer, c.subjectDer) || c.issuerKey === c.subjectKey;

export async function scan(input, opts = {}) {
  const now = opts.at ? new Date(opts.at) : new Date();
  const warnDays = opts.warnDays ?? 30;
  const host = opts.host ? normalizeHost(opts.host) : null;
  const { certs: raw, findings, notes } = readInput(input);
  const where = (c) => `#${c.index + 1} ${c.cn ? `(${c.cn})` : `(${c.subjectString || "empty subject"})`}`;

  // number, fingerprint, dedupe
  const certs = [];
  const seen = new Map();
  for (const c of raw) {
    c.fingerprint = await sha256Hex(c.der);
    if (seen.has(c.fingerprint)) {
      const first = seen.get(c.fingerprint);
      findings.push({ type: "duplicate-certificate", severity: "low", where: c.where, message: `The same certificate as #${first.index + 1} appears again. Send each certificate once.` });
      continue;
    }
    c.index = certs.length;
    c.cn = nameAttr(c.subject, "CN")[0] || null;
    c.selfIssued = selfIssued(c);
    seen.set(c.fingerprint, c);
    certs.push(c);
  }
  if (!certs.length) {
    if (!findings.some((f) => f.type === "unreadable-block")) findings.push({ type: "no-certificates", severity: "error", where: "input", message: "No certificate was found. Paste PEM text (-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----) or open a .crt, .pem, .cer or .der file." });
    return finish({ certs, chain: [], findings, notes, host, now });
  }

  // self-signatures
  for (const c of certs) {
    c.selfSigned = false;
    if (c.selfIssued) {
      const v = await verifySignature(c, c);
      c.selfSigned = v.ok === true;
      c.selfSignatureUnchecked = v.ok === null ? v.why : null;
    }
  }

  // Pick the leaf: the server's certificate is meant to come first. Use the
  // first certificate that issues none of the others; if none qualifies, #1.
  const issuesAnother = (c) => certs.some((o) => o !== c && !o.selfIssued && issuedBy(o, c));
  let leaf = certs.find((c) => !issuesAnother(c) && !(isCa(c) && certs.some((o) => !isCa(o)))) || certs[0];

  // Walk up from the leaf.
  const chain = [leaf];
  const links = [];
  const used = new Set([leaf]);
  let top = leaf;
  while (!top.selfIssued) {
    const cands = certs.filter((c) => !used.has(c) && issuedBy(top, c));
    let next = null, sig = null;
    for (const c of cands) {
      const v = await verifySignature(top, c);
      if (v.ok === true) { next = c; sig = v; break; }
      if (!next) { next = c; sig = v; }
    }
    if (!next) {
      // a certificate with the right key id but a different name is worth naming
      const byKey = top.aki ? certs.find((c) => !used.has(c) && c.ski === top.aki) : null;
      const byName = certs.find((c) => !used.has(c) && c !== top && (sameBytes(top.issuerDer, c.subjectDer) || top.issuerKey === c.subjectKey));
      if (byKey) findings.push({ type: "key-id-mismatch", severity: "high", where: where(top), message: `${where(byKey)} has the key identifier this certificate's issuer should have, but its subject (${byKey.subjectString}) is not this certificate's issuer (${top.issuerString}). Clients match by name, so it does not complete the chain.` });
      else if (byName) {
        byName.nameOnlyMatch = true;
        findings.push({ type: "key-id-mismatch", severity: "high", where: where(top), message: `${where(byName)} has the right name (${byName.subjectString}) but a different key: this certificate's authority key identifier is ${top.aki}, that one's subject key identifier is ${byName.ski}. The CA has more than one certificate under that name (a re-key, a renewal or a cross-sign) and this is the wrong one. Get the intermediate the CA issued with your certificate${top.caIssuers.length ? `, for example from ${top.caIssuers[0]}` : ""}.` });
      }
      break;
    }
    links.push({ child: top, issuer: next, signature: sig });
    used.add(next);
    chain.push(next);
    top = next;
  }
  // a self-issued top that is not the leaf: is it a root (self-signed)?
  const last = chain[chain.length - 1];

  // ---- order and membership
  const unrelated = certs.filter((c) => !used.has(c));
  for (const c of unrelated) {
    if (c.nameOnlyMatch) continue;
    const why = c.selfSigned ? "a self-signed root that issued nothing in this chain" : isCa(c) ? "a CA certificate that did not issue any certificate in this chain" : "a certificate that is not part of this chain";
    findings.push({ type: "unrelated-certificate", severity: "medium", where: where(c), message: `This is ${why}. Servers send only the leaf and its intermediates; extra certificates waste bytes and can confuse clients that build the path in order.` });
  }
  const inputOrder = certs.filter((c) => used.has(c)).map((c) => c.index);
  const chainOrder = chain.map((c) => c.index);
  if (inputOrder.join(",") !== chainOrder.join(",")) {
    findings.push({ type: "wrong-order", severity: chain[0].index !== 0 ? "high" : "medium", where: "input", message: `The certificates are in the order ${inputOrder.map((i) => `#${i + 1}`).join(", ")}; the chain runs ${chainOrder.map((i) => `#${i + 1}`).join(" → ")}. TLS 1.2 (RFC 5246 7.4.2) requires the server's certificate first and each one followed by its issuer. Many clients reorder, but Java, older Android, some IoT and embedded TLS stacks, and some load balancers refuse or serve the wrong certificate.${chain[0].index !== 0 ? " The server certificate is not first, so many servers will present the wrong one." : ""}` });
  }

  // ---- incomplete chain
  if (!last.selfIssued) {
    const aia = last.caIssuers.length ? ` Its issuer can be downloaded from ${last.caIssuers[0]} (DER; convert with openssl x509 -inform der).` : "";
    if (chain.length === 1 && certs.some((c) => c.nameOnlyMatch)) {
      // reported above as key-id-mismatch
    } else if (chain.length === 1) {
      findings.push({ type: "missing-intermediate", severity: "high", where: where(last), message: `Only the server certificate is here; its issuer "${last.issuerString}" is not. Unless that issuer is itself a root in every client's trust store (the CA/Browser Forum Baseline Requirements, 6.1.7, forbid public roots from signing server certificates directly), add the intermediate after the server certificate. Browsers often hide this by fetching or caching it; curl, Python, Java, Go, Node, Android apps and API clients fail with "unable to get local issuer certificate".${aia}` });
    } else {
      notes.push(`The chain stops at ${where(last)}, issued by "${last.issuerString}". That is normal when it is the last intermediate and its issuer is a root in clients' trust stores, which this check cannot see.${aia}`);
    }
  } else if (chain.length > 1 && last.selfSigned) {
    findings.push({ type: "root-included", severity: "info", where: where(last), message: "The self-signed root is included. Clients use their own copy from the trust store, so sending it only adds bytes to every handshake; it is harmless otherwise. Leave it out of a server's chain file; keep it in a CA bundle." });
  }

  // ---- per link
  const pathLenBelow = (i) => chain.slice(1, i).filter((c) => !c.selfIssued).length; // intermediates below chain[i]
  for (const [i, { child, issuer, signature }] of links.entries()) {
    if (signature.ok === false) findings.push({ type: "bad-signature", severity: "error", where: where(child), message: `The signature does not verify with the public key of ${where(issuer)}, although the names match${signature.why ? ` (${signature.why})` : ""}. Either the issuer was re-keyed and this is the old (or new) version, or a certificate was edited. Get the matching intermediate from the CA.` });
    else if (signature.ok === null) findings.push({ type: "signature-unchecked", severity: "info", where: where(child), message: `The signature was not checked: ${signature.why}. The names and key identifiers match.` });
    if (issuer.version >= 3 && !isCa(issuer)) findings.push({ type: "issuer-not-ca", severity: "error", where: where(issuer), message: `It issued ${where(child)} but is not a CA (basicConstraints CA:TRUE is ${issuer.basicConstraints ? "false" : "missing"}). RFC 5280 6.1.4 rejects the chain.` });
    if (issuer.keyUsage && !issuer.keyUsage.includes("keyCertSign")) findings.push({ type: "issuer-no-keycertsign", severity: "error", where: where(issuer), message: `Its keyUsage (${issuer.keyUsage.join(", ")}) lacks keyCertSign, so it may not sign certificates (RFC 5280 4.2.1.3). Clients reject ${where(child)}.` });
    const bc = issuer.basicConstraints;
    if (bc && bc.pathLen !== null && pathLenBelow(i + 1) > bc.pathLen) findings.push({ type: "path-length-exceeded", severity: "error", where: where(issuer), message: `pathLenConstraint is ${bc.pathLen}, but ${pathLenBelow(i + 1)} intermediate CA certificate(s) sit below it.` });
    if (child.aki && issuer.ski && child.aki !== issuer.ski) findings.push({ type: "key-id-mismatch", severity: "medium", where: where(child), message: "The authority key identifier does not match the issuer's subject key identifier." });
  }

  // ---- per certificate
  for (const c of certs) {
    const days = (c.notAfter - now) / DAY;
    if (now < c.notBefore) findings.push({ type: "not-yet-valid", severity: "error", where: where(c), message: `Not valid until ${iso(c.notBefore)}. Check the server clock, or wait.` });
    if (now > c.notAfter) findings.push({ type: "expired", severity: used.has(c) && !(c.selfSigned && c !== leaf) ? "error" : "medium", where: where(c), message: `Expired on ${iso(c.notAfter)} (${Math.floor(-days)} days ago).${c.selfSigned && c !== leaf ? " A root in the chain file is ignored by clients that have their own copy, but an expired one still breaks clients that build the path from the file (OpenSSL 1.0.x, older Android)." : ""}` });
    else if (used.has(c) && days <= warnDays && now >= c.notBefore) findings.push({ type: "expires-soon", severity: days <= 7 ? "high" : "medium", where: where(c), message: `Expires ${iso(c.notAfter)}, in ${Math.max(0, Math.floor(days))} days.` });
    if (c.key.type === "RSA" && c.key.bits && c.key.bits < 2048) findings.push({ type: "weak-rsa-key", severity: "high", where: where(c), message: `A ${c.key.bits}-bit RSA key. Public CAs have required 2048 bits since 2013 and current clients refuse smaller keys.` });
    if (c.key.type === "EC" && !["P-256", "P-384", "P-521"].includes(c.key.curve)) findings.push({ type: "weak-curve", severity: "high", where: where(c), message: `The key is on curve ${c.key.curve}. Browsers and most TLS libraries accept only P-256, P-384 and (some) P-521.` });
    if (c.key.type === "DSA") findings.push({ type: "dsa-key", severity: "high", where: where(c), message: "A DSA key. TLS clients no longer accept DSA certificates." });
    if (!(c.selfSigned && c !== leaf) && ["MD5", "SHA-1"].includes(c.sigHash)) findings.push({ type: "weak-signature-hash", severity: "high", where: where(c), message: `Signed with ${c.signatureAlgorithm}. Browsers have refused SHA-1 (and MD5) signatures on TLS certificates since 2017. A root's own signature does not matter, but this is not a root.` });
    if (c.version < 3 && (isCa(c) || c !== leaf || c.selfSigned)) findings.push({ type: "v1-certificate", severity: c === leaf ? "low" : "medium", where: where(c), message: `An X.509 version ${c.version} certificate, with no extensions. ${c === leaf ? "It has no subjectAltName, so browsers will not accept it for any name." : "Modern clients accept a v1 certificate only as a trusted root, never as an intermediate."}` });
    if (c.serialNegative) findings.push({ type: "negative-serial", severity: "low", where: where(c), message: "The serial number is negative (its first bit is set without a leading zero byte). RFC 5280 requires a positive serial; some libraries (Go, newer OpenSSL) refuse it." });
    for (const d of c.duplicate) findings.push({ type: "duplicate-extension", severity: "high", where: where(c), message: `The ${d} extension appears twice. RFC 5280 4.2 forbids it and most libraries reject the certificate.` });
    if (c.innerAlgMismatch) findings.push({ type: "signature-alg-mismatch", severity: "high", where: where(c), message: "The signature algorithm inside the signed part differs from the one outside it. RFC 5280 4.1.1.2 requires them to be identical and clients reject it." });
  }

  // ---- leaf
  const L = leaf;
  if (isCa(L) && certs.length > 1 && chain.length > 1) findings.push({ type: "leaf-is-ca", severity: "medium", where: where(L), message: "The server certificate is a CA certificate (basicConstraints CA:TRUE). Clients will accept it, but public CAs never issue one, which usually means the files were swapped." });
  if (L.selfSigned) findings.push({ type: "self-signed-leaf", severity: "medium", where: where(L), message: "The server certificate is self-signed. Only clients that were told to trust exactly this certificate will accept it; browsers show a warning. Fine for a lab or internal service with pinned trust; use a CA (for example a free ACME CA) for anything public." });
  if (!L.san || !L.san.length) findings.push({ type: "no-san", severity: "high", where: where(L), message: `There is no subjectAltName. Browsers (Chrome since 58, Firefox, Safari) and Go ignore the subject CN${L.cn ? ` (${L.cn})` : ""} and refuse the certificate for every name. Reissue with the names in subjectAltName.` });
  for (const g of L.san || []) {
    if (g.type === "DNS" && g.value.includes("*") && !/^\*\.[^*]+$/.test(g.value)) findings.push({ type: "partial-wildcard", severity: "medium", where: where(L), message: `DNS:${g.value} is not a whole-label wildcard. Browsers match a * only as the whole left-most label (*.example.com), so this name matches nothing in them, although OpenSSL may accept it.` });
  }
  if (host) {
    const m = hostMatches(L, host);
    L.hostMatch = m;
    if (!m.ok) {
      const names = (L.san || []).filter((g) => g.type === "DNS" || g.type === "IP").map((g) => g.value);
      const near = names.find((n) => n.startsWith("*.") && host.endsWith(n.slice(1)) && host.split(".").length > n.split(".").length);
      const base = names.find((n) => n.startsWith("*.") && normalizeHost(n.slice(2)) === host);
      findings.push({ type: "hostname-mismatch", severity: "error", where: where(L), message: `${host} is not one of the certificate's names (${names.length ? names.join(", ") : "none"}).${near ? ` A wildcard covers one label only: ${near} does not cover ${host}.` : ""}${base ? ` ${base} covers names one label below ${host}, never ${host} itself; add ${host} as its own name.` : ""}${L.cn && normalizeHost(L.cn) === host ? " It is in the subject CN, which browsers ignore." : ""}` });
    }
  }
  if (L.extKeyUsage && !L.extKeyUsage.includes("serverAuth") && !L.extKeyUsage.includes("anyExtendedKeyUsage")) findings.push({ type: "no-server-auth", severity: "high", where: where(L), message: `extendedKeyUsage is ${L.extKeyUsage.join(", ")}, without serverAuth. TLS clients refuse it as a server certificate. (Fine if it is a client certificate.)` });
  if (L.keyUsage && L.key.type === "EC" && !L.keyUsage.includes("digitalSignature")) findings.push({ type: "key-usage-mismatch", severity: "high", where: where(L), message: `An ECDSA server certificate needs keyUsage digitalSignature; it has ${L.keyUsage.join(", ") || "none"}.` });
  if (L.keyUsage && L.key.type === "RSA" && !L.keyUsage.includes("digitalSignature")) findings.push({ type: "key-usage-mismatch", severity: "medium", where: where(L), message: `keyUsage is ${L.keyUsage.join(", ") || "empty"}, without digitalSignature. TLS 1.3 and every ECDHE suite in TLS 1.2 sign with the key, so strict clients (Go, newer OpenSSL, Firefox) refuse it; only RSA key exchange, removed in TLS 1.3, works.` });
  if (!L.selfSigned && !isCa(L)) {
    const lim = maxValidityFor(L.notBefore);
    const d = validityDays(L);
    if (lim && d > lim.days) findings.push({ type: "validity-too-long", severity: "low", where: where(L), message: `Valid for ${Math.round(d)} days. A publicly trusted TLS certificate issued on or after ${lim.from} may be valid for at most ${lim.days} days (CA/Browser Forum Baseline Requirements 6.3.2, ballot SC-081v3); Apple and Chrome refuse longer ones from public CAs. Fine for a private CA.` });
    if (L.precertPoison) findings.push({ type: "precertificate", severity: "error", where: where(L), message: "This is a Certificate Transparency precertificate (it carries the poison extension), not the final certificate. Every client rejects it. Download the issued certificate from the CA." });
    else if (L.sctCount === undefined && L.caIssuers.length) findings.push({ type: "no-embedded-sct", severity: "info", where: where(L), message: "No Certificate Transparency timestamps are embedded. Chrome and Safari require them for public certificates; a server can also send them in the TLS handshake or OCSP response. Normal for a private CA." });
  }
  if (L.mustStaple) findings.push({ type: "must-staple", severity: "info", where: where(L), message: "OCSP Must-Staple is set: Firefox refuses the connection unless the server staples a fresh OCSP response. Turn on OCSP stapling (nginx ssl_stapling on; Apache SSLUseStapling on). Some CAs no longer run OCSP at all." });

  // the chain expires when its first member does
  const chainEnd = chain.filter((c) => !(c.selfSigned && c !== leaf)).reduce((a, c) => (c.notAfter < a.notAfter ? c : a), leaf);
  if (chainEnd !== leaf && chainEnd.notAfter < leaf.notAfter && now <= chainEnd.notAfter) findings.push({ type: "chain-expires-first", severity: (chainEnd.notAfter - now) / DAY <= 90 ? "medium" : "low", where: where(chainEnd), message: `This intermediate expires ${iso(chainEnd.notAfter)}, before the server certificate (${iso(leaf.notAfter)}). On that date the chain breaks unless the CA's replacement intermediate is installed.` });

  return finish({ certs, chain, findings, notes, host, now, leaf, chainEnd });
}

function iso(d) {
  return d.toISOString().replace(".000Z", "Z");
}

function finish({ certs, chain, findings, notes, host, now, leaf = null, chainEnd = null }) {
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const rank = (c) => (c === leaf ? "server certificate" : c.selfSigned ? "root" : chain.includes(c) ? "intermediate" : "not in chain");
  const describe = (c) => ({
    index: c.index + 1,
    role: rank(c),
    subject: c.subjectString,
    issuer: c.issuerString,
    serial: c.serial,
    notBefore: iso(c.notBefore),
    notAfter: iso(c.notAfter),
    validityDays: Math.round(validityDays(c) * 100) / 100,
    key: c.key.type === "EC" ? `EC ${c.key.curve}` : c.key.bits ? `${c.key.type} ${c.key.bits}` : c.key.type,
    signatureAlgorithm: c.signatureAlgorithm,
    san: (c.san || []).map((g) => `${g.type}:${g.value}`),
    ca: isCa(c),
    pathLen: c.basicConstraints ? c.basicConstraints.pathLen : null,
    keyUsage: c.keyUsage || null,
    extKeyUsage: c.extKeyUsage || null,
    ski: c.ski || null,
    aki: c.aki || null,
    ocsp: c.ocsp,
    caIssuers: c.caIssuers,
    crl: c.crl,
    sctCount: c.sctCount ?? 0,
    sha256: c.fingerprint,
  });
  const errors = findings.filter((f) => f.severity === "error").length;
  return {
    checkedAt: iso(now),
    host,
    verdict: !certs.length ? "no-certificates" : errors ? "broken" : findings.some((f) => f.severity === "high") ? "risky" : "ok",
    hostMatch: leaf && host ? leaf.hostMatch : null,
    certificates: certs.map(describe),
    chain: chain.map((c) => c.index + 1),
    expires: chainEnd ? iso(chainEnd.notAfter) : null,
    findings,
    notes,
  };
}

export function hasRisk(report) {
  return report.findings.some((f) => f.severity === "error" || f.severity === "high" || f.severity === "medium");
}

export function fullchainPem(report, input) {
  // the chain in the right order, as PEM, without the root and unrelated certificates
  const { certs } = readInput(input);
  const byFp = new Map();
  return Promise.all(certs.map(async (c) => { byFp.set(await sha256Hex(c.der), c); })).then(() => {
    const wanted = report.certificates.filter((d) => report.chain.includes(d.index) && d.role !== "root");
    const order = report.chain.map((i) => wanted.find((d) => d.index === i)).filter(Boolean);
    return order.map((d) => toPem(byFp.get(d.sha256).der)).join("");
  });
}

export function toPem(der) {
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
}

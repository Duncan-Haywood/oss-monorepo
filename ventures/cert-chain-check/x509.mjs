// DER and X.509 reading, no dependencies. Follows ITU-T X.690 (DER) and
// RFC 5280 (certificate profile). Works in browsers and Node 18+.

export class DerError extends Error {}

// ---------------------------------------------------------------- DER

export function readTlv(buf, pos = 0, end = buf.length) {
  if (pos + 2 > end) throw new DerError("truncated tag or length");
  const start = pos;
  const first = buf[pos++];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b;
    do {
      if (pos >= end) throw new DerError("truncated high tag");
      b = buf[pos++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  let len = buf[pos++];
  if (len === 0x80) throw new DerError("indefinite length is not DER");
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4 || pos + n > end) throw new DerError("bad length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++];
  }
  if (pos + len > end) throw new DerError("length runs past the end of the data");
  return { cls, constructed, tag, start, hdr: pos, end: pos + len, len };
}

export function children(buf, node) {
  const out = [];
  let p = node.hdr;
  while (p < node.end) {
    const c = readTlv(buf, p, node.end);
    out.push(c);
    p = c.end;
  }
  return out;
}

const bytes = (buf, n) => buf.subarray(n.hdr, n.end);
const whole = (buf, n) => buf.subarray(n.start, n.end);

export function oid(buf, n) {
  const b = bytes(buf, n);
  if (!b.length) throw new DerError("empty OID");
  const parts = [];
  let v = 0n;
  for (let i = 0; i < b.length; i++) {
    v = v * 128n + BigInt(b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      if (!parts.length) {
        const f = v < 80n ? v / 40n : 2n;
        parts.push(f, v - f * 40n);
      } else parts.push(v);
      v = 0n;
    }
  }
  return parts.join(".");
}

export function hex(b, sep = "") {
  return [...b].map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(sep);
}

function decodeString(buf, n) {
  const b = bytes(buf, n);
  switch (n.tag) {
    case 12: return new TextDecoder("utf-8").decode(b);
    case 30: { let s = ""; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; }
    case 28: { let s = ""; for (let i = 0; i + 3 < b.length; i += 4) s += String.fromCodePoint(((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0); return s; }
    default: return String.fromCharCode(...b); // Printable, IA5, T61 (read as Latin-1), Numeric, Visible
  }
}

function time(buf, n) {
  const s = String.fromCharCode(...bytes(buf, n));
  let m;
  if (n.tag === 23) {
    m = s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
    if (!m) throw new DerError(`bad UTCTime ${s}`);
    const yy = +m[1];
    return new Date(Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  }
  m = s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
  if (!m) throw new DerError(`bad GeneralizedTime ${s}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  d.setUTCFullYear(+m[1]); // years 0-99 survive
  return d;
}

function integerHex(buf, n) {
  let b = bytes(buf, n);
  const negative = b.length > 0 && (b[0] & 0x80) !== 0;
  if (b.length > 1 && b[0] === 0) b = b.subarray(1);
  return { hex: hex(b), negative, length: bytes(buf, n).length };
}

function bitLength(b) {
  let i = 0;
  while (i < b.length && b[i] === 0) i++;
  if (i === b.length) return 0;
  return (b.length - i - 1) * 8 + (32 - Math.clz32(b[i]));
}

// ---------------------------------------------------------------- names

export const OIDS = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.9": "STREET",
  "2.5.4.10": "O", "2.5.4.11": "OU", "2.5.4.5": "serialNumber", "2.5.4.17": "postalCode",
  "2.5.4.4": "SN", "2.5.4.42": "GN", "2.5.4.12": "title", "2.5.4.97": "organizationIdentifier",
  "1.2.840.113549.1.9.1": "emailAddress", "0.9.2342.19200300.100.1.25": "DC",
  "0.9.2342.19200300.100.1.1": "UID",
  "1.3.6.1.4.1.311.60.2.1.3": "jurisdictionC", "1.3.6.1.4.1.311.60.2.1.2": "jurisdictionST",
  "1.3.6.1.4.1.311.60.2.1.1": "jurisdictionL", "2.5.4.15": "businessCategory",
};

function readName(buf, n) {
  const rdns = [];
  for (const set of children(buf, n)) {
    const rdn = [];
    for (const atv of children(buf, set)) {
      const [t, v] = children(buf, atv);
      const o = oid(buf, t);
      rdn.push({ oid: o, type: OIDS[o] || o, value: decodeString(buf, v) });
    }
    rdns.push(rdn);
  }
  return rdns;
}

function escape4514(v) {
  let s = v.replace(/([,+"\\<>;])/g, "\\$1");
  if (/^[ #]/.test(s)) s = "\\" + s;
  if (/ $/.test(s)) s = s.slice(0, -1) + "\\ ";
  return s;
}

// RFC 4514 order: last RDN first.
export function nameString(rdns) {
  return [...rdns].reverse().map((rdn) => rdn.map((a) => `${a.type}=${escape4514(a.value)}`).join("+")).join(",");
}

// RFC 5280 7.1 comparison, simplified the way most libraries do it:
// case-insensitive, internal whitespace collapsed, ends trimmed.
export function nameKey(rdns) {
  return rdns.map((rdn) => rdn.map((a) => `${a.oid}=${a.value.trim().replace(/\s+/g, " ").toLowerCase()}`).sort().join("+")).join("/");
}

export function nameAttr(rdns, type) {
  const out = [];
  for (const rdn of rdns) for (const a of rdn) if (a.type === type) out.push(a.value);
  return out;
}

// ---------------------------------------------------------------- algorithms

export const SIG_ALGS = {
  "1.2.840.113549.1.1.4": { name: "md5WithRSAEncryption", key: "RSA", hash: "MD5" },
  "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", key: "RSA", hash: "SHA-1" },
  "1.2.840.113549.1.1.14": { name: "sha224WithRSAEncryption", key: "RSA", hash: "SHA-224" },
  "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", key: "RSA", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", key: "RSA", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", key: "RSA", hash: "SHA-512" },
  "1.2.840.113549.1.1.10": { name: "rsassaPss", key: "RSA", hash: null, pss: true },
  "1.2.840.10045.4.1": { name: "ecdsa-with-SHA1", key: "EC", hash: "SHA-1" },
  "1.2.840.10045.4.3.1": { name: "ecdsa-with-SHA224", key: "EC", hash: "SHA-224" },
  "1.2.840.10045.4.3.2": { name: "ecdsa-with-SHA256", key: "EC", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { name: "ecdsa-with-SHA384", key: "EC", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { name: "ecdsa-with-SHA512", key: "EC", hash: "SHA-512" },
  "1.3.101.112": { name: "ED25519", key: "Ed25519", hash: null },
  "1.3.101.113": { name: "ED448", key: "Ed448", hash: null },
  "1.2.840.10040.4.3": { name: "dsaWithSHA1", key: "DSA", hash: "SHA-1" },
  "2.16.840.1.101.3.4.3.2": { name: "dsa_with_SHA256", key: "DSA", hash: "SHA-256" },
};

const HASH_OIDS = {
  "1.3.14.3.2.26": "SHA-1", "2.16.840.1.101.3.4.2.4": "SHA-224", "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384", "2.16.840.1.101.3.4.2.3": "SHA-512",
};

export const CURVES = {
  "1.2.840.10045.3.1.7": { name: "P-256", openssl: "prime256v1", bits: 256 },
  "1.3.132.0.34": { name: "P-384", openssl: "secp384r1", bits: 384 },
  "1.3.132.0.35": { name: "P-521", openssl: "secp521r1", bits: 521 },
  "1.3.132.0.10": { name: "secp256k1", openssl: "secp256k1", bits: 256 },
  "1.2.840.10045.3.1.1": { name: "P-192", openssl: "prime192v1", bits: 192 },
  "1.3.132.0.33": { name: "P-224", openssl: "secp224r1", bits: 224 },
};

function readAlgorithm(buf, n) {
  const [o, params] = children(buf, n);
  return { oid: oid(buf, o), params };
}

function readPss(buf, params) {
  // RSASSA-PSS-params (RFC 4055): defaults SHA-1, MGF1-SHA-1, salt 20.
  const out = { hash: "SHA-1", mgfHash: "SHA-1", saltLength: 20, trailer: 1 };
  if (!params || params.tag !== 16) return out;
  for (const f of children(buf, params)) {
    if (f.cls !== 2) continue;
    const inner = children(buf, f)[0];
    if (f.tag === 0) out.hash = HASH_OIDS[oid(buf, children(buf, inner)[0])] || "unknown";
    else if (f.tag === 1) {
      const [, mp] = children(buf, inner);
      out.mgfHash = mp ? HASH_OIDS[oid(buf, children(buf, mp)[0])] || "unknown" : "SHA-1";
    } else if (f.tag === 2) out.saltLength = parseInt(integerHex(buf, inner).hex || "0", 16);
    else if (f.tag === 3) out.trailer = parseInt(integerHex(buf, inner).hex || "0", 16);
  }
  return out;
}

function readSpki(buf, n) {
  const [algN, bitsN] = children(buf, n);
  const alg = readAlgorithm(buf, algN);
  const keyBits = bytes(buf, bitsN).subarray(1);
  const key = { oid: alg.oid, der: whole(buf, n), type: "unknown", bits: null };
  if (alg.oid === "1.2.840.113549.1.1.1" || alg.oid === "1.2.840.113549.1.1.10") {
    key.type = "RSA";
    key.pssOnly = alg.oid === "1.2.840.113549.1.1.10";
    try {
      const seq = readTlv(keyBits, 0);
      const [mod, exp] = children(keyBits, seq);
      key.bits = bitLength(bytes(keyBits, mod));
      key.exponent = parseInt(integerHex(keyBits, exp).hex || "0", 16);
    } catch { /* leave bits null */ }
  } else if (alg.oid === "1.2.840.10045.2.1") {
    key.type = "EC";
    const c = alg.params && alg.params.tag === 6 ? oid(buf, alg.params) : null;
    key.curveOid = c;
    key.curve = (CURVES[c] && CURVES[c].name) || c || "explicit parameters";
    key.bits = CURVES[c] ? CURVES[c].bits : null;
  } else if (alg.oid === "1.3.101.112") { key.type = "Ed25519"; key.bits = 256; }
  else if (alg.oid === "1.3.101.113") { key.type = "Ed448"; key.bits = 456; }
  else if (alg.oid === "1.2.840.10040.4.1") {
    key.type = "DSA";
    try {
      const [p] = children(buf, alg.params);
      key.bits = bitLength(bytes(buf, p));
    } catch { /* leave bits null */ }
  }
  return key;
}

// ---------------------------------------------------------------- extensions

export const EKU_NAMES = {
  "1.3.6.1.5.5.7.3.1": "serverAuth", "1.3.6.1.5.5.7.3.2": "clientAuth", "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection", "1.3.6.1.5.5.7.3.8": "timeStamping", "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "2.5.29.37.0": "anyExtendedKeyUsage",
};

export const KU_BITS = ["digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment", "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly"];

export const EXT_NAMES = {
  "2.5.29.14": "subjectKeyIdentifier", "2.5.29.15": "keyUsage", "2.5.29.17": "subjectAltName",
  "2.5.29.18": "issuerAltName", "2.5.29.19": "basicConstraints", "2.5.29.30": "nameConstraints",
  "2.5.29.31": "cRLDistributionPoints", "2.5.29.32": "certificatePolicies", "2.5.29.35": "authorityKeyIdentifier",
  "2.5.29.37": "extKeyUsage", "2.5.29.36": "policyConstraints", "2.5.29.54": "inhibitAnyPolicy",
  "1.3.6.1.5.5.7.1.1": "authorityInfoAccess", "1.3.6.1.4.1.11129.2.4.2": "ctSignedCertificateTimestamps",
  "1.3.6.1.4.1.11129.2.4.3": "ctPrecertificatePoison", "1.3.6.1.5.5.7.1.24": "tlsFeature",
};

function ipString(b) {
  if (b.length === 4) return [...b].join(".");
  if (b.length === 16) {
    const words = [];
    for (let i = 0; i < 16; i += 2) words.push(((b[i] << 8) | b[i + 1]).toString(16));
    return compressIPv6(words);
  }
  return hex(b, ":");
}

function compressIPv6(words) {
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (words[i] !== "0") { i++; continue; }
    let j = i;
    while (j < 8 && words[j] === "0") j++;
    if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return words.join(":");
  return words.slice(0, best).join(":") + "::" + words.slice(best + bestLen).join(":");
}

function readGeneralNames(buf, n) {
  const out = [];
  for (const g of children(buf, n)) {
    if (g.cls !== 2) continue;
    const raw = bytes(buf, g);
    switch (g.tag) {
      case 1: out.push({ type: "email", value: String.fromCharCode(...raw) }); break;
      case 2: out.push({ type: "DNS", value: String.fromCharCode(...raw) }); break;
      case 6: out.push({ type: "URI", value: String.fromCharCode(...raw) }); break;
      case 7: out.push({ type: "IP", value: ipString(raw) }); break;
      case 4: out.push({ type: "DirName", value: nameString(readName(buf, children(buf, g)[0])) }); break;
      case 0: out.push({ type: "otherName", value: oid(buf, children(buf, g)[0]) }); break;
      case 8: out.push({ type: "RID", value: oid(buf, { ...g, hdr: g.hdr }) }); break;
      default: out.push({ type: `[${g.tag}]`, value: hex(raw) });
    }
  }
  return out;
}

function readExtension(buf, ext, out) {
  const parts = children(buf, ext);
  const id = oid(buf, parts[0]);
  let critical = false;
  let valN = parts[1];
  if (valN.tag === 1) { critical = bytes(buf, valN)[0] !== 0; valN = parts[2]; }
  const v = bytes(buf, valN);
  const inner = () => readTlv(v, 0);
  const rec = { oid: id, name: EXT_NAMES[id] || id, critical };
  out.list.push(rec);
  if (out.seen.has(id)) out.duplicate.push(rec.name);
  out.seen.add(id);
  try {
    switch (id) {
      case "2.5.29.17": out.san = readGeneralNames(v, inner()); break;
      case "2.5.29.19": {
        const bc = { ca: false, pathLen: null };
        for (const f of children(v, inner())) {
          if (f.tag === 1) bc.ca = v[f.hdr] !== 0;
          else if (f.tag === 2) bc.pathLen = parseInt(integerHex(v, f).hex || "0", 16);
        }
        out.basicConstraints = { ...bc, critical };
        break;
      }
      case "2.5.29.15": {
        const b = bytes(v, inner());
        const set = [];
        for (let i = 0; i < KU_BITS.length; i++) {
          const byte = 1 + (i >> 3);
          if (byte < b.length && (b[byte] & (0x80 >> (i & 7)))) set.push(KU_BITS[i]);
        }
        out.keyUsage = set;
        out.keyUsageCritical = critical;
        break;
      }
      case "2.5.29.37":
        out.extKeyUsage = children(v, inner()).map((o) => { const s = oid(v, o); return EKU_NAMES[s] || s; });
        break;
      case "2.5.29.14": out.ski = hex(bytes(v, inner())); break;
      case "2.5.29.35":
        for (const f of children(v, inner())) if (f.cls === 2 && f.tag === 0) out.aki = hex(bytes(v, f));
        break;
      case "1.3.6.1.5.5.7.1.1":
        for (const ad of children(v, inner())) {
          const [m, loc] = children(v, ad);
          const method = oid(v, m);
          const url = loc.tag === 6 ? String.fromCharCode(...bytes(v, loc)) : null;
          if (!url) continue;
          if (method === "1.3.6.1.5.5.7.48.1") out.ocsp.push(url);
          else if (method === "1.3.6.1.5.5.7.48.2") out.caIssuers.push(url);
        }
        break;
      case "2.5.29.31":
        for (const dp of children(v, inner())) {
          for (const f of children(v, dp)) {
            if (f.cls === 2 && f.tag === 0) {
              const full = children(v, f)[0];
              if (full && full.tag === 0) for (const g of readGeneralNames(v, full)) if (g.type === "URI") out.crl.push(g.value);
            }
          }
        }
        break;
      case "2.5.29.32":
        out.policies = children(v, inner()).map((p) => oid(v, children(v, p)[0]));
        break;
      case "1.3.6.1.4.1.11129.2.4.2": {
        // OCTET STRING wrapping a TLS-encoded list: 2-byte total, then 2-byte-length SCTs.
        const os = bytes(v, inner());
        let n = 0, p = 2;
        while (p + 2 <= os.length) { const l = (os[p] << 8) | os[p + 1]; p += 2 + l; n++; }
        out.sctCount = n;
        break;
      }
      case "1.3.6.1.4.1.11129.2.4.3": out.precertPoison = true; break;
      case "1.3.6.1.5.5.7.1.24":
        out.mustStaple = children(v, inner()).some((i) => parseInt(integerHex(v, i).hex || "0", 16) === 5);
        break;
      case "2.5.29.30": out.nameConstraints = true; break;
    }
  } catch (e) {
    out.badExtensions.push(`${rec.name}: ${e.message}`);
  }
}

// ---------------------------------------------------------------- certificate

export function parseCertificate(der) {
  const buf = der instanceof Uint8Array ? der : new Uint8Array(der);
  const top = readTlv(buf, 0);
  if (top.tag !== 16 || !top.constructed) throw new DerError("not a DER SEQUENCE");
  const trailing = buf.length - top.end;
  const [tbsN, sigAlgN, sigN] = children(buf, top);
  if (!tbsN || !sigAlgN || !sigN || sigN.tag !== 3) throw new DerError("not an X.509 certificate (expected tbsCertificate, signatureAlgorithm, signature)");
  const tbs = children(buf, tbsN);
  let i = 0;
  let version = 1;
  if (tbs[0].cls === 2 && tbs[0].tag === 0) {
    version = parseInt(integerHex(buf, children(buf, tbs[0])[0]).hex || "0", 16) + 1;
    i++;
  }
  const serial = integerHex(buf, tbs[i++]);
  const innerAlg = readAlgorithm(buf, tbs[i++]);
  const issuerN = tbs[i++];
  const validity = children(buf, tbs[i++]);
  const subjectN = tbs[i++];
  const spkiN = tbs[i++];
  const ext = { list: [], seen: new Set(), duplicate: [], san: null, ocsp: [], caIssuers: [], crl: [], badExtensions: [] };
  for (; i < tbs.length; i++) {
    const f = tbs[i];
    if (f.cls === 2 && f.tag === 3) for (const e of children(buf, children(buf, f)[0])) readExtension(buf, e, ext);
  }
  const sigAlg = readAlgorithm(buf, sigAlgN);
  const sigInfo = (Object.hasOwn(SIG_ALGS, sigAlg.oid) && SIG_ALGS[sigAlg.oid]) || { name: sigAlg.oid, key: "unknown", hash: null };
  const pss = sigInfo.pss ? readPss(buf, sigAlg.params) : null;
  const issuer = readName(buf, issuerN);
  const subject = readName(buf, subjectN);
  const sigBytes = bytes(buf, sigN);
  delete ext.seen;
  return {
    der: buf.subarray(0, top.end),
    trailing,
    version,
    serial: serial.hex,
    serialNegative: serial.negative,
    serialLength: serial.length,
    signatureAlgorithm: sigInfo.name,
    signatureOid: sigAlg.oid,
    sigHash: pss ? pss.hash : sigInfo.hash,
    sigKeyType: sigInfo.key,
    pss,
    innerAlgMismatch: innerAlg.oid !== sigAlg.oid || !sameBytes(innerAlg.params ? whole(buf, innerAlg.params) : null, sigAlg.params ? whole(buf, sigAlg.params) : null),
    issuer, subject,
    issuerString: nameString(issuer), subjectString: nameString(subject),
    issuerKey: nameKey(issuer), subjectKey: nameKey(subject),
    issuerDer: whole(buf, issuerN), subjectDer: whole(buf, subjectN),
    notBefore: time(buf, validity[0]),
    notAfter: time(buf, validity[1]),
    key: readSpki(buf, spkiN),
    tbs: whole(buf, tbsN),
    signature: sigBytes.subarray(1),
    ...ext,
  };
}

export function sameBytes(a, b) {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------- PEM

const B64 = /^[A-Za-z0-9+/=\s]*$/;

export function base64ToBytes(s) {
  const clean = s.replace(/\s+/g, "");
  if (typeof atob === "function") {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(clean, "base64"));
}

// Every -----BEGIN X----- ... -----END X----- block, with its line, in order.
// Text between blocks (openssl s_client output, "Bag Attributes") is skipped.
export function pemBlocks(text) {
  const out = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END ([A-Z0-9 ]+)-----/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    let body = m[2];
    const headers = /^\s*[A-Za-z-]+:/m.test(body) && /\n\s*\n/.test(body);
    if (headers) body = body.slice(body.search(/\n\s*\n/));
    const block = { label: m[1], endLabel: m[3], line, text: m[0], bytes: null, error: null };
    if (m[1] !== m[3]) block.error = `BEGIN ${m[1]} is closed by END ${m[3]}`;
    else if (!B64.test(body)) block.error = "the body has characters that are not base64";
    else {
      try { block.bytes = base64ToBytes(body); } catch (e) { block.error = `the base64 does not decode (${e.message})`; }
    }
    out.push(block);
  }
  return out;
}

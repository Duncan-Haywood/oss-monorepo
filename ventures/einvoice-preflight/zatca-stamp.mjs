// ZATCA (Saudi Arabia, Fatoora phase 2): does a signed invoice's cryptographic stamp
// match the invoice itself? The official BR-KSA rules check only that the QR code and
// the signature are present (BR-KSA-27, -28, -29, -30, -60); Fatoora itself recomputes
// the hash and checks the stamp, and a mismatch is the most common rejection of a
// self-built signer ("invalid-invoice-hash", "invalid QR code"). This module does the
// same recomputation locally, synchronously and with no dependency, so it runs on the
// page as well as in Node:
//
//   1. the invoice hash: the document without ext:UBLExtensions, the root cac:Signature
//      and the QR AdditionalDocumentReference, canonicalized with C14N 1.1, SHA-256,
//      base64. Compared with the signature's DigestValue and QR tag 6.
//   2. the ECDSA (secp256k1, SHA-256) SignatureValue, verified over the raw hash bytes
//      with the certificate's public key. Compared with QR tag 7.
//   3. the QR TLV: tags 1-5 against the seller name, VAT number, issue date and time,
//      tax-inclusive total and VAT total in the file; tag 8 against the certificate's
//      public key; tag 9 against the certificate's own signature (simplified only).
//   4. the XAdES digests: the signing certificate's (base64 of the hex SHA-256 of the
//      certificate's base64 text) and the SignedProperties' (base64 of the hex SHA-256
//      of their exclusive C14N), both as ZATCA's SDK writes them.
//
// Measured on ZATCA's own signed samples (eval/zatca-stamp-corpus.mjs; README "ZATCA
// stamp: hash, signature and QR against the file"). What it does not do: verify the
// certificate chain to ZATCA's CA (it has no CA keys and makes no network call), or
// say whether Fatoora accepted the invoice.
import { parseXmlDom, canonicalize, canonicalizeElement, childElements, textOf } from "./c14n.mjs";

const NS = {
  inv: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  ds: "http://www.w3.org/2000/09/xmldsig#",
  xades: "http://uri.etsi.org/01903/v1.3.2#",
};

// base64 of SHA-256("0"), hex-encoded: the PIH ZATCA prescribes for a device's first invoice.
export const FIRST_PIH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

// ---------- bytes ----------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function fromBase64(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("not base64");
  const out = [];
  let buf = 0, bits = 0;
  for (const ch of clean.replace(/=+$/, "")) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return s;
}
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- SHA-256 ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(input) {
  const bytes = typeof input === "string" ? utf8(input) : input;
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

// ---------- DER ----------
export function readDer(bytes, offset = 0) {
  const tag = bytes[offset];
  let len = bytes[offset + 1];
  let head = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[offset + 2 + i];
    head = 2 + n;
  }
  const start = offset + head;
  if (start + len > bytes.length) throw new Error("DER overrun");
  return { tag, start, end: start + len, whole: bytes.subarray(offset, start + len), body: bytes.subarray(start, start + len) };
}
function derChildren(node, bytes) {
  const out = [];
  for (let p = node.start; p < node.end;) { const c = readDer(bytes, p); out.push(c); p = c.end; }
  return out;
}

const OID_P256K1 = "06052b8104000a";
/** The parts of an X.509 certificate the stamp checks use. */
export function readCertificate(der) {
  const cert = readDer(der, 0);
  const [tbs, , sigValue] = derChildren(cert, der);
  const kids = derChildren(tbs, der);
  const i = kids[0].tag === 0xa0 ? 1 : 0; // explicit version
  const validity = derChildren(kids[i + 3], der).map((t) => derTime(t));
  const spki = kids[i + 5];
  const [alg, bits] = derChildren(spki, der);
  const point = bits.body.subarray(1); // drop the unused-bits byte
  return {
    spki: spki.whole,
    curveIsSecp256k1: hex(alg.body).includes(OID_P256K1),
    point,
    notBefore: validity[0],
    notAfter: validity[1],
    signature: sigValue.body.subarray(1),
  };
}
function derTime(node) {
  const s = new TextDecoder().decode(node.body);
  const m = node.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  const year = node.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}
/** A bare SubjectPublicKeyInfo (QR tag 8) to its curve point. */
export function readSpki(der) {
  const spki = readDer(der, 0);
  const [alg, bits] = derChildren(spki, der);
  return { spki: spki.whole, curveIsSecp256k1: hex(alg.body).includes(OID_P256K1), point: bits.body.subarray(1) };
}

// ---------- secp256k1 ECDSA verification ----------
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
// One BigInt division, not two: `%` keeps the dividend's sign, so a negative
// remainder needs one + m (same results as ((a % m) + m) % m).
const mod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
function inv(a, m) {
  let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return mod(s0, m);
}
// Jacobian coordinates: one inversion per scalar multiplication instead of one per step.
function jDouble([x, y, z]) {
  if (!y) return [0n, 1n, 0n];
  const s = mod(4n * x * y * y, P), m = mod(3n * x * x, P);
  const x3 = mod(m * m - 2n * s, P);
  return [x3, mod(m * (s - x3) - 8n * y ** 4n, P), mod(2n * y * z, P)];
}
function jAdd(a, b) {
  if (!a[2]) return b;
  if (!b[2]) return a;
  const z1z1 = mod(a[2] * a[2], P), z2z2 = mod(b[2] * b[2], P);
  const u1 = mod(a[0] * z2z2, P), u2 = mod(b[0] * z1z1, P);
  const s1 = mod(a[1] * b[2] * z2z2, P), s2 = mod(b[1] * a[2] * z1z1, P);
  if (u1 === u2) return s1 === s2 ? jDouble(a) : [0n, 1n, 0n];
  const h = mod(u2 - u1, P), r = mod(s2 - s1, P);
  const hh = mod(h * h, P), hhh = mod(h * hh, P), v = mod(u1 * hh, P);
  const x3 = mod(r * r - hhh - 2n * v, P);
  return [x3, mod(r * (v - x3) - s1 * hhh, P), mod(a[2] * b[2] * h, P)];
}
function jMulAdd(k1, p1, k2, p2) {
  // Shamir's trick: k1*p1 + k2*p2 in one pass.
  const a = [p1[0], p1[1], 1n], b = [p2[0], p2[1], 1n], ab = jAdd(a, b);
  let acc = [0n, 1n, 0n];
  for (let i = 255; i >= 0; i--) {
    acc = jDouble(acc);
    const bit1 = (k1 >> BigInt(i)) & 1n, bit2 = (k2 >> BigInt(i)) & 1n;
    if (bit1 && bit2) acc = jAdd(acc, ab); else if (bit1) acc = jAdd(acc, a); else if (bit2) acc = jAdd(acc, b);
  }
  if (!acc[2]) return null;
  const zi = inv(acc[2], P);
  return [mod(acc[0] * zi * zi, P), mod(acc[1] * zi * zi * zi, P)];
}
const toBig = (bytes) => (bytes.length ? BigInt("0x" + hex(bytes)) : 0n);
function decodePoint(point) {
  if (point[0] === 4 && point.length === 65) return [toBig(point.subarray(1, 33)), toBig(point.subarray(33))];
  if ((point[0] === 2 || point[0] === 3) && point.length === 33) {
    const x = toBig(point.subarray(1));
    const y2 = mod(x ** 3n + 7n, P);
    let y = 1n, b = y2, e = (P + 1n) / 4n; // P = 3 mod 4
    while (e) { if (e & 1n) y = mod(y * b, P); b = mod(b * b, P); e >>= 1n; }
    if (mod(y * y, P) !== y2) return null;
    if (Number(y & 1n) !== (point[0] & 1)) y = P - y;
    return [x, y];
  }
  return null;
}
/** Verify a DER ECDSA signature on secp256k1 over SHA-256(message). */
export function verifyEcdsaSecp256k1(pointBytes, message, derSignature) {
  const Q = decodePoint(pointBytes);
  if (!Q || mod(Q[1] * Q[1] - Q[0] ** 3n - 7n, P) !== 0n) return false;
  let r, s;
  try {
    const seq = readDer(derSignature, 0);
    if (seq.tag !== 0x30) return false;
    const [ri, si] = derChildren(seq, derSignature);
    r = toBig(ri.body); s = toBig(si.body);
  } catch { return false; }
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
  const e = toBig(sha256(message));
  const w = inv(s, N);
  const X = jMulAdd(mod(e * w, N), G, mod(r * w, N), Q);
  return !!X && mod(X[0], N) === r;
}

// ---------- QR TLV ----------
export const QR_TAGS = { 1: "seller name", 2: "seller VAT number", 3: "timestamp", 4: "invoice total with VAT", 5: "VAT total", 6: "invoice hash", 7: "ECDSA signature", 8: "public key", 9: "certificate signature" };
export function decodeQrTlv(bytes) {
  const out = new Map();
  for (let i = 0; i < bytes.length;) {
    const tag = bytes[i];
    if (i + 1 >= bytes.length) throw new Error(`tag ${tag} has no length byte`);
    let len = bytes[i + 1], head = 2;
    // ZATCA's spec allows only one-byte lengths, but a long seller name or a DER length
    // form turns up in the wild; read 0x81/0x82 rather than misreading the rest.
    if (len === 0x81) { len = bytes[i + 2]; head = 3; } else if (len === 0x82) { len = bytes[i + 2] * 256 + bytes[i + 3]; head = 4; }
    if (i + head > bytes.length) throw new Error(`tag ${tag}'s length is cut off`);
    if (i + head + len > bytes.length) throw new Error(`tag ${tag} says ${len} bytes but only ${bytes.length - i - head} remain`);
    if (out.has(tag)) throw new Error(`tag ${tag} appears twice`);
    out.set(tag, bytes.subarray(i + head, i + head + len));
    i += head + len;
  }
  return out;
}

// ---------- the invoice ----------
const first = (node, ...path) => {
  let cur = node;
  for (const step of path) {
    const [ns, local] = step.split(":");
    cur = cur && childElements(cur, NS[ns], local)[0];
  }
  return cur || null;
};
const val = (node, ...path) => textOf(first(node, ...path)).trim();
const descend = (node, ns, local, out = []) => {
  for (const c of node.children) if (c.type === "element") { if (c.ns === ns && c.local === local) out.push(c); descend(c, ns, local, out); }
  return out;
};
const adr = (root, id) => childElements(root, NS.cac, "AdditionalDocumentReference").find((r) => val(r, "cbc:ID") === id) || null;

export function looksLikeZatca(text) {
  return /<(?:[\w-]+:)?ProfileID>\s*(?:reporting|clearance):1\.0\s*</.test(String(text).slice(0, 200000));
}

/** The hash ZATCA computes for an invoice (base64 SHA-256 of the C14N 1.1 of the
 * document without UBLExtensions, the root Signature and the QR reference). */
export function zatcaInvoiceHash(docOrText) {
  const doc = typeof docOrText === "string" || docOrText instanceof Uint8Array ? parseXmlDom(docOrText) : docOrText;
  const root = doc.root;
  const omit = (e) => (e.ns === NS.ext && e.local === "UBLExtensions") || (e.parent === root && e.ns === NS.cac && e.local === "Signature") || (e.parent === root && e.ns === NS.cac && e.local === "AdditionalDocumentReference" && val(e, "cbc:ID") === "QR");
  return toBase64(sha256(canonicalize(doc, omit)));
}

const num = (s) => (s === "" || s == null || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(String(s)) ? NaN : Number(s));
const sameMoney = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
// QR timestamps come as 2022-09-07T12:21:28, with or without Z or an offset, sometimes
// with fractional seconds; the invoice states IssueDate and IssueTime (KSA-25 is local time).
function sameStamp(qr, date, time) {
  const q = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(qr.trim());
  const t = /^(\d{2}:\d{2}:\d{2})/.exec(time.trim());
  return !!q && !!t && q[1] === date.trim() && q[2] === t[1];
}

function finding(rule, message, fix, path, severity) {
  return { rule, message, fix, path, ...(severity ? { severity } : {}) };
}

/**
 * Check a ZATCA invoice's stamp against the file. Returns { findings, meta }, where
 * meta carries the computed hash, the PIH and ICV for the batch chain check, and which
 * parts could be checked.
 */
export function checkZatcaStamp(source) {
  const findings = [];
  const meta = { checked: [] };
  let doc;
  try { doc = parseXmlDom(source); } catch (e) {
    return { findings: [finding("KSA-STAMP-00", `The XML could not be read for the stamp check: ${e.message}.`, "Fix the XML so it is well formed; Fatoora rejects it too.", "/")], meta };
  }
  const root = doc.root;
  if (root.ns !== NS.inv) return { findings, meta };
  // KSA-2: the InvoiceTypeCode name starts 01 for a standard (B2B) invoice and 02 for a
  // simplified one. ProfileID is reporting:1.0 on both in ZATCA's own samples.
  const typeName = first(root, "cbc:InvoiceTypeCode")?.attrs.find((a) => a.local === "name")?.value || "";
  const simplified = /^02/.test(typeName);
  meta.simplified = simplified;
  const hash = zatcaInvoiceHash(doc);
  meta.hash = hash;
  meta.icv = val(adr(root, "ICV") || { children: [] }, "cbc:UUID");
  const pihRef = adr(root, "PIH");
  meta.pih = pihRef ? val(pihRef, "cac:Attachment", "cbc:EmbeddedDocumentBinaryObject").replace(/\s+/g, "") : "";
  meta.invoiceNumber = val(root, "cbc:ID");

  // The signature block.
  const sig = descend(root, NS.ds, "Signature")[0] || null;
  let digest = "", sigBytes = null, cert = null, certText = "";
  if (sig) {
    const refs = descend(sig, NS.ds, "Reference");
    const invRef = refs.find((r) => r.attrs.some((a) => a.local === "URI" && a.value === "")) || refs.find((r) => r.attrs.some((a) => a.local === "Id" && a.value === "invoiceSignedData"));
    digest = invRef ? val(invRef, "ds:DigestValue") : "";
    try { sigBytes = fromBase64(val(sig, "ds:SignatureValue")); } catch { sigBytes = null; }
    certText = textOf(descend(sig, NS.ds, "X509Certificate")[0]).replace(/\s+/g, "");
    if (certText) {
      try { cert = readCertificate(fromBase64(certText)); } catch (e) {
        findings.push(finding("KSA-STAMP-17", `The signing certificate (ds:X509Certificate) could not be read: ${e.message}.`, "Embed the CSID certificate ZATCA issued (the binarySecurityToken, base64-decoded once) as one base64 block.", "/Invoice/ext:UBLExtensions//ds:X509Certificate"));
      }
    }
    if (digest) {
      meta.checked.push("hash");
      if (digest !== hash) {
        findings.push(finding("KSA-STAMP-01", `The invoice hash in the signature (${digest}) is not the hash of this invoice (${hash}). The invoice was changed after it was signed, or the signer hashed a different form of it; Fatoora rejects it (invalid-invoice-hash).`,
          "Hash the final XML exactly as sent: remove ext:UBLExtensions, cac:Signature and the QR AdditionalDocumentReference, canonicalize with C14N 1.1 (keep the whitespace), SHA-256, base64. Re-sign after any edit, including pretty-printing.", "/Invoice/ext:UBLExtensions//ds:Reference[@URI='']/ds:DigestValue"));
      }
    } else {
      findings.push(finding("KSA-STAMP-02", "The signature has no invoice-hash reference (a ds:Reference with URI=\"\" and its DigestValue).", "Write the reference with Id=\"invoiceSignedData\", URI=\"\", the three XPath transforms and the C14N 1.1 transform, and the invoice hash as its DigestValue.", "/Invoice/ext:UBLExtensions//ds:SignedInfo"));
    }
    if (sigBytes && cert) {
      meta.checked.push("signature");
      if (!cert.curveIsSecp256k1) {
        findings.push(finding("KSA-STAMP-15", "The signing certificate's key is not on secp256k1, the curve ZATCA's CSIDs use.", "Generate the key pair with the secp256k1 curve, as ZATCA's onboarding requires, and onboard it again.", "/Invoice/ext:UBLExtensions//ds:X509Certificate"));
      } else if (!(() => { try { return verifyEcdsaSecp256k1(cert.point, fromBase64(digest || hash), sigBytes); } catch { return false; } })()) {
        // A DigestValue that is not base64 (base64url, say) cannot be what was signed; it is
        // reported here and as KSA-STAMP-01, not thrown (that took the file's whole report down).
        findings.push(finding("KSA-STAMP-03", `The SignatureValue does not verify against the certificate's public key over the ${digest && digest !== hash ? "stated" : ""} invoice hash. Either the signature was made with another key, or over something other than the hash bytes.`.replace("  ", " "),
          "Sign the base64-decoded invoice hash (the 32 raw bytes) with ECDSA SHA-256 using the private key of this certificate, and write the DER signature in base64.", "/Invoice/ext:UBLExtensions//ds:SignatureValue"));
      }
      const signingTime = val(descend(sig, NS.xades, "SignedSignatureProperties")[0] || { children: [] }, "xades:SigningTime");
      const when = signingTime ? new Date(signingTime.endsWith("Z") ? signingTime : signingTime + "Z") : null;
      if (when && !isNaN(when) && cert.notAfter && (when > cert.notAfter || (cert.notBefore && when < cert.notBefore))) {
        findings.push(finding("KSA-STAMP-16", `The invoice was signed at ${signingTime}, outside the certificate's validity (${cert.notBefore?.toISOString().slice(0, 10)} to ${cert.notAfter?.toISOString().slice(0, 10)}).`, "Renew the CSID before it expires and sign with the current one.", "/Invoice/ext:UBLExtensions//xades:SigningTime", "warning"));
      }
    }
    // XAdES digests, as ZATCA's SDK writes them.
    const certDigest = val(descend(sig, NS.xades, "CertDigest")[0] || { children: [] }, "ds:DigestValue");
    if (certDigest && certText) {
      meta.checked.push("certificate digest");
      const expect = toBase64(utf8(hex(sha256(certText))));
      // A certificate that is not base64 is already KSA-STAMP-17; only the SDK's form applies.
      let expectRaw = null;
      try { expectRaw = toBase64(sha256(fromBase64(certText))); } catch { /* reported as 17 */ }
      if (certDigest !== expect && certDigest !== expectRaw) {
        findings.push(finding("KSA-STAMP-18", "xades:CertDigest is not the digest of the embedded certificate.", "Write base64(hex(SHA-256(certificate base64 text))) as the certificate digest, as ZATCA's SDK does, for the same certificate that is embedded in ds:X509Certificate.", "/Invoice/ext:UBLExtensions//xades:CertDigest/ds:DigestValue"));
      }
    }
    const props = descend(sig, NS.xades, "SignedProperties")[0];
    const propsRef = refs.find((r) => r.attrs.some((a) => a.local === "URI" && a.value.startsWith("#")));
    if (props && propsRef) {
      meta.checked.push("signed properties digest");
      const stated = val(propsRef, "ds:DigestValue");
      // ZATCA's SDK digests the element with xades and ds declared where used and empty
      // elements self-closed (not quite exclusive C14N); a standard XAdES signer digests
      // the C14N. Either is accepted, hex-then-base64 (the SDK's) or plain base64.
      const forms = [canonicalizeElement(props, { exclusive: true, selfClose: true }), canonicalizeElement(props, { exclusive: true }), canonicalizeElement(props)];
      const ok = forms.flatMap((c) => [toBase64(utf8(hex(sha256(c)))), toBase64(sha256(c))]);
      if (!ok.includes(stated)) {
        findings.push(finding("KSA-STAMP-19", "The SignedProperties digest does not match xades:SignedProperties as written. They were edited (often the signing time or the certificate digest) after the digest was taken, or re-indented.", "Fill in the signing time and certificate digest first, then take the digest of the SignedProperties element exactly as it will appear in the file.", "/Invoice/ext:UBLExtensions//ds:Reference[@URI='#xadesSignedProperties']/ds:DigestValue"));
      }
    }
  }

  // The QR code.
  const qrRef = adr(root, "QR");
  const qrText = qrRef ? val(qrRef, "cac:Attachment", "cbc:EmbeddedDocumentBinaryObject") : "";
  if (qrText) {
    let tlv = null;
    try { tlv = decodeQrTlv(fromBase64(qrText)); } catch (e) {
      findings.push(finding("KSA-STAMP-04", `The QR code is not a readable TLV (${e.message}).`, "Write the QR as base64 of tag-length-value fields: tag (1 byte), length (1 byte), value, for tags 1 to 9.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
    }
    if (tlv) {
      meta.checked.push("QR");
      const str = (t) => (tlv.has(t) ? new TextDecoder().decode(tlv.get(t)) : null);
      // Unsigned: the BR-KSA rules already report the missing stamp (BR-KSA-28/30/60), so
      // only the readable fields (tags 1-5) are compared.
      const need = !sig ? [1, 2, 3, 4, 5] : simplified ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8];
      const missing = need.filter((t) => !tlv.has(t));
      if (missing.length) findings.push(finding("KSA-STAMP-05", `The QR code has no tag ${missing.join(", ")} (${missing.map((t) => QR_TAGS[t]).join(", ")}).`, simplified ? "A simplified invoice's QR carries tags 1 to 9; tag 9 is the signature on the CSID certificate." : "A standard invoice's QR carries tags 1 to 8.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
      const seller = first(root, "cac:AccountingSupplierParty", "cac:Party");
      const name = seller ? val(seller, "cac:PartyLegalEntity", "cbc:RegistrationName") : "";
      const vat = seller ? val(seller, "cac:PartyTaxScheme", "cbc:CompanyID") : "";
      const mismatch = (tag, stated, inFile, path) => findings.push(finding(`KSA-STAMP-${String(5 + tag).padStart(2, "0")}`, `QR tag ${tag} (${QR_TAGS[tag]}) says "${stated}" but the invoice says "${inFile}".`, `Build the QR from the final invoice: tag ${tag} must equal ${path.split("/").pop()}.`, path));
      if (str(1) != null && name && str(1) !== name) mismatch(1, str(1), name, "/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName");
      if (str(2) != null && vat && str(2) !== vat) mismatch(2, str(2), vat, "/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID");
      const date = val(root, "cbc:IssueDate"), time = val(root, "cbc:IssueTime");
      if (str(3) != null && date && time && !sameStamp(str(3), date, time)) mismatch(3, str(3), `${date}T${time}`, "/Invoice/cbc:IssueDate and cbc:IssueTime");
      const total = val(root, "cac:LegalMonetaryTotal", "cbc:TaxInclusiveAmount");
      // ZATCA's data dictionary names BT-112 (TaxInclusiveAmount) for tag 4; ZATCA's own SDK
      // writes PayableAmount (BT-115), and its signed samples carry that where the two differ
      // (prepayment, payable rounding). Either is accepted; neither is a finding.
      const payable = val(root, "cac:LegalMonetaryTotal", "cbc:PayableAmount");
      if (str(4) != null && total && !sameMoney(num(str(4)), num(total)) && !(payable && sameMoney(num(str(4)), num(payable)))) mismatch(4, str(4), total, "/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount");
      // The VAT total in SAR: the TaxTotal whose amount is in the tax currency (KSA's
      // second TaxTotal, BT-111); a SAR invoice may carry only one.
      const taxCur = val(root, "cbc:TaxCurrencyCode") || "SAR";
      const totals = childElements(root, NS.cac, "TaxTotal").map((t) => first(t, "cbc:TaxAmount")).filter(Boolean);
      const sar = totals.find((a) => a.attrs.some((x) => x.local === "currencyID" && x.value === taxCur)) || totals[0];
      const vatTotal = sar ? textOf(sar).trim() : "";
      if (str(5) != null && vatTotal && !sameMoney(num(str(5)), num(vatTotal))) mismatch(5, str(5), vatTotal, "/Invoice/cac:TaxTotal/cbc:TaxAmount (in " + taxCur + ")");
      if (sig && str(6) != null && str(6) !== hash) findings.push(finding("KSA-STAMP-11", `QR tag 6 (invoice hash) is ${str(6)}, but this invoice hashes to ${hash}.`, "Write the QR after the final hash is known, and rebuild it after any change to the invoice.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
      if (tlv.has(7) && sigBytes && str(7) !== toBase64(sigBytes)) findings.push(finding("KSA-STAMP-12", "QR tag 7 (ECDSA signature) is not the invoice's SignatureValue.", "Put the base64 SignatureValue text into tag 7 as written in ds:SignatureValue.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
      if (tlv.has(8) && cert && !sameBytes(tlv.get(8), cert.spki)) findings.push(finding("KSA-STAMP-13", "QR tag 8 (public key) is not the signing certificate's public key.", "Put the DER SubjectPublicKeyInfo of the CSID certificate's key into tag 8 (raw bytes, not base64 text).", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
      if (tlv.has(9) && cert && !sameBytes(tlv.get(9), cert.signature)) findings.push(finding("KSA-STAMP-14", "QR tag 9 (certificate signature) is not the signature on the signing certificate.", "Put the certificate's signatureValue (the DER ECDSA signature ZATCA's CA made, without the BIT STRING's leading zero byte) into tag 9.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
      // With no embedded certificate the QR's own key and signature can still be tried.
      if (!cert && tlv.has(8) && tlv.has(7)) {
        try {
          const key = readSpki(tlv.get(8));
          meta.checked.push("signature (QR key)");
          if (key.curveIsSecp256k1 && !verifyEcdsaSecp256k1(key.point, fromBase64(hash), fromBase64(str(7)))) findings.push(finding("KSA-STAMP-03", "The QR's signature (tag 7) does not verify over this invoice's hash with the QR's public key (tag 8).", "Sign the 32 raw hash bytes with ECDSA SHA-256 and rebuild the QR after the final edit.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='QR']"));
        } catch { /* tag 8 unreadable: reported nowhere else, leave to BR-KSA rules */ }
      }
    }
  }
  return { findings, meta };
}

/**
 * The hash chain across a batch: each invoice's PIH (previous invoice hash) must be the
 * hash of the invoice the same device issued just before it, by ICV (invoice counter).
 * Takes [{ file, meta }] from checkZatcaStamp; returns Map(file -> [finding]). Only
 * consecutive counters present in the batch are compared; a gap is not a finding (the
 * missing invoices may simply not have been uploaded). A device's first invoice
 * carries FIRST_PIH. Invoices from several devices in one batch can share counters, so
 * a pair is compared only when exactly one invoice holds each counter.
 */
export function checkZatcaChain(items) {
  const out = new Map();
  const byIcv = new Map();
  for (const it of items) {
    // A plain decimal counter only: Number("") is 0, so a file with no ICV would stand in
    // for counter 0 (and "1e1" for 10).
    const icvText = String(it.meta?.icv ?? "").trim();
    const icv = /^\d+$/.test(icvText) ? Number(icvText) : NaN;
    if (!Number.isInteger(icv) || !it.meta?.hash) continue;
    if (!byIcv.has(icv)) byIcv.set(icv, []);
    byIcv.get(icv).push(it);
  }
  for (const [icv, list] of byIcv) {
    const prev = byIcv.get(icv - 1);
    if (list.length !== 1 || !prev || prev.length !== 1) continue;
    const cur = list[0], before = prev[0];
    if (cur.meta.pih && cur.meta.pih !== before.meta.hash) {
      const f = finding("KSA-STAMP-20", `This invoice (ICV ${icv}) names ${cur.meta.pih} as the previous invoice hash, but ${before.file} (ICV ${icv - 1}) hashes to ${before.meta.hash}.${cur.meta.pih === FIRST_PIH ? " It carries the first-invoice PIH, so the device's chain was restarted." : ""} The chain is broken; Fatoora reports it and the counter and hash must continue from the last invoice it received.`,
        "Store each invoice's hash after it is signed and write it as the next invoice's PIH, in counter order; never re-sign an earlier invoice without re-chaining the ones after it.", "/Invoice/cac:AdditionalDocumentReference[cbc:ID='PIH']");
      out.set(cur.file, [...(out.get(cur.file) || []), f]);
    }
  }
  return out;
}

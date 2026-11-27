// XML-DSig verification for an enveloped signature, with the XAdES parts a signed
// e-invoice carries, written for Spain's Facturae (facturae-signature.mjs) and kept
// general enough for other XAdES-signed formats. Dependency-free and synchronous,
// so it runs in the browser page as well as in Node: SHA-1, SHA-384/512 and RSA
// PKCS#1 v1.5 verification over BigInt are written out here (SHA-256, base64 and the
// DER reader come from zatca-stamp.mjs, the XML reader and C14N from c14n.mjs).
//
// What it does: recompute every ds:Reference digest (same-document references only:
// URI="" and URI="#id"), canonicalize ds:SignedInfo and verify ds:SignatureValue
// with the RSA key of the first X509Certificate in KeyInfo (or an RSAKeyValue).
// What it does not do: fetch external references, verify the certificate chain or
// revocation, or run arbitrary XPath or XSLT transforms (one XPath form, the usual
// "not(ancestor-or-self::ds:Signature)", is recognised; any other is reported as
// unsupported, never as a pass).

import { parseXmlDom, canonicalize, canonicalizeElement, childElements, textOf } from "./c14n.mjs";
import { fromBase64, toBase64, sha256, readDer } from "./zatca-stamp.mjs";

export const DS = "http://www.w3.org/2000/09/xmldsig#";
const utf8 = (s) => new TextEncoder().encode(s);
/** A map lookup that never finds Object.prototype ("constructor", "toString"). */
export const own = (map, key) => (typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- SHA-1 ----------
export function sha1(input) {
  const bytes = typeof input === "string" ? utf8(input) : input;
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const w = new Uint32Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 80; t++) w[t] = rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = h;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rol(a, 5) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = tmp;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 5; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

// ---------- SHA-512 / SHA-384 ----------
// Each 64-bit word is a pair of 32-bit halves (hi, lo) in an Int32Array, the usual
// way to run SHA-512 without BigInt: about 40x faster than the BigInt version this
// replaced (docs/history/ci-perf-2026-11-16-einvoice-sha512-halves.md), with the same
// bytes out (sha512/sha384 are checked against node:crypto in the tests).
const K512 = Int32Array.from([
  "428a2f98d728ae22", "7137449123ef65cd", "b5c0fbcfec4d3b2f", "e9b5dba58189dbbc", "3956c25bf348b538", "59f111f1b605d019", "923f82a4af194f9b", "ab1c5ed5da6d8118",
  "d807aa98a3030242", "12835b0145706fbe", "243185be4ee4b28c", "550c7dc3d5ffb4e2", "72be5d74f27b896f", "80deb1fe3b1696b1", "9bdc06a725c71235", "c19bf174cf692694",
  "e49b69c19ef14ad2", "efbe4786384f25e3", "0fc19dc68b8cd5b5", "240ca1cc77ac9c65", "2de92c6f592b0275", "4a7484aa6ea6e483", "5cb0a9dcbd41fbd4", "76f988da831153b5",
  "983e5152ee66dfab", "a831c66d2db43210", "b00327c898fb213f", "bf597fc7beef0ee4", "c6e00bf33da88fc2", "d5a79147930aa725", "06ca6351e003826f", "142929670a0e6e70",
  "27b70a8546d22ffc", "2e1b21385c26c926", "4d2c6dfc5ac42aed", "53380d139d95b3df", "650a73548baf63de", "766a0abb3c77b2a8", "81c2c92e47edaee6", "92722c851482353b",
  "a2bfe8a14cf10364", "a81a664bbc423001", "c24b8b70d0f89791", "c76c51a30654be30", "d192e819d6ef5218", "d69906245565a910", "f40e35855771202a", "106aa07032bbd1b8",
  "19a4c116b8d2d0c8", "1e376c085141ab53", "2748774cdf8eeb99", "34b0bcb5e19b48a8", "391c0cb3c5c95a63", "4ed8aa4ae3418acb", "5b9cca4f7763e373", "682e6ff3d6b2b8a3",
  "748f82ee5defb2fc", "78a5636f43172f60", "84c87814a1f0ab72", "8cc702081a6439ec", "90befffa23631e28", "a4506cebde82bde9", "bef9a3f7b2c67915", "c67178f2e372532b",
  "ca273eceea26619c", "d186b8c721c0c207", "eada7dd6cde0eb1e", "f57d4f7fee6ed178", "06f067aa72176fba", "0a637dc5a2c898a6", "113f9804bef90dae", "1b710b35131c471b",
  "28db77f523047d84", "32caab7b40c72493", "3c9ebe0a15c9bebc", "431d67c49c100d4c", "4cc5d4becb3e42b6", "597f299cfc657e2a", "5fcb6fab3ad6faec", "6c44198c4a475817",
].flatMap((s) => [parseInt(s.slice(0, 8), 16) | 0, parseInt(s.slice(8), 16) | 0]));
const TWO32 = 0x100000000;
function sha512core(input, init, outLen) {
  const bytes = typeof input === "string" ? utf8(input) : input;
  const len = bytes.length;
  const padded = new Uint8Array(((len + 17 + 127) >> 7) << 7);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);
  const h = Int32Array.from(init.flatMap((s) => [parseInt(s.slice(0, 8), 16) | 0, parseInt(s.slice(8), 16) | 0]));
  const w = new Int32Array(160);
  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 32; i++) w[i] = view.getInt32(off + i * 4);
    for (let t = 16; t < 80; t++) {
      // s0 = ror1 ^ ror8 ^ shr7 of w[t-15]; s1 = ror19 ^ ror61 ^ shr6 of w[t-2]
      const xh = w[2 * t - 30], xl = w[2 * t - 29];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
      const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      const yh = w[2 * t - 4], yl = w[2 * t - 3];
      const s1h = ((yh >>> 19) | (yl << 13)) ^ ((yl >>> 29) | (yh << 3)) ^ (yh >>> 6);
      const s1l = ((yl >>> 19) | (yh << 13)) ^ ((yh >>> 29) | (yl << 3)) ^ ((yl >>> 6) | (yh << 26));
      const lo = (w[2 * t - 31] >>> 0) + (s0l >>> 0) + (w[2 * t - 13] >>> 0) + (s1l >>> 0);
      w[2 * t] = w[2 * t - 32] + s0h + w[2 * t - 14] + s1h + Math.floor(lo / TWO32);
      w[2 * t + 1] = lo;
    }
    let ah = h[0], al = h[1], bh = h[2], bl = h[3], ch = h[4], cl = h[5], dh = h[6], dl = h[7];
    let eh = h[8], el = h[9], fh = h[10], fl = h[11], gh = h[12], gl = h[13], hh = h[14], hl = h[15];
    for (let t = 0; t < 80; t++) {
      // S1 = ror14 ^ ror18 ^ ror41 of e; ch = (e & f) ^ (~e & g)
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      const t1lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[2 * t + 1] >>> 0) + (w[2 * t + 1] >>> 0);
      const t1h = (hh + S1h + chh + K512[2 * t] + w[2 * t] + Math.floor(t1lo / TWO32)) | 0, t1l = t1lo | 0;
      // S0 = ror28 ^ ror34 ^ ror39 of a; maj = (a & b) ^ (a & c) ^ (b & c)
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      const t2lo = (S0l >>> 0) + (mjl >>> 0);
      const t2h = (S0h + mjh + Math.floor(t2lo / TWO32)) | 0, t2l = t2lo | 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      const elo = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + Math.floor(elo / TWO32)) | 0; el = elo | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      const alo = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + Math.floor(alo / TWO32)) | 0; al = alo | 0;
    }
    const v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (let i = 0; i < 16; i += 2) {
      const lo = (h[i + 1] >>> 0) + (v[i + 1] >>> 0);
      h[i] = h[i] + v[i] + Math.floor(lo / TWO32);
      h[i + 1] = lo;
    }
  }
  const out = new Uint8Array(64);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) ov.setInt32(i * 4, h[i]);
  return out.slice(0, outLen);
}
export const sha512 = (input) => sha512core(input, ["6a09e667f3bcc908", "bb67ae8584caa73b", "3c6ef372fe94f82b", "a54ff53a5f1d36f1", "510e527fade682d1", "9b05688c2b3e6c1f", "1f83d9abfb41bd6b", "5be0cd19137e2179"], 64);
export const sha384 = (input) => sha512core(input, ["cbbb9d5dc1059ed8", "629a292a367cd507", "9159015a3070dd17", "152fecd8f70e5939", "67332667ffc00b31", "8eb44a8768581511", "db0c2e0d64f98fa7", "47b5481dbefa4fa4"], 48);

// ---------- algorithm URIs ----------
// DigestInfo DER prefixes (RFC 8017 section 9.2, note 1), with NULL parameters.
export const DIGESTS = {
  "http://www.w3.org/2000/09/xmldsig#sha1": { name: "SHA-1", fn: sha1, info: "3021300906052b0e03021a05000414" },
  "http://www.w3.org/2001/04/xmlenc#sha256": { name: "SHA-256", fn: sha256, info: "3031300d060960864801650304020105000420" },
  "http://www.w3.org/2001/04/xmldsig-more#sha384": { name: "SHA-384", fn: sha384, info: "3041300d060960864801650304020205000430" },
  "http://www.w3.org/2001/04/xmlenc#sha512": { name: "SHA-512", fn: sha512, info: "3051300d060960864801650304020305000440" },
};
const SIGNATURES = {
  "http://www.w3.org/2000/09/xmldsig#rsa-sha1": "http://www.w3.org/2000/09/xmldsig#sha1",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256": "http://www.w3.org/2001/04/xmlenc#sha256",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384": "http://www.w3.org/2001/04/xmldsig-more#sha384",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512": "http://www.w3.org/2001/04/xmlenc#sha512",
};
export const SIGNATURE_DIGEST = SIGNATURES;
// Canonical XML 1.0 and 1.1 give the same octets for what a signature here covers
// (they differ only in xml:base/xml:id fix-up for document subsets), and the
// comment-keeping variants equal the plain ones because same-document references
// (URI="" and bare "#id") drop comments before canonicalization.
const C14N = {
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315": { exclusive: false },
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments": { exclusive: false },
  "http://www.w3.org/2006/12/xml-c14n11": { exclusive: false },
  "http://www.w3.org/2006/12/xml-c14n11#WithComments": { exclusive: false },
  "http://www.w3.org/2001/10/xml-exc-c14n#": { exclusive: true },
  "http://www.w3.org/2001/10/xml-exc-c14n#WithComments": { exclusive: true },
};
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const XPATH = "http://www.w3.org/TR/1999/REC-xpath-19991116";

// ---------- DER and certificates ----------
function derKids(node, bytes) {
  const out = [];
  for (let p = node.start; p < node.end;) { const c = readDer(bytes, p); out.push(c); p = c.end; }
  return out;
}
const bigOf = (bytes) => (bytes.length ? BigInt("0x" + hex(bytes)) : 0n);
function oidText(body) {
  const parts = [Math.floor(body[0] / 40), body[0] % 40];
  let v = 0;
  for (let i = 1; i < body.length; i++) { v = v * 128 + (body[i] & 0x7f); if (!(body[i] & 0x80)) { parts.push(v); v = 0; } }
  return parts.join(".");
}
function derTime(node) {
  const s = new TextDecoder().decode(node.body);
  const m = node.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  const year = node.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}
export const DN_TYPES = {
  "2.5.4.3": "CN", "2.5.4.4": "SN", "2.5.4.5": "SERIALNUMBER", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.9": "STREET",
  "2.5.4.10": "O", "2.5.4.11": "OU", "2.5.4.12": "T", "2.5.4.42": "GIVENNAME", "2.5.4.97": "ORGANIZATIONIDENTIFIER",
  "1.2.840.113549.1.9.1": "EMAILADDRESS", "0.9.2342.19200300.100.1.25": "DC", "0.9.2342.19200300.100.1.1": "UID",
};
function readName(node, der) {
  const out = [];
  for (const rdn of derKids(node, der)) for (const atv of derKids(rdn, der)) {
    const [type, value] = derKids(atv, der);
    const oid = oidText(type.body);
    let text;
    if (value.tag === 0x1e) { text = ""; for (let i = 0; i + 1 < value.body.length; i += 2) text += String.fromCharCode((value.body[i] << 8) | value.body[i + 1]); }
    else text = new TextDecoder().decode(value.body);
    out.push({ oid, type: own(DN_TYPES, oid) || oid, value: text });
  }
  return out;
}
const OID_RSA = "1.2.840.113549.1.1.1";
/** The parts of an X.509 certificate a signature check uses. Throws on a malformed one. */
export function readX509(der) {
  const cert = readDer(der, 0);
  if (cert.tag !== 0x30) throw new Error("not a certificate");
  const [tbs] = derKids(cert, der);
  const kids = derKids(tbs, der);
  const i = kids[0].tag === 0xa0 ? 1 : 0;
  const serial = bigOf(kids[i].body);
  const issuer = readName(kids[i + 2], der);
  const validity = derKids(kids[i + 3], der).map(derTime);
  const subject = readName(kids[i + 4], der);
  const spki = kids[i + 5];
  const [alg, bits] = derKids(spki, der);
  const algOid = oidText(derKids(alg, der)[0].body);
  let rsa = null;
  if (algOid === OID_RSA) {
    const keyBytes = bits.body.subarray(1);
    const seq = readDer(keyBytes, 0);
    const [n, e] = derKids(seq, keyBytes);
    rsa = { n: bigOf(n.body), e: bigOf(e.body) };
  }
  return { serial, issuer, subject, notBefore: validity[0], notAfter: validity[1], keyAlgorithm: algOid, rsa };
}
export const nameText = (rdns) => rdns.map((a) => `${a.type}=${a.value}`).join(", ");

/** Parse an RFC 4514 / 2253 style DN string ("CN=x, O=y, C=ES"; OID.2.5.4.97=... too). */
export function parseDnString(s) {
  const out = [];
  let i = 0;
  const str = String(s);
  while (i < str.length) {
    while (str[i] === " " || str[i] === "," || str[i] === ";" || str[i] === "+") i++;
    if (i >= str.length) break;
    const eq = str.indexOf("=", i);
    if (eq === -1) return null;
    let type = str.slice(i, eq).trim().toUpperCase().replace(/^OID\./, "");
    i = eq + 1;
    let value = "";
    if (str[i] === '"') {
      i++;
      while (i < str.length && str[i] !== '"') { if (str[i] === "\\") i++; value += str[i++] ?? ""; }
      i++;
    } else {
      while (i < str.length && str[i] !== "," && str[i] !== ";" && str[i] !== "+") {
        if (str[i] === "\\") {
          const h = str.slice(i + 1, i + 3);
          if (/^[0-9a-fA-F]{2}$/.test(h)) { value += String.fromCharCode(parseInt(h, 16)); i += 3; } else { value += str[i + 1] ?? ""; i += 2; }
        } else value += str[i++];
      }
    }
    if (own(DN_TYPES, type)) type = own(DN_TYPES, type);
    if (type === "E") type = "EMAILADDRESS";
    if (type === "SURNAME") type = "SN";
    out.push({ type, value: value.trim() });
  }
  return out;
}
const norm = (v) => v.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
/** Same attributes, any order (signers write the RDNs forwards or reversed). */
export function sameDn(rdnsA, rdnsB) {
  if (!rdnsA || !rdnsB || rdnsA.length !== rdnsB.length) return false;
  const key = (a) => `${a.type}=${norm(a.value)}`;
  const a = rdnsA.map(key).sort(), b = rdnsB.map(key).sort();
  return a.every((x, i) => x === b[i]);
}

// ---------- RSA ----------
function modPow(base, exp, m) {
  let r = 1n;
  base %= m;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % m; base = (base * base) % m; exp >>= 1n; }
  return r;
}
/** RSASSA-PKCS1-v1_5 verification (RFC 8017 section 8.2.2) of a message digest. */
export function verifyRsaPkcs1(key, digestUri, digest, signature) {
  const k = Math.ceil(key.n.toString(16).length / 2);
  if (signature.length !== k) return false;
  const s = bigOf(signature);
  if (s >= key.n) return false;
  const em = modPow(s, key.e, key.n).toString(16).padStart(k * 2, "0");
  const info = own(DIGESTS, digestUri).info;
  const t = info + hex(digest);
  // Also accept DigestInfo without the NULL parameters (RFC 8017 note 2).
  const tNoNull = (info.slice(0, 2) + (parseInt(info.slice(2, 4), 16) - 2).toString(16).padStart(2, "0") + info.slice(4, 6) +
    (parseInt(info.slice(6, 8), 16) - 2).toString(16).padStart(2, "0") + info.slice(8, -8) + info.slice(-4)) + hex(digest);
  for (const body of [t, tNoNull]) {
    const ps = k * 2 - body.length / 2 * 2 - 6;
    if (ps < 16) continue;
    if (em === "0001" + "f".repeat(ps) + "00" + body) return true;
  }
  return false;
}

// ---------- the signature ----------
const attr = (node, local) => node?.attrs.find((a) => a.local === local && a.ns === "")?.value;
const first = (node, ns, local) => (node ? childElements(node, ns, local)[0] : undefined);
function descend(node, test, out = []) {
  if (node.type !== "element" && node.type !== "document") return out;
  for (const c of node.children) if (c.type === "element") { if (test(c)) out.push(c); descend(c, test, out); }
  return out;
}
function idMap(doc) {
  const map = new Map();
  for (const el of descend(doc, () => true)) for (const a of el.attrs) if (/^(Id|ID|id)$/.test(a.local) && a.ns === "") {
    map.set(a.value, map.has(a.value) ? null : el); // null marks a duplicate Id
  }
  return map;
}

/**
 * Process one ds:Reference. Returns { uri, type, id, digestUri, ok, expected, actual,
 * target, problem } where `problem` names why it could not be computed.
 */
function checkReference(ref, doc, signature, ids) {
  const uri = attr(ref, "URI");
  const out = { uri: uri ?? null, type: attr(ref, "Type") || "", id: attr(ref, "Id") || "", ok: false, target: null, problem: "" };
  const dm = first(ref, DS, "DigestMethod");
  out.digestUri = attr(dm, "Algorithm") || "";
  const digest = own(DIGESTS, out.digestUri);
  if (!digest) { out.problem = `digest algorithm ${out.digestUri || "(none)"} is not supported here`; return out; }
  const expectedText = textOf(first(ref, DS, "DigestValue")).replace(/\s+/g, "");
  let target;
  if (uri === "") target = doc.root;
  else if (uri && uri.startsWith("#") && !uri.startsWith("#xpointer(")) {
    target = ids.get(uri.slice(1));
    if (target === null) { out.problem = `Id ${uri.slice(1)} appears on more than one element`; return out; }
    if (!target) { out.problem = `no element has Id ${uri.slice(1)}`; return out; }
  } else if (uri === "#xpointer(/)") target = doc.root;
  else { out.problem = uri === undefined ? "a reference with no URI points outside the document" : `URI ${uri} is not a same-document reference`; return out; }
  out.target = target;
  let omitSignature = false, mode = { exclusive: false }, prefixes = [];
  for (const t of childElements(first(ref, DS, "Transforms") || { children: [] }, DS, "Transform")) {
    const alg = attr(t, "Algorithm") || "";
    if (alg === ENVELOPED) omitSignature = "this";
    else if (own(C14N, alg)) {
      mode = own(C14N, alg);
      const inc = t.children.find((c) => c.type === "element" && c.local === "InclusiveNamespaces");
      prefixes = (attr(inc, "PrefixList") || "").split(/\s+/).filter(Boolean).map((p) => (p === "#default" ? "" : p));
    } else if (alg === XPATH) {
      const expr = textOf(first(t, DS, "XPath")).replace(/\s+/g, "");
      const m = /^not\(ancestor-or-self::(\w+):Signature\)$/.exec(expr);
      const xp = first(t, DS, "XPath");
      const bound = m && (function find(n) { for (; n && n.type === "element"; n = n.parent) if (n.nsDecls.has(m[1])) return n.nsDecls.get(m[1]); return null; })(xp);
      if (bound !== DS) { out.problem = "an XPath transform other than not(ancestor-or-self::ds:Signature) is not supported here"; return out; }
      omitSignature = "all";
    } else { out.problem = `transform ${alg || "(none)"} is not supported here`; return out; }
  }
  const omit = omitSignature === "this" ? (n) => n === signature : omitSignature === "all" ? (n) => n.ns === DS && n.local === "Signature" : () => false;
  const octets = target === doc.root
    ? canonicalize(doc, omit, { ...mode, inclusivePrefixes: prefixes })
    : canonicalizeSubtree(target, omit, { ...mode, inclusivePrefixes: prefixes });
  out.actual = toBase64(digest.fn(utf8(octets)));
  out.expected = expectedText;
  let expectedBytes;
  try { expectedBytes = fromBase64(expectedText); } catch { out.problem = "DigestValue is not base64"; return out; }
  out.ok = sameBytes(expectedBytes, fromBase64(out.actual));
  if (!out.ok) {
    // A diagnosis, not a pass: does the digest match under the other C14N family?
    // (A signer that canonicalizes with exclusive C14N but writes no Transform for
    // it does this; the spec's default for an untransformed reference is inclusive.)
    const other = { exclusive: !mode.exclusive, inclusivePrefixes: [] };
    const alt = target === doc.root ? canonicalize(doc, omit, other) : canonicalizeSubtree(target, omit, other);
    if (sameBytes(expectedBytes, digest.fn(utf8(alt)))) out.altMatch = other.exclusive ? "exclusive" : "inclusive";
  }
  return out;
}
function canonicalizeSubtree(node, omit, opts) {
  if (omit(node)) return "";
  const inherited = new Map();
  for (let n = node.parent; n && n.type === "element"; n = n.parent) for (const [p, uri] of n.nsDecls) if (!inherited.has(p)) inherited.set(p, uri);
  const copy = { ...node, nsDecls: new Map([...inherited, ...node.nsDecls]), parent: null };
  return canonicalize({ type: "document", children: [copy] }, omit, opts);
}

/**
 * Verify the XML-DSig signature `signature` (a ds:Signature element of `doc`).
 * @returns {{ references: object[], signedInfoOk: boolean|null, signatureMethod: string,
 *   c14nMethod: string, certificate: object|null, certificateDer: Uint8Array|null,
 *   problems: {part: string, message: string}[] }}
 */
export function verifySignature(doc, signature) {
  const problems = [];
  const res = { references: [], signedInfoOk: null, signatureMethod: "", c14nMethod: "", certificate: null, certificateDer: null, problems };
  const signedInfo = first(signature, DS, "SignedInfo");
  if (!signedInfo) { problems.push({ part: "SignedInfo", message: "ds:SignedInfo is missing." }); return res; }
  const ids = idMap(doc);
  res.references = childElements(signedInfo, DS, "Reference").map((r) => checkReference(r, doc, signature, ids));
  res.c14nMethod = attr(first(signedInfo, DS, "CanonicalizationMethod"), "Algorithm") || "";
  res.signatureMethod = attr(first(signedInfo, DS, "SignatureMethod"), "Algorithm") || "";
  const keyInfo = first(signature, DS, "KeyInfo");
  const certEl = keyInfo && descend(keyInfo, (n) => n.ns === DS && n.local === "X509Certificate")[0];
  let key = null;
  if (certEl) {
    try {
      res.certificateDer = fromBase64(textOf(certEl));
      res.certificate = readX509(res.certificateDer);
      key = res.certificate.rsa;
      if (!key) problems.push({ part: "certificate", message: `the certificate's key is not RSA (algorithm ${res.certificate.keyAlgorithm}), which this check does not verify` });
    } catch {
      problems.push({ part: "certificate", message: "the X509Certificate could not be read" });
    }
  } else {
    const rsaKv = keyInfo && descend(keyInfo, (n) => n.ns === DS && n.local === "RSAKeyValue")[0];
    if (rsaKv) {
      try { key = { n: bigOf(fromBase64(textOf(first(rsaKv, DS, "Modulus")))), e: bigOf(fromBase64(textOf(first(rsaKv, DS, "Exponent")))) }; }
      catch { problems.push({ part: "certificate", message: "the RSAKeyValue could not be read" }); }
    } else problems.push({ part: "certificate", message: "KeyInfo carries no X509Certificate or RSAKeyValue" });
  }
  const sigText = textOf(first(signature, DS, "SignatureValue"));
  const digestUri = own(SIGNATURES, res.signatureMethod);
  const c14n = own(C14N, res.c14nMethod);
  if (!digestUri) problems.push({ part: "SignatureMethod", message: `signature algorithm ${res.signatureMethod || "(none)"} is not supported here` });
  if (!c14n) problems.push({ part: "CanonicalizationMethod", message: `canonicalization ${res.c14nMethod || "(none)"} is not supported here` });
  if (key && digestUri && c14n) {
    let sig;
    try { sig = fromBase64(sigText); } catch { sig = null; }
    if (!sig || !sig.length) res.signedInfoOk = false;
    else {
      const inc = first(first(signedInfo, DS, "CanonicalizationMethod"), undefined, "InclusiveNamespaces");
      const prefixes = (attr(inc, "PrefixList") || "").split(/\s+/).filter(Boolean).map((p) => (p === "#default" ? "" : p));
      const octets = canonicalizeSubtree(signedInfo, () => false, { ...c14n, inclusivePrefixes: prefixes });
      res.signedInfoOk = verifyRsaPkcs1(key, digestUri, own(DIGESTS, digestUri).fn(utf8(octets)), sig);
    }
  }
  return res;
}

/** Digest of arbitrary bytes by an XML-DSig digest URI, as base64 (null if unknown). */
export function digestBase64(uri, bytes) {
  const d = own(DIGESTS, uri);
  return d ? toBase64(d.fn(bytes)) : null;
}

export { parseXmlDom, childElements, textOf };

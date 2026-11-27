// The PDF Standard security handler (ISO 32000-1 §7.6.3-7.6.4, ISO 32000-2 §7.6.4) for files that
// open with an empty user password: the bank statement, insurance certificate or supplier invoice
// that any viewer opens without asking, but whose author set an owner password to restrict
// printing, copying or changes. Revisions 2-4 (RC4 40-128 bit, AES-128) and 5-6 (AES-256).
//
// A file that needs a password to open is not decrypted: there is no password to try, and PayApps
// never asks for one. The permission flags (/P) are not enforced, as pdf.js, poppler and qpdf do
// not enforce them for reading: PayApps copies the pages unchanged into the contractor's own packet
// or reads their text for an import preview.
//
// Pure TypeScript apart from SHA-2 and AES encryption for the AES-256 key (Web Crypto, in both the
// browser and the Worker), so decrypting an object stays synchronous like the rest of the reader.

import { PdfDict, PdfName, PdfString, type PdfValue } from "./objects";

/** Why an encrypted PDF cannot be read, worded to follow "This PDF ...". */
export class PdfEncryptionError extends Error {}

// --- MD5 (RFC 1321) ------------------------------------------------------------------------

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
);

export function md5(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(off + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const t = d;
      d = c;
      c = b;
      const x = (a + f + (MD5_K[i] as number) + (m[g] as number)) >>> 0;
      const s = MD5_S[i] as number;
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true);
  ov.setUint32(4, b0, true);
  ov.setUint32(8, c0, true);
  ov.setUint32(12, d0, true);
  return out;
}

// --- RC4 -----------------------------------------------------------------------------------

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + (s[i] as number) + (key[i % key.length] as number)) & 255;
    const t = s[i] as number;
    s[i] = s[j] as number;
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + (s[i] as number)) & 255;
    const t = s[i] as number;
    s[i] = s[j] as number;
    s[j] = t;
    out[n] = (data[n] as number) ^ (s[((s[i] as number) + (s[j] as number)) & 255] as number);
  }
  return out;
}

// --- AES decryption (FIPS 197), CBC --------------------------------------------------------

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
const xtime = (x: number) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
const gmul = (a: number, b: number) => {
  let r = 0;
  for (let x = a, y = b; y; y >>= 1, x = xtime(x)) if (y & 1) r ^= x;
  return r;
};
// The S-box from the multiplicative inverse in GF(2^8) and the affine map.
for (let i = 0; i < 256; i++) {
  let inv = 0;
  if (i) for (inv = 1; gmul(i, inv) !== 1; inv++);
  let s = inv;
  for (let k = 1; k <= 4; k++) s ^= ((inv << k) | (inv >> (8 - k))) & 0xff;
  SBOX[i] = s ^ 0x63;
  INV_SBOX[s ^ 0x63] = i;
}
const MUL9 = Uint8Array.from({ length: 256 }, (_, i) => gmul(i, 9));
const MUL11 = Uint8Array.from({ length: 256 }, (_, i) => gmul(i, 11));
const MUL13 = Uint8Array.from({ length: 256 }, (_, i) => gmul(i, 13));
const MUL14 = Uint8Array.from({ length: 256 }, (_, i) => gmul(i, 14));

/** The round keys, 16 bytes per round, for a 16- or 32-byte key. */
function expandKey(key: Uint8Array): Uint8Array {
  const nk = key.length / 4;
  const rounds = nk + 6;
  const w = new Uint8Array(16 * (rounds + 1));
  w.set(key);
  let rcon = 1;
  for (let i = nk; i < 4 * (rounds + 1); i++) {
    let t0 = w[4 * i - 4] as number;
    let t1 = w[4 * i - 3] as number;
    let t2 = w[4 * i - 2] as number;
    let t3 = w[4 * i - 1] as number;
    if (i % nk === 0) {
      const x = t0;
      t0 = (SBOX[t1] as number) ^ rcon;
      t1 = SBOX[t2] as number;
      t2 = SBOX[t3] as number;
      t3 = SBOX[x] as number;
      rcon = xtime(rcon);
    } else if (nk > 6 && i % nk === 4) {
      t0 = SBOX[t0] as number;
      t1 = SBOX[t1] as number;
      t2 = SBOX[t2] as number;
      t3 = SBOX[t3] as number;
    }
    const p = 4 * (i - nk);
    w[4 * i] = (w[p] as number) ^ t0;
    w[4 * i + 1] = (w[p + 1] as number) ^ t1;
    w[4 * i + 2] = (w[p + 2] as number) ^ t2;
    w[4 * i + 3] = (w[p + 3] as number) ^ t3;
  }
  return w;
}

function decryptBlock(w: Uint8Array, rounds: number, s: Uint8Array) {
  const t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = (s[i] as number) ^ (w[16 * rounds + i] as number);
  for (let r = rounds - 1; r >= 0; r--) {
    // InvShiftRows and InvSubBytes (the state is column-major: byte 4c + row).
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < 4; row++) {
        t[4 * c + row] = INV_SBOX[s[4 * ((c - row + 4) % 4) + row] as number] as number;
      }
    }
    for (let i = 0; i < 16; i++) s[i] = (t[i] as number) ^ (w[16 * r + i] as number);
    if (r === 0) break;
    for (let c = 0; c < 4; c++) {
      const a0 = s[4 * c] as number;
      const a1 = s[4 * c + 1] as number;
      const a2 = s[4 * c + 2] as number;
      const a3 = s[4 * c + 3] as number;
      s[4 * c] =
        (MUL14[a0] as number) ^
        (MUL11[a1] as number) ^
        (MUL13[a2] as number) ^
        (MUL9[a3] as number);
      s[4 * c + 1] =
        (MUL9[a0] as number) ^
        (MUL14[a1] as number) ^
        (MUL11[a2] as number) ^
        (MUL13[a3] as number);
      s[4 * c + 2] =
        (MUL13[a0] as number) ^
        (MUL9[a1] as number) ^
        (MUL14[a2] as number) ^
        (MUL11[a3] as number);
      s[4 * c + 3] =
        (MUL11[a0] as number) ^
        (MUL13[a1] as number) ^
        (MUL9[a2] as number) ^
        (MUL14[a3] as number);
    }
  }
}

/** AES-CBC decryption of whole blocks; a trailing partial block is dropped. No padding removed. */
export function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 16 && key.length !== 32) throw new PdfEncryptionError("bad AES key length");
  const w = expandKey(key);
  const rounds = key.length / 4 + 6;
  const n = data.length - (data.length % 16);
  const out = new Uint8Array(n);
  const block = new Uint8Array(16);
  let prev = iv;
  for (let off = 0; off < n; off += 16) {
    const cipher = data.subarray(off, off + 16);
    block.set(cipher);
    decryptBlock(w, rounds, block);
    for (let i = 0; i < 16; i++) out[off + i] = (block[i] as number) ^ (prev[i] as number);
    prev = cipher;
  }
  return out;
}

/** Strips PKCS#5 padding when it is well formed; otherwise returns the bytes as they are. */
function unpad(data: Uint8Array): Uint8Array {
  const n = data[data.length - 1];
  if (n === undefined || n < 1 || n > 16 || n > data.length) return data;
  for (let i = data.length - n; i < data.length; i++) if (data[i] !== n) return data;
  return data.subarray(0, data.length - n);
}

// --- key derivation --------------------------------------------------------------------------

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** A copy on its own ArrayBuffer, the type Web Crypto takes. */
const own = (x: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(x);

const digest = async (alg: "SHA-256" | "SHA-384" | "SHA-512", data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest(alg, own(data)));

async function aes128CbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", own(key), "AES-CBC", false, ["encrypt"]);
  // Web Crypto always pads; the input is whole blocks, so the padding is one extra block.
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: own(iv) }, k, own(data)),
  );
  return out.subarray(0, data.length);
}

/** Algorithm 2.B (ISO 32000-2 §7.6.4.3.4), the revision 6 password hash. */
async function hash2B(password: Uint8Array, salt: Uint8Array, udata: Uint8Array) {
  let k = await digest("SHA-256", cat(password, salt, udata));
  for (let round = 0; ; round++) {
    const one = cat(password, k, udata);
    const k1 = new Uint8Array(one.length * 64);
    for (let i = 0; i < 64; i++) k1.set(one, i * one.length);
    const e = await aes128CbcEncryptNoPad(k.subarray(0, 16), k.subarray(16, 32), k1);
    // The first 16 bytes as a big-endian number, mod 3: 256 is 1 mod 3, so the byte sum mod 3.
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += e[i] as number;
    k = await digest((["SHA-256", "SHA-384", "SHA-512"] as const)[sum % 3] as "SHA-256", e);
    if (round >= 63 && (e[e.length - 1] as number) <= round - 31) break;
  }
  return k.subarray(0, 32);
}

type Method = "none" | "rc4" | "aesv2" | "aesv3";

export interface PdfDecryptor {
  /** Decrypts a string or stream of indirect object `num gen` (or the whole value for AES-256). */
  decryptString(bytes: Uint8Array, num: number, gen: number): Uint8Array;
  decryptStream(bytes: Uint8Array, num: number, gen: number): Uint8Array;
  /** False when /EncryptMetadata false leaves the XMP metadata stream in the clear. */
  readonly encryptMetadata: boolean;
}

const bytesOf = (v: PdfValue | undefined): Uint8Array | undefined =>
  v instanceof PdfString ? v.bytes : undefined;
const num = (v: PdfValue | undefined): number | undefined =>
  typeof v === "number" ? v : undefined;

function cryptFilterMethod(encrypt: PdfDict, key: string): { method: Method; length?: number } {
  const name = encrypt.get(key);
  const filterName = name instanceof PdfName ? name.name : "Identity";
  if (filterName === "Identity") return { method: "none" };
  const cf = encrypt.get("CF");
  const filter = cf instanceof PdfDict ? cf.get(filterName) : undefined;
  if (!(filter instanceof PdfDict))
    throw new PdfEncryptionError("uses an encryption method PayApps cannot read");
  const cfm = filter.get("CFM");
  const m = cfm instanceof PdfName ? cfm.name : "None";
  const length = num(filter.get("Length"));
  if (m === "V2") return { method: "rc4", length };
  if (m === "AESV2") return { method: "aesv2", length };
  if (m === "AESV3") return { method: "aesv3", length };
  if (m === "None") return { method: "none" };
  throw new PdfEncryptionError("uses an encryption method PayApps cannot read");
}

/**
 * Sets up decryption for a file with a Standard security handler and an empty user password.
 * Throws PdfEncryptionError when the file needs a password to open or uses another handler.
 */
export async function openEncryption(encrypt: PdfDict, id0: Uint8Array): Promise<PdfDecryptor> {
  const filter = encrypt.get("Filter");
  if (!(filter instanceof PdfName) || filter.name !== "Standard") {
    throw new PdfEncryptionError("is encrypted with a certificate or a security plug-in");
  }
  const v = num(encrypt.get("V")) ?? 0;
  const r = num(encrypt.get("R")) ?? 0;
  const o = bytesOf(encrypt.get("O"));
  const u = bytesOf(encrypt.get("U"));
  const p = num(encrypt.get("P"));
  if (!o || !u || p === undefined)
    throw new PdfEncryptionError("has a damaged encryption dictionary");
  const encryptMetadata = encrypt.get("EncryptMetadata") !== false;
  const needsPassword = () => new PdfEncryptionError("needs a password to open");

  let stm: Method;
  let str: Method;
  let fileKey: Uint8Array;

  if (r === 5 || r === 6) {
    if (v !== 5) throw new PdfEncryptionError("has a damaged encryption dictionary");
    const ue = bytesOf(encrypt.get("UE"));
    if (u.length < 48 || !ue || ue.length < 32)
      throw new PdfEncryptionError("has a damaged encryption dictionary");
    const empty = new Uint8Array(0);
    const hash = (salt: Uint8Array) =>
      r === 5 ? digest("SHA-256", salt) : hash2B(empty, salt, empty);
    if (!equalBytes(await hash(u.subarray(32, 40)), u.subarray(0, 32))) throw needsPassword();
    const intermediate = await hash(u.subarray(40, 48));
    fileKey = aesCbcDecrypt(intermediate, new Uint8Array(16), ue.subarray(0, 32));
    stm = cryptFilterMethod(encrypt, "StmF").method;
    str = cryptFilterMethod(encrypt, "StrF").method;
  } else if (r >= 2 && r <= 4) {
    let keyBytes: number;
    if (v === 1) {
      keyBytes = 5;
      stm = str = "rc4";
    } else if (v === 2) {
      keyBytes = Math.floor((num(encrypt.get("Length")) ?? 40) / 8);
      stm = str = "rc4";
    } else if (v === 4) {
      const s = cryptFilterMethod(encrypt, "StmF");
      const t = cryptFilterMethod(encrypt, "StrF");
      stm = s.method;
      str = t.method;
      if (stm === "aesv3" || str === "aesv3")
        throw new PdfEncryptionError("has a damaged encryption dictionary");
      // A crypt filter's /Length is in bytes by the 2008 spec, in bits in some writers.
      const len = s.length ?? t.length ?? num(encrypt.get("Length")) ?? 128;
      keyBytes = len > 16 ? Math.floor(len / 8) : len;
      if (stm === "aesv2" || str === "aesv2") keyBytes = 16;
    } else throw new PdfEncryptionError("uses an encryption method PayApps cannot read");
    if (r === 2) keyBytes = 5;
    if (keyBytes < 5 || keyBytes > 16)
      throw new PdfEncryptionError("has a damaged encryption dictionary");
    // Algorithm 2 with the empty password (which pads to exactly PAD).
    const pBytes = new Uint8Array(4);
    new DataView(pBytes.buffer).setUint32(0, p >>> 0, true);
    let h = md5(
      cat(
        PAD,
        o.subarray(0, 32),
        pBytes,
        id0,
        r >= 4 && !encryptMetadata ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0),
      ),
    );
    if (r >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, keyBytes));
    fileKey = h.subarray(0, keyBytes);
    // Algorithms 4 and 5: the empty password is the user password when U comes out right.
    if (r === 2) {
      if (!equalBytes(rc4(fileKey, PAD), u.subarray(0, 32))) throw needsPassword();
    } else {
      let x = rc4(fileKey, md5(cat(PAD, id0)));
      for (let i = 1; i <= 19; i++)
        x = rc4(
          fileKey.map((b) => b ^ i),
          x,
        );
      if (!equalBytes(x, u.subarray(0, 16))) throw needsPassword();
    }
  } else throw new PdfEncryptionError("uses an encryption method PayApps cannot read");

  const objectKey = (n: number, g: number, aes: boolean) => {
    const k = md5(
      cat(
        fileKey,
        Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255),
        aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(0),
      ),
    );
    return k.subarray(0, Math.min(fileKey.length + 5, 16));
  };
  const run = (method: Method, data: Uint8Array, n: number, g: number): Uint8Array => {
    if (method === "none" || data.length === 0) return data;
    if (method === "rc4") return rc4(objectKey(n, g, false), data);
    if (data.length < 16) return new Uint8Array(0);
    const key = method === "aesv3" ? fileKey : objectKey(n, g, true);
    return unpad(aesCbcDecrypt(key, data.subarray(0, 16), data.subarray(16)));
  };
  return {
    encryptMetadata,
    decryptString: (data, n, g) => run(str, data, n, g),
    decryptStream: (data, n, g) => run(stm, data, n, g),
  };
}

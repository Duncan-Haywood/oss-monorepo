// SHA-1 of a string (UTF-8), lower-case hex, synchronous and dependency-free so it runs in
// the browser page as well as in Node. Used for DSF's RPS Assinatura (dsf.mjs), a checksum,
// not a security use.
export function sha1Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const len = bytes.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  words[words.length - 2] = Math.floor(len / 0x20000000);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let b = 0; b < words.length; b += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[b + t];
    for (let t = 16; t < 80; t++) w[t] = rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, b1 = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b1 & c) | (~b1 & d) : t < 40 ? b1 ^ c ^ d : t < 60 ? (b1 & c) | (b1 & d) | (c & d) : b1 ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rol(a, 5) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = rol(b1, 30) >>> 0; b1 = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b1) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}

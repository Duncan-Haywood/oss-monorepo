// @ts-check
// Small shared helpers: XML escaping, RFC 822 dates, SHA-1 and UUIDv5 (for the
// Podcasting 2.0 podcast:guid), CRC-32 and slugs. Pure and browser-safe.

/** @param {unknown} s */
export function xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Text that may hold HTML (show notes) goes in CDATA, split if it contains "]]>". @param {string} s */
export function cdata(s) {
  return `<![CDATA[${String(s ?? '').split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * RFC 822 date, the form RSS 2.0 requires for pubDate: "Wed, 02 Oct 2024 15:00:00 GMT".
 * @param {string|number|Date} when
 */
export function rfc822(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${when}`);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT`;
}

/** @param {Uint8Array} msg @returns {Uint8Array} */
export function sha1(msg) {
  const ml = msg.length;
  const withPad = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
  withPad.set(msg);
  withPad[ml] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 8, Math.floor((ml * 8) / 2 ** 32));
  dv.setUint32(withPad.length - 4, (ml * 8) >>> 0);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999]
        : i < 40 ? [b ^ c ^ d, 0x6ed9eba1]
        : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
        : [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

/**
 * RFC 4122 version-5 UUID of `name` in `namespace`.
 * @param {string} name @param {string} namespace
 */
export function uuidv5(name, namespace) {
  const ns = namespace.replace(/-/g, '').match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  const bytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(16 + bytes.length);
  buf.set(ns, 0);
  buf.set(bytes, 16);
  const h = sha1(buf).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The namespace the Podcasting 2.0 spec fixes for podcast:guid.
export const PODCAST_GUID_NAMESPACE = 'ead4c236-bf58-58c6-a2c6-a6b28d128cb6';

/**
 * The podcast:guid a feed URL should carry: UUIDv5 of the URL with its scheme
 * and trailing slashes removed, per the Podcasting 2.0 namespace.
 * @param {string} feedUrl
 */
export function podcastGuid(feedUrl) {
  return uuidv5(feedUrl.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, ''), PODCAST_GUID_NAMESPACE);
}

/** A random v4 UUID, from crypto.getRandomValues (browser and Node 18+). */
export function uuidv4() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @type {Uint32Array|undefined} */
let crcTable;
/** @param {Uint8Array} data */
export function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} s */
export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

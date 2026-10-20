// @ts-check
// Synthetic media for tests: byte-exact MP3 frames, WAV, M4A box trees, PNG
// and JPEG headers, so the suite needs no ffmpeg and no binary fixtures.

/** MPEG-1 Layer III frames (no CRC). kbpsIndex 11 = 192 kbps, 9 = 128 kbps. @param {number[]} kbpsIndexes @param {{mono?: boolean, id3?: boolean}} [o] */
export function mp3(kbpsIndexes, o = {}) {
  const kbpsTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const parts = [];
  if (o.id3) {
    const tag = new Uint8Array(10 + 20);
    tag.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20]);
    parts.push(tag);
  }
  for (const idx of kbpsIndexes) {
    const len = Math.floor((144 * kbpsTable[idx] * 1000) / 44100);
    const f = new Uint8Array(len);
    f.set([0xff, 0xfb, (idx << 4) | 0x00, o.mono === false ? 0x00 : 0xc0]);
    parts.push(f);
  }
  return concat(parts);
}

/** 16-bit PCM WAV of the given samples (-1..1). @param {number[]|Float64Array} samples @param {number} [rate] */
export function wav(samples, rate = 44100) {
  const data = samples.length * 2;
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  const s = (/** @type {number} */ o, /** @type {string} */ t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + data, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  return b;
}

/** @param {string} type @param {...Uint8Array} children */
function box(type, ...children) {
  const body = concat(children);
  const b = new Uint8Array(8 + body.length);
  new DataView(b.buffer).setUint32(0, b.length);
  [...type].forEach((c, i) => (b[4 + i] = c.charCodeAt(0)));
  b.set(body, 8);
  return b;
}

/** An M4A/M4B skeleton: ftyp, moov/mvhd, one AAC track, optional chpl, mdat. @param {{seconds: number, brand?: string, chapters?: boolean, mdatBytes?: number}} o */
export function m4a({ seconds, brand = 'M4A ', chapters = false, mdatBytes = 1000 }) {
  const ftyp = box('ftyp', new TextEncoder().encode(brand.padEnd(4).slice(0, 4) + '\0\0\0\0'));
  const mvhd = new Uint8Array(100);
  const mv = new DataView(mvhd.buffer);
  mv.setUint32(12, 1000); mv.setUint32(16, Math.round(seconds * 1000));
  const mp4a = new Uint8Array(28);
  const ma = new DataView(mp4a.buffer);
  ma.setUint16(16, 2); ma.setUint16(24, 44100);
  const stsd = box('stsd', new Uint8Array(8), box('mp4a', mp4a));
  const trak = box('trak', box('mdia', box('minf', box('stbl', stsd))));
  const udta = chapters ? box('udta', box('chpl', new Uint8Array(9))) : new Uint8Array(0);
  return concat([ftyp, box('moov', box('mvhd', mvhd), trak, udta), box('mdat', new Uint8Array(mdatBytes))]);
}

/** @param {number} w @param {number} h @param {number} [colorType] 2 = RGB */
export function png(w, h, colorType = 2) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w); v.setUint32(20, h);
  b[24] = 8; b[25] = colorType;
  return b;
}

/** Baseline JPEG header with an SOF0 frame. @param {number} w @param {number} h @param {number} [components] */
export function jpeg(w, h, components = 3) {
  const b = new Uint8Array(2 + 4 + 16 + 12);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  const sof = 2 + 4 + 14;
  b.set([0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, components], sof);
  return b;
}

/** @param {Uint8Array[]} parts */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

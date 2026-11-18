// Browser-safe file encoders for the studio page (no Buffer, no zlib): a 16-bit PCM WAV
// and a ZIP of stored (uncompressed) entries, so the page can hand over every stem in one
// download. render.mjs's encodeWav writes the same WAV bytes in Node (files.test.mjs checks).

export function wavBytes({ rate, channels }) {
  const n = channels[0].length, c = channels.length, b = new DataView(new ArrayBuffer(44 + n * c * 2));
  const s = (o, t) => [...t].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)));
  s(0, 'RIFF'); b.setUint32(4, 36 + n * c * 2, true); s(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true);
  b.setUint16(22, c, true); b.setUint32(24, rate, true); b.setUint32(28, rate * c * 2, true); b.setUint16(32, c * 2, true); b.setUint16(34, 16, true);
  s(36, 'data'); b.setUint32(40, n * c * 2, true);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.setInt16(44 + (i * c + k) * 2, Math.max(-32768, Math.min(32767, Math.round(channels[k][i] * 32767))), true);
  return new Uint8Array(b.buffer);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, bytes: Uint8Array }]. Stored entries (method 0): WAV audio barely compresses
// with deflate and every unzip tool and DAW import reads stored entries. The fixed DOS date
// (1980-01-01 00:00) keeps the archive byte-identical for the same stems.
export function zipStored(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const nm = enc.encode(name);
    const crc = crc32(bytes);
    if (bytes.length >= 0xffffffff || offset >= 0xffffffff) throw new Error('stems too large for a ZIP without ZIP64; render a shorter piece');
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); head.setUint16(10, 0, true); head.setUint16(12, 0x21, true);
    head.setUint32(14, crc, true); head.setUint32(18, bytes.length, true); head.setUint32(22, bytes.length, true);
    head.setUint16(26, nm.length, true); head.setUint16(28, 0, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, bytes.length, true); cd.setUint32(24, bytes.length, true);
    cd.setUint16(28, nm.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(head.buffer), nm, bytes);
    central.push(new Uint8Array(cd.buffer), nm);
    offset += 30 + nm.length + bytes.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

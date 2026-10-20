// @ts-check
// A minimal ZIP writer, enough for EPUB: entries in the order given, each
// either stored or deflated by a caller-supplied raw-deflate function (Node's
// zlib.deflateRawSync in the CLI; none in the browser, where entries are
// stored, which is valid ZIP and valid EPUB). Pure and browser-safe.

import { crc32 } from './util.mjs';

/**
 * @typedef {{name: string, data: Uint8Array|string, store?: boolean}} ZipEntry
 * @param {ZipEntry[]} entries
 * @param {{deflateRaw?: (data: Uint8Array) => Uint8Array, date?: Date}} [opts]
 * @returns {Uint8Array}
 */
export function buildZip(entries, opts = {}) {
  const enc = new TextEncoder();
  const d = opts.date ?? new Date(Date.UTC(2020, 0, 1));
  const dosTime = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const dosDate = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const chunks = /** @type {Uint8Array[]} */ ([]);
  const central = /** @type {Uint8Array[]} */ ([]);
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(raw);
    let body = raw, method = 0;
    if (!e.store && opts.deflateRaw) {
      const z = opts.deflateRaw(raw);
      if (z.length < raw.length) { body = z; method = 8; }
    }
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    chunks.push(local, body);
    central.push(cen);
    offset += local.length + body.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/**
 * Lists a ZIP's entries from its central directory (for checks and tests).
 * @param {Uint8Array} b
 * @returns {{name: string, method: number, offset: number, compressedSize: number, size: number}[]}
 */
export function listZip(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-central-directory record)');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    const nameLen = v.getUint16(p + 28, true);
    out.push({
      name: dec.decode(b.subarray(p + 46, p + 46 + nameLen)),
      method: v.getUint16(p + 10, true),
      compressedSize: v.getUint32(p + 20, true),
      size: v.getUint32(p + 24, true),
      offset: v.getUint32(p + 42, true),
    });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

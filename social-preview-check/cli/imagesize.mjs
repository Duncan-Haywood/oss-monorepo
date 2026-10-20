// Reads a PNG, JPEG, GIF or WebP image's width and height straight out of
// its own file header -- no decoding, no dependency, and (paired with
// probe.mjs) no need to download the whole file: every format below puts
// its dimensions within the first few dozen bytes, which is the whole
// reason a partial fetch is enough.
//
// Pure function, no I/O -- takes a Buffer (or Uint8Array) that may be
// truncated (a partial fetch, or a caller testing a hand-built fixture) and
// never throws. `incomplete: true` distinguishes "not enough bytes were
// available to find the dimension field yet" from "this isn't a format we
// decode" (null format) -- a caller that wants to retry with more bytes can
// tell the two apart.

function isPng(buf) {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  );
}

function pngSize(buf) {
  if (buf.length < 24) return { format: 'png', width: null, height: null, incomplete: true };
  return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), incomplete: false };
}

function isJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// Markers with no following length field.
const NO_LENGTH_MARKERS = new Set([0xd8, 0xd9, 0x01]);
function isRestartMarker(marker) {
  return marker >= 0xd0 && marker <= 0xd7;
}
// Start-Of-Frame markers that carry width/height. 0xc4 (DHT), 0xc8 (JPG
// extension, unused), 0xcc (DAC) are excluded even though they fall in the
// 0xc0-0xcf range -- they are not SOF markers.
function isSofMarker(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpegSize(buf) {
  let offset = 2; // past the SOI marker (FF D8)
  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1; // resync -- not expected in a well-formed file, but never loop forever
      continue;
    }
    // A run of 0xFF fill bytes may precede the real marker byte.
    let markerOffset = offset + 1;
    while (markerOffset < buf.length && buf[markerOffset] === 0xff) markerOffset += 1;
    if (markerOffset >= buf.length) break;
    const marker = buf[markerOffset];
    offset = markerOffset + 1;

    if (NO_LENGTH_MARKERS.has(marker) || isRestartMarker(marker)) continue;
    if (offset + 2 > buf.length) break;
    const segmentLength = buf.readUInt16BE(offset);

    if (isSofMarker(marker)) {
      if (offset + 7 > buf.length) return { format: 'jpeg', width: null, height: null, incomplete: true };
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      return { format: 'jpeg', width, height, incomplete: false };
    }
    offset += segmentLength; // segmentLength includes its own 2 length bytes
  }
  return { format: 'jpeg', width: null, height: null, incomplete: true };
}

function isGif(buf) {
  if (buf.length < 6) return false;
  const header = buf.toString('ascii', 0, 6);
  return header === 'GIF87a' || header === 'GIF89a';
}

function gifSize(buf) {
  if (buf.length < 10) return { format: 'gif', width: null, height: null, incomplete: true };
  return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), incomplete: false };
}

function isWebp(buf) {
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  );
}

function webpSize(buf) {
  if (buf.length < 16) return { format: 'webp', width: null, height: null, incomplete: true };
  const fourCc = buf.toString('ascii', 12, 16);

  if (fourCc === 'VP8X') {
    // Extended format: offset 16-19 is the chunk size, then a 1-byte flags
    // field, 3 reserved bytes, and two 24-bit little-endian
    // canvas-size-minus-one fields.
    if (buf.length < 30) return { format: 'webp', width: null, height: null, incomplete: true };
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { format: 'webp', width, height, incomplete: false };
  }

  if (fourCc === 'VP8L') {
    // Lossless: 1-byte signature (0x2f) at offset 20, then a 4-byte
    // little-endian bitstream packing two 14-bit dimensions-minus-one.
    if (buf.length < 25) return { format: 'webp', width: null, height: null, incomplete: true };
    if (buf[20] !== 0x2f) return { format: 'webp', width: null, height: null, incomplete: true };
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    const width = 1 + (b0 | ((b1 & 0x3f) << 8));
    const height = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
    return { format: 'webp', width, height, incomplete: false };
  }

  if (fourCc === 'VP8 ') {
    // Lossy: chunk data starts at offset 20, a 3-byte frame tag, then the
    // fixed 3-byte start code 9d 01 2a, then two 16-bit little-endian
    // fields whose low 14 bits are the dimension (top 2 bits are a scale
    // factor this tool ignores, same as every other reader of this format).
    if (buf.length < 30) return { format: 'webp', width: null, height: null, incomplete: true };
    if (!(buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a)) {
      return { format: 'webp', width: null, height: null, incomplete: true };
    }
    const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
    const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
    return { format: 'webp', width, height, incomplete: false };
  }

  return { format: 'webp', width: null, height: null, incomplete: true };
}

/**
 * @param {Buffer|Uint8Array} buffer - the first bytes of an image file; does
 *   not need to be the whole file.
 * @returns {{format: 'png'|'jpeg'|'gif'|'webp', width: number|null,
 *   height: number|null, incomplete: boolean} | null} null when the bytes
 *   don't match any signature this tool recognises at all.
 */
export function detectImageSize(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (isPng(buf)) return pngSize(buf);
  if (isJpeg(buf)) return jpegSize(buf);
  if (isGif(buf)) return gifSize(buf);
  if (isWebp(buf)) return webpSize(buf);
  return null;
}

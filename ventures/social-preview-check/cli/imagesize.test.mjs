import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageSize } from './imagesize.mjs';

// --- fixture builders: hand-assembled minimal file headers ----------------

function buildPng(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  buf.writeUInt32BE(13, 8); // IHDR chunk length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function buildJpeg(width, height, sofMarker = 0xc0) {
  const app0Payload = Buffer.alloc(14, 0);
  const app0Len = app0Payload.length + 2;
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, (app0Len >> 8) & 0xff, app0Len & 0xff]), app0Payload]);

  const sofPayload = Buffer.alloc(15, 0);
  sofPayload[0] = 8; // precision
  sofPayload.writeUInt16BE(height, 1);
  sofPayload.writeUInt16BE(width, 3);
  sofPayload[5] = 3; // component count
  const sofLen = sofPayload.length + 2;
  const sof = Buffer.concat([Buffer.from([0xff, sofMarker, (sofLen >> 8) & 0xff, sofLen & 0xff]), sofPayload]);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function buildGif(width, height, version = 'GIF89a') {
  const buf = Buffer.alloc(13);
  buf.write(version, 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function buildWebpVp8x(width, height) {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  const w1 = width - 1, h1 = height - 1;
  buf[24] = w1 & 0xff; buf[25] = (w1 >> 8) & 0xff; buf[26] = (w1 >> 16) & 0xff;
  buf[27] = h1 & 0xff; buf[28] = (h1 >> 8) & 0xff; buf[29] = (h1 >> 16) & 0xff;
  return buf;
}

function buildWebpVp8l(width, height) {
  const w1 = width - 1, h1 = height - 1;
  const b0 = w1 & 0xff;
  const b1 = ((w1 >> 8) & 0x3f) | ((h1 & 0x3) << 6);
  const b2 = (h1 >> 2) & 0xff;
  const b3 = (h1 >> 10) & 0x0f;
  const buf = Buffer.alloc(25);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(17, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(5, 16);
  buf[20] = 0x2f;
  buf[21] = b0; buf[22] = b1; buf[23] = b2; buf[24] = b3;
  return buf;
}

function buildWebpVp8Lossy(width, height) {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a;
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

// --- tests -----------------------------------------------------------------

test('detects PNG dimensions', () => {
  const size = detectImageSize(buildPng(1200, 630));
  assert.deepEqual(size, { format: 'png', width: 1200, height: 630, incomplete: false });
});

test('PNG with too few bytes is incomplete, not a crash', () => {
  const size = detectImageSize(buildPng(1200, 630).subarray(0, 20));
  assert.deepEqual(size, { format: 'png', width: null, height: null, incomplete: true });
});

test('detects baseline JPEG (SOF0) dimensions', () => {
  const size = detectImageSize(buildJpeg(300, 157));
  assert.deepEqual(size, { format: 'jpeg', width: 300, height: 157, incomplete: false });
});

test('detects progressive JPEG (SOF2) dimensions', () => {
  const size = detectImageSize(buildJpeg(1200, 628, 0xc2));
  assert.deepEqual(size, { format: 'jpeg', width: 1200, height: 628, incomplete: false });
});

test('JPEG with only the SOI marker is incomplete, not a crash', () => {
  const size = detectImageSize(Buffer.from([0xff, 0xd8, 0xff]));
  assert.equal(size.format, 'jpeg');
  assert.equal(size.incomplete, true);
});

test('detects GIF87a and GIF89a dimensions', () => {
  assert.deepEqual(detectImageSize(buildGif(100, 200, 'GIF87a')), { format: 'gif', width: 100, height: 200, incomplete: false });
  assert.deepEqual(detectImageSize(buildGif(100, 200, 'GIF89a')), { format: 'gif', width: 100, height: 200, incomplete: false });
});

test('detects WebP VP8X (extended) dimensions', () => {
  assert.deepEqual(detectImageSize(buildWebpVp8x(1200, 630)), { format: 'webp', width: 1200, height: 630, incomplete: false });
});

test('detects WebP VP8L (lossless) dimensions', () => {
  assert.deepEqual(detectImageSize(buildWebpVp8l(1200, 630)), { format: 'webp', width: 1200, height: 630, incomplete: false });
});

test('detects WebP VP8 (lossy) dimensions', () => {
  assert.deepEqual(detectImageSize(buildWebpVp8Lossy(300, 157)), { format: 'webp', width: 300, height: 157, incomplete: false });
});

test('WebP with an unrecognised chunk fourCC is incomplete, not a guess', () => {
  const buf = Buffer.alloc(20);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('XXXX', 12, 'ascii');
  const size = detectImageSize(buf);
  assert.equal(size.format, 'webp');
  assert.equal(size.incomplete, true);
});

test('returns null for bytes matching no known signature', () => {
  assert.equal(detectImageSize(Buffer.from('not an image, just text')), null);
});

test('returns null for empty or too-short input, never throws', () => {
  assert.equal(detectImageSize(Buffer.alloc(0)), null);
  assert.equal(detectImageSize(null), null);
  assert.equal(detectImageSize(undefined), null);
});

test('accepts a plain Uint8Array, not only a Buffer', () => {
  const png = buildPng(50, 60);
  const size = detectImageSize(new Uint8Array(png));
  assert.deepEqual(size, { format: 'png', width: 50, height: 60, incomplete: false });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, orientationOf, readImageInfo } from './image.mjs';

// Building the headers by hand rather than committing binary fixtures: every
// field this module reads is set explicitly here, so a test that fails names
// the byte that changed instead of "the fixture".

function crcPlaceholder() {
  return [0, 0, 0, 0];
}

function chunk(type, data) {
  const len = data.length;
  return [
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    ...crcPlaceholder(),
  ];
}

function png({ width, height, bitDepth = 8, colorType = 2, interlace = 0, trns = false } = {}) {
  const ihdr = chunk('IHDR', [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    bitDepth, colorType, 0, 0, interlace,
  ]);
  const rest = trns ? chunk('tRNS', [0, 0]) : [];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...ihdr, ...rest, ...chunk('IDAT', [0, 0, 0, 0]),
  ]);
}

function jpeg({ width, height, marker = 0xc0, components = 3 } = {}) {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    ...[...'JFIF\0'].map((c) => c.charCodeAt(0)),
    1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, marker, 0x00, 0x11, 8,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    components, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
    0xff, 0xda,
  ]);
}

test('reads PNG dimensions from IHDR', () => {
  const info = readImageInfo(png({ width: 1290, height: 2796 }));
  assert.equal(info.format, 'png');
  assert.equal(info.width, 1290);
  assert.equal(info.height, 2796);
  assert.equal(info.error, undefined);
});

test('detects an alpha channel from the PNG colour type', () => {
  assert.equal(readImageInfo(png({ width: 1024, height: 1024, colorType: 6 })).hasAlphaChannel, true);
  assert.equal(readImageInfo(png({ width: 1024, height: 1024, colorType: 4 })).hasAlphaChannel, true);
  assert.equal(readImageInfo(png({ width: 1024, height: 1024, colorType: 2 })).hasAlphaChannel, false);
  assert.equal(readImageInfo(png({ width: 1024, height: 1024, colorType: 0 })).hasAlphaChannel, false);
});

test('a tRNS chunk counts as transparency even without an alpha channel', () => {
  // Palette PNGs (colour type 3) have no alpha channel but are routinely made
  // transparent this way, and the store counts that the same. Missing it would
  // pass exactly the icon the store is about to reject.
  const info = readImageInfo(png({ width: 1024, height: 1024, colorType: 3, trns: true }));
  assert.equal(info.hasAlphaChannel, false);
  assert.equal(info.hasTransparencyChunk, true);
  assert.equal(info.hasTransparency, true);
});

test('reads PNG interlace flag and bit depth', () => {
  const laced = readImageInfo(png({ width: 100, height: 100, interlace: 1, bitDepth: 16 }));
  assert.equal(laced.interlaced, true);
  assert.equal(laced.bitDepth, 16);
  assert.equal(readImageInfo(png({ width: 100, height: 100 })).interlaced, false);
});

test('reads JPEG dimensions out of the SOF segment', () => {
  const info = readImageInfo(jpeg({ width: 1242, height: 2208 }));
  assert.equal(info.format, 'jpeg');
  assert.equal(info.width, 1242);
  assert.equal(info.height, 2208);
  assert.equal(info.hasTransparency, false);
});

test('finds a progressive JPEG frame header too', () => {
  const info = readImageInfo(jpeg({ width: 800, height: 600, marker: 0xc2 }));
  assert.equal(info.width, 800);
  assert.equal(info.progressive, true);
});

test('does not mistake a DHT segment for a frame header', () => {
  // 0xC4 sits inside the SOFn marker range but is a Huffman table. Reading it
  // as a frame yields plausible-looking garbage dimensions, which is worse
  // than an error.
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc4, 0x00, 0x08, 1, 2, 3, 4, 5, 6,
    0xff, 0xc0, 0x00, 0x11, 8, 0x04, 0x00, 0x03, 0x00, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
  ]);
  const info = readImageInfo(bytes);
  assert.equal(info.width, 768);
  assert.equal(info.height, 1024);
});

test('identifies formats a store will not accept, by their bytes', () => {
  const heic = new Uint8Array([
    0, 0, 0, 0x20, ...[...'ftypheic'].map((c) => c.charCodeAt(0)),
    0, 0, 0, 0, ...[...'heic'].map((c) => c.charCodeAt(0)),
  ]);
  assert.equal(detectFormat(heic), 'heic');

  const webp = new Uint8Array([
    ...[...'RIFF'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0,
    ...[...'WEBPVP8 '].map((c) => c.charCodeAt(0)),
  ]);
  assert.equal(detectFormat(webp), 'webp');

  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectFormat(gif), 'gif');
});

test('a HEIC renamed to .png is still reported as HEIC', () => {
  // The whole point of reading magic bytes: the extension is the thing that
  // lied, so it is never consulted.
  const heic = new Uint8Array([
    0, 0, 0, 0x20, ...[...'ftypmif1'].map((c) => c.charCodeAt(0)),
    0, 0, 0, 0, ...[...'mif1'].map((c) => c.charCodeAt(0)),
  ]);
  const info = readImageInfo(heic);
  assert.equal(info.format, 'heic');
  assert.match(info.error, /not readable without decoding/);
});

test('reports unreadable bytes rather than guessing a size', () => {
  const info = readImageInfo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
  assert.equal(info.format, 'unknown');
  assert.ok(info.error);
  assert.equal(info.width, undefined);
});

test('handles a truncated PNG without throwing', () => {
  const info = readImageInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
  assert.match(info.error, /truncated|malformed/);
});

test('orientationOf classifies the three shapes', () => {
  assert.equal(orientationOf({ width: 1290, height: 2796 }), 'portrait');
  assert.equal(orientationOf({ width: 2796, height: 1290 }), 'landscape');
  assert.equal(orientationOf({ width: 1024, height: 1024 }), 'square');
  assert.equal(orientationOf({}), 'unknown');
});

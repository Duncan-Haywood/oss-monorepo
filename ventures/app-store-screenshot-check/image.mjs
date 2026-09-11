// Read an image's shape out of its own header bytes -- format, pixel
// dimensions, bit depth, whether it carries an alpha channel, and whether a
// PNG is interlaced -- with no dependencies and without decoding a single
// pixel.
//
// WHY IT PARSES HEADERS RATHER THAN DECODING
//
// Every property this tool checks lives in the first few dozen bytes of the
// file. Decoding would mean either a native image library (so: an install
// step, and a CLI that cannot be dropped into a CI job as three files) or
// `<canvas>` in the browser -- and canvas is the wrong instrument twice over.
// It cannot tell an opaque RGBA image from an RGB one, because it hands back
// RGBA either way, and "does this PNG declare an alpha channel?" is exactly
// the question App Store Connect asks of an app icon. The declaration is in
// the IHDR colour type, not in the pixels, so the header is not an
// approximation of the answer here -- it *is* the answer.
//
// Everything below works on a Uint8Array, so the same code runs against
// `fs.readFileSync` in the CLI and a `File.arrayBuffer()` in the browser.

/** Formats a store will accept, and the ones that get mistaken for them. */
const SIGNATURES = [
  { format: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { format: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: 'bmp', bytes: [0x42, 0x4d] },
  { format: 'tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { format: 'tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { format: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

const startsWith = (bytes, sig, offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes, offset, length) => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
};

const u32be = (bytes, offset) =>
  ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];

const u16be = (bytes, offset) => (bytes[offset] << 8) + bytes[offset + 1];

/**
 * Detect the container format from magic bytes alone.
 *
 * The filename extension is deliberately not consulted. A `.png` that is
 * really a HEIC (the single most common way a macOS or iPhone screenshot
 * reaches an upload as the wrong format -- Preview and Photos will happily
 * rename without converting) has to be caught by its bytes, because the name
 * is precisely the thing that lied.
 */
export function detectFormat(bytes) {
  if (!bytes || bytes.length < 12) return 'unknown';
  for (const { format, bytes: sig } of SIGNATURES) {
    if (startsWith(bytes, sig)) return format;
  }
  // JPEG: SOI marker, then any number of segments.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // ISO base media file format: a `ftyp` box whose brand names the flavour.
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis|hevm|hevs)$/.test(brand)) return 'heic';
    if (brand === 'avif' || brand === 'avis') return 'avif';
    return 'iso-media';
  }
  // WebP: RIFF container with a WEBP fourcc.
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return 'unknown';
}

/**
 * PNG. Dimensions, bit depth, colour type and interlace all live in IHDR,
 * which the spec requires to be the first chunk; `tRNS` may appear later and
 * adds transparency to a colour type that has no alpha channel of its own,
 * which App Store Connect counts as transparency just the same.
 */
function readPng(bytes) {
  if (bytes.length < 33) return { error: 'truncated PNG: no IHDR' };
  if (ascii(bytes, 12, 4) !== 'IHDR') return { error: 'malformed PNG: first chunk is not IHDR' };

  const colorType = bytes[25];
  const info = {
    format: 'png',
    width: u32be(bytes, 16),
    height: u32be(bytes, 20),
    bitDepth: bytes[24],
    colorType,
    // Colour type 4 is greyscale+alpha, 6 is truecolour+alpha. Types 0, 2 and
    // 3 have no alpha channel -- but 3 (palette) and the others can still be
    // made transparent by a tRNS chunk, handled below.
    hasAlphaChannel: colorType === 4 || colorType === 6,
    interlaced: bytes[28] === 1,
    hasTransparencyChunk: false,
  };

  // Walk the chunk list for tRNS. Stop at IDAT: anything after the first image
  // data chunk cannot be a tRNS (the spec requires tRNS to precede IDAT), and
  // walking a multi-megabyte IDAT run buys nothing.
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === 'tRNS') {
      info.hasTransparencyChunk = true;
      break;
    }
    if (type === 'IDAT' || type === 'IEND') break;
    // A corrupt length would otherwise spin or run off the end.
    if (!Number.isFinite(length) || length < 0) break;
    offset += 12 + length;
  }

  info.hasTransparency = info.hasAlphaChannel || info.hasTransparencyChunk;
  return info;
}

/**
 * JPEG. Dimensions live in whichever Start Of Frame marker the encoder used,
 * so the segment list has to be walked rather than read at a fixed offset.
 * JPEG has no alpha channel in any baseline or progressive form, which is
 * itself a useful fact: "convert it to JPEG" is the standard fix for an icon
 * rejected for transparency.
 */
function readJpeg(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // Resynchronise over fill bytes rather than giving up.
      continue;
    }
    const marker = bytes[offset + 1];
    // Standalone markers: no length field follows, so do not try to skip one.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI, or start of scan.
    const length = u16be(bytes, offset + 2);
    // SOF0/1/2/3, SOF5-7, SOF9-11, SOF13-15 all carry the frame header.
    // C4 (DHT), C8 (reserved) and CC (DAC) share the range but are not frames.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        format: 'jpeg',
        height: u16be(bytes, offset + 5),
        width: u16be(bytes, offset + 7),
        bitDepth: bytes[offset + 4],
        components: bytes[offset + 9],
        progressive: marker === 0xc2,
        hasAlphaChannel: false,
        hasTransparencyChunk: false,
        hasTransparency: false,
      };
    }
    if (length < 2) break; // Corrupt: a segment cannot be shorter than its own length field.
    offset += 2 + length;
  }
  return { error: 'malformed JPEG: no Start Of Frame segment found' };
}

/**
 * Read what can be known about an image from its header bytes.
 *
 * Returns `{ format, width, height, ... }` on success, or `{ format, error }`
 * when the bytes are not a format this can measure. An unreadable file is
 * reported, never guessed at: a caller that cannot see the dimensions must be
 * told so rather than handed a zero it might compare against a spec.
 */
export function readImageInfo(bytes) {
  const format = detectFormat(bytes);
  if (format === 'png') return readPng(bytes);
  if (format === 'jpeg') return readJpeg(bytes);
  return {
    format,
    error:
      format === 'unknown'
        ? 'unrecognised image format (not PNG or JPEG)'
        : `${format.toUpperCase()} dimensions are not readable without decoding; this tool measures PNG and JPEG`,
  };
}

/** Portrait, landscape, or square -- the shape a store groups a set by. */
export function orientationOf({ width, height }) {
  if (!width || !height) return 'unknown';
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

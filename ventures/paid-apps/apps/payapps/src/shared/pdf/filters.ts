// Byte filters for the packet builder: zlib inflate/deflate through the platform's own
// DecompressionStream/CompressionStream (Workers and Node both have them, so no dependency), the
// PNG row predictors shared by PNG images and PDF cross-reference streams, and the other standard
// PDF filters that carry non-image data (ISO 32000-1 section 7.4): ASCIIHexDecode, ASCII85Decode,
// LZWDecode and RunLengthDecode, plus the TIFF predictor 2. Older drivers, Ghostscript's PostScript
// conversions and some scanner and accounting exports write content and object streams with these.
// Every decoder stops past a byte limit, so a small hostile stream cannot exhaust memory.

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>) {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = await new Response(source.pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

/** Most bytes one inflate may produce, so a small "zip bomb" stream cannot exhaust memory. */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

export class InflateLimitError extends Error {}

/** zlib (RFC 1950) inflate, as PDF's FlateDecode and PNG's IDAT use; stops past `maxBytes`. */
export async function inflate(bytes: Uint8Array, maxBytes = MAX_INFLATED_BYTES) {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source
    .pipeThrough(new DecompressionStream("deflate") as TransformStream<Uint8Array, Uint8Array>)
    .getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new InflateLimitError(`decompresses to more than ${maxBytes} bytes`);
    }
    parts.push(value);
  }
  return concatBytes(parts);
}

/** zlib (RFC 1950) deflate. */
export const deflate = (bytes: Uint8Array) =>
  pipe(bytes, new CompressionStream("deflate") as TransformStream<Uint8Array, Uint8Array>);

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/**
 * Reverses PNG row filters (types 0-4; PNG and PDF predictors 10-15, where each row starts with its
 * filter byte). `bytesPerPixel` is at least 1; `rowBytes` excludes the filter byte. Returns the rows
 * without filter bytes. A short final row is dropped; an unknown filter type throws.
 */
export function unfilterPngRows(data: Uint8Array, rowBytes: number, bytesPerPixel: number) {
  const stride = rowBytes + 1;
  const rows = Math.floor(data.length / stride);
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const type = data[r * stride] as number;
    const src = r * stride + 1;
    const dst = r * rowBytes;
    const prev = dst - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i] as number;
      const a = i >= bytesPerPixel ? (out[dst + i - bytesPerPixel] as number) : 0;
      const b = r > 0 ? (out[prev + i] as number) : 0;
      const c = r > 0 && i >= bytesPerPixel ? (out[prev + i - bytesPerPixel] as number) : 0;
      let v: number;
      switch (type) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4:
          v = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG row filter ${type}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
}

/** Concatenates byte arrays. */
export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Raised by a decoder on data its filter cannot have produced. */
export class FilterDataError extends Error {}

const limitError = (maxBytes: number) =>
  new InflateLimitError(`decompresses to more than ${maxBytes} bytes`);

/** A growable byte buffer that refuses to pass `maxBytes`. */
class ByteSink {
  private buf: Uint8Array;
  length = 0;
  constructor(
    private readonly maxBytes: number,
    initial: number,
  ) {
    this.buf = new Uint8Array(Math.max(16, Math.min(initial, maxBytes)));
  }
  private reserve(n: number) {
    const need = this.length + n;
    if (need > this.maxBytes) throw limitError(this.maxBytes);
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(Math.min(size, this.maxBytes));
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  push(b: number) {
    this.reserve(1);
    this.buf[this.length++] = b;
  }
  pushAll(bytes: Uint8Array) {
    this.reserve(bytes.length);
    this.buf.set(bytes, this.length);
    this.length += bytes.length;
  }
  /** Appends `count` copies of `b`. */
  fill(b: number, count: number) {
    this.reserve(count);
    this.buf.fill(b, this.length, this.length + count);
    this.length += count;
  }
  bytes() {
    return this.buf.slice(0, this.length);
  }
}

// PDF white-space characters (ISO 32000-1 table 1): NUL, HT, LF, FF, CR and space.
const isPdfWhite = (c: number) =>
  c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;

const hexValue = (c: number) =>
  c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;

/**
 * ASCIIHexDecode (7.4.2): pairs of hex digits, white space ignored, ">" ends the data, and an odd
 * final digit is followed by an implied 0.
 */
export function asciiHexDecode(data: Uint8Array, maxBytes = MAX_INFLATED_BYTES) {
  const out = new ByteSink(maxBytes, data.length >> 1);
  let high = -1;
  for (const c of data) {
    if (c === 62) break; // ">"
    if (isPdfWhite(c)) continue;
    const v = hexValue(c);
    if (v < 0) throw new FilterDataError(`bad ASCIIHex digit ${c}`);
    if (high < 0) high = v;
    else {
      out.push((high << 4) | v);
      high = -1;
    }
  }
  if (high >= 0) out.push(high << 4);
  return out.bytes();
}

/**
 * ASCII85Decode (7.4.3): groups of five characters "!" to "u" for four bytes, "z" for four zero
 * bytes, white space ignored, "~>" ends the data, and a final group of n characters (2 to 4) gives
 * n - 1 bytes. A leading "<~", which PostScript writes and PDF does not, is skipped.
 */
export function ascii85Decode(data: Uint8Array, maxBytes = MAX_INFLATED_BYTES) {
  const out = new ByteSink(maxBytes, Math.ceil((data.length * 4) / 5));
  let i = 0;
  while (i < data.length && isPdfWhite(data[i] as number)) i++;
  if (data[i] === 60 && data[i + 1] === 126) i += 2; // "<~"
  const group: number[] = [];
  const flush = (n: number) => {
    // n characters given; pad with "u" (84) to five.
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + (k < n ? (group[k] as number) : 84);
    if (v > 0xffffffff) throw new FilterDataError("ASCII85 group out of range");
    const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    for (let k = 0; k < n - 1; k++) out.push(bytes[k] as number);
    group.length = 0;
  };
  for (; i < data.length; i++) {
    const c = data[i] as number;
    if (c === 126) break; // "~" of "~>"
    if (isPdfWhite(c)) continue;
    if (c === 122) {
      // "z"
      if (group.length) throw new FilterDataError("ASCII85 z inside a group");
      out.fill(0, 4);
      continue;
    }
    if (c < 33 || c > 117) throw new FilterDataError(`bad ASCII85 character ${c}`);
    group.push(c - 33);
    if (group.length === 5) flush(5);
  }
  if (group.length === 1) throw new FilterDataError("ASCII85 final group of one character");
  if (group.length) flush(group.length);
  return out.bytes();
}

/**
 * LZWDecode (7.4.4): variable-length codes of 9 to 12 bits, most significant bit first; 256 clears
 * the table and 257 ends the data. With `earlyChange` 1 (the default) the code length grows one
 * code early, as TIFF and PDF writers do; 0 grows it when the table is full.
 */
export function lzwDecode(data: Uint8Array, earlyChange = 1, maxBytes = MAX_INFLATED_BYTES) {
  const out = new ByteSink(maxBytes, data.length * 2);
  // The table as (prefix code, last byte, length) so each entry costs three numbers, and a code is
  // written out by walking its prefixes backwards.
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let k = 0; k < 256; k++) {
    prefix[k] = -1;
    suffix[k] = k;
    length[k] = 1;
  }
  let next = 258;
  let codeLen = 9;
  let prev = -1;
  let bitBuf = 0;
  let bitCount = 0;
  let pos = 0;
  const scratch = new Uint8Array(4096);
  const emit = (code: number) => {
    const n = length[code] as number;
    let c = code;
    for (let k = n - 1; k >= 0; k--) {
      scratch[k] = suffix[c] as number;
      c = prefix[c] as number;
    }
    out.pushAll(scratch.subarray(0, n));
    return scratch[0] as number;
  };
  for (;;) {
    while (bitCount < codeLen) {
      if (pos >= data.length) return out.bytes(); // ran out without 257: keep what was decoded
      bitBuf = ((bitBuf << 8) | (data[pos++] as number)) & 0xffffff;
      bitCount += 8;
    }
    const code = (bitBuf >>> (bitCount - codeLen)) & ((1 << codeLen) - 1);
    bitCount -= codeLen;
    if (code === 256) {
      next = 258;
      codeLen = 9;
      prev = -1;
      continue;
    }
    if (code === 257) break;
    if (prev < 0) {
      if (code > 255) throw new FilterDataError(`LZW code ${code} before any entry`);
      emit(code);
      prev = code;
      continue;
    }
    let first: number;
    if (code < next) {
      first = emit(code);
    } else if (code === next) {
      // The KwKwK case: the new entry is the previous string plus its own first byte.
      const p = emit(prev);
      out.push(p);
      first = p;
    } else {
      throw new FilterDataError(`LZW code ${code} past the table (${next})`);
    }
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      length[next] = (length[prev] as number) + 1;
      next++;
    }
    prev = code;
    const grow = next + earlyChange;
    if (grow >= 4096) codeLen = 12;
    else if (grow >= 2048) codeLen = 12;
    else if (grow >= 1024) codeLen = 11;
    else if (grow >= 512) codeLen = 10;
    else codeLen = 9;
  }
  return out.bytes();
}

/**
 * RunLengthDecode (7.4.5): a length byte 0-127 copies the next 1-128 bytes, 129-255 repeats the
 * next byte 2-128 times, and 128 ends the data.
 */
export function runLengthDecode(data: Uint8Array, maxBytes = MAX_INFLATED_BYTES) {
  const out = new ByteSink(maxBytes, data.length * 2);
  let i = 0;
  while (i < data.length) {
    const n = data[i++] as number;
    if (n === 128) break;
    if (n < 128) {
      const end = Math.min(data.length, i + n + 1);
      out.pushAll(data.subarray(i, end));
      i = end;
    } else {
      if (i >= data.length) break;
      out.fill(data[i++] as number, 257 - n);
    }
  }
  return out.bytes();
}

/**
 * Reverses TIFF predictor 2 (horizontal differencing, 7.4.4.4): each sample is stored as its
 * difference from the sample of the same colour to its left, row by row. Supports 1, 2, 4, 8 and
 * 16 bits per component; a short final row is decoded as far as it goes.
 */
export function untiffPredictor(
  data: Uint8Array,
  colors: number,
  bitsPerComponent: number,
  columns: number,
) {
  const rowBytes = Math.ceil((colors * bitsPerComponent * columns) / 8);
  const out = data.slice();
  if (rowBytes <= 0) return out;
  if (bitsPerComponent === 8) {
    for (let r = 0; r < out.length; r += rowBytes) {
      const end = Math.min(out.length, r + rowBytes);
      for (let i = r + colors; i < end; i++)
        out[i] = ((out[i] as number) + (out[i - colors] as number)) & 0xff;
    }
    return out;
  }
  if (bitsPerComponent === 16) {
    const step = colors * 2;
    for (let r = 0; r < out.length; r += rowBytes) {
      const end = Math.min(out.length, r + rowBytes);
      for (let i = r + step; i + 1 < end; i += 2) {
        const v =
          (((out[i] as number) << 8) | (out[i + 1] as number)) +
          (((out[i - step] as number) << 8) | (out[i - step + 1] as number));
        out[i] = (v >> 8) & 0xff;
        out[i + 1] = v & 0xff;
      }
    }
    return out;
  }
  if (bitsPerComponent === 1 || bitsPerComponent === 2 || bitsPerComponent === 4) {
    const bpc = bitsPerComponent;
    const mask = (1 << bpc) - 1;
    const samplesPerRow = colors * columns;
    const get = (row: number, s: number) => {
      const bit = s * bpc;
      const byte = out[row + (bit >> 3)] as number;
      return (byte >> (8 - bpc - (bit & 7))) & mask;
    };
    const set = (row: number, s: number, v: number) => {
      const bit = s * bpc;
      const at = row + (bit >> 3);
      const shift = 8 - bpc - (bit & 7);
      out[at] = ((out[at] as number) & ~(mask << shift)) | ((v & mask) << shift);
    };
    for (let r = 0; r < out.length; r += rowBytes) {
      const samples = Math.min(samplesPerRow, Math.floor(((out.length - r) * 8) / bpc));
      for (let s = colors; s < samples; s++) set(r, s, get(r, s) + get(r, s - colors));
    }
    return out;
  }
  throw new FilterDataError(`TIFF predictor with ${bitsPerComponent} bits per component`);
}

// Ported from apps/payapps/src/shared/pdf/filters.ts (same repository and owner): zlib inflate/deflate
// through the platform's DecompressionStream/CompressionStream (Workers and Node both have them, so no
// dependency) and the PNG row predictors. Only what the quote PDF's logo needs (lib/pdf-image.ts).

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

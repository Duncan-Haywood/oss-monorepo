// FlateDecode via Node's built-in zlib -- no dependency to install. Tries a
// standard zlib-wrapped stream first, then raw deflate (some PDF writers
// omit the two-byte zlib header), and returns null rather than throwing so
// a garbled or encrypted stream reads as "could not be checked" instead of
// crashing the whole scan.
import zlib from 'node:zlib';

export async function inflate(bytes) {
  const buf = Buffer.from(bytes);
  try {
    return new Uint8Array(zlib.inflateSync(buf));
  } catch {
    try {
      return new Uint8Array(zlib.inflateRawSync(buf));
    } catch {
      return null;
    }
  }
}

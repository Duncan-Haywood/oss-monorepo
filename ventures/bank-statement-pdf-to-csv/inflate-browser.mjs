// FlateDecode via the browser's native DecompressionStream API -- no
// dependency to install, and it never leaves the tab: the bytes go straight
// from the File the visitor chose into this stream and back, with nothing
// sent anywhere. Supported in current Chrome, Edge, Firefox, and Safari
// 16.4+. Returns null (never throws) on an unsupported browser or a stream
// that fails to inflate, which the engine treats as "could not be checked".
export async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

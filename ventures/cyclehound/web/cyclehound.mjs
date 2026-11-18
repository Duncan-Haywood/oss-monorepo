// Load cyclehound.wasm and run it on in-memory files. Works in browsers and Node.
// files: [{ path: string, text: string }] (paths relative to the folder's root)
// -> the same JSON report `cyclehound --json <folder>` prints.

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function load(source) {
  // source: a URL (browser), or bytes (Node: fs.readFileSync).
  const { instance } =
    source instanceof Uint8Array || source instanceof ArrayBuffer
      ? await WebAssembly.instantiate(source, {})
      : await WebAssembly.instantiateStreaming(fetch(source), {}).catch(async () =>
          WebAssembly.instantiate(await (await fetch(source)).arrayBuffer(), {}));
  const x = instance.exports;
  return {
    analyze(files, { types = true, dynamic = true, require = true } = {}) {
      const parts = files.map((f) => [enc.encode(f.path), enc.encode(f.text)]);
      const len = parts.reduce((n, [p, s]) => n + 8 + p.length + s.length, 0);
      const ptr = x.ch_alloc(Math.max(len, 1));
      const view = new DataView(x.memory.buffer, ptr, len);
      const bytes = new Uint8Array(x.memory.buffer, ptr, len);
      let at = 0;
      for (const [p, s] of parts) {
        view.setUint32(at, p.length, true); bytes.set(p, at + 4); at += 4 + p.length;
        view.setUint32(at, s.length, true); bytes.set(s, at + 4); at += 4 + s.length;
      }
      const flags = (types ? 0 : 1) | (dynamic ? 0 : 2) | (require ? 0 : 4);
      const out = x.ch_analyze(ptr, len, flags);
      const json = dec.decode(new Uint8Array(x.memory.buffer, out, x.ch_result_len()).slice());
      x.ch_free(ptr, Math.max(len, 1));
      return JSON.parse(json);
    },
  };
}

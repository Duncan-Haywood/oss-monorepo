// Load dupehound.wasm and run it on in-memory files. Works in browsers and Node.
// files: [{ path: string, text: string }] -> the same JSON report `dupehound --json` prints.

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
    analyze(files, { minTokens = 50, minLines = 5, normalize = false } = {}) {
      const parts = files.map((f) => [enc.encode(f.path), enc.encode(f.text)]);
      const len = parts.reduce((n, [p, s]) => n + 8 + p.length + s.length, 0);
      const ptr = x.dh_alloc(len);
      let view = new DataView(x.memory.buffer, ptr, len);
      let bytes = new Uint8Array(x.memory.buffer, ptr, len);
      let at = 0;
      for (const [p, s] of parts) {
        view.setUint32(at, p.length, true); bytes.set(p, at + 4); at += 4 + p.length;
        view.setUint32(at, s.length, true); bytes.set(s, at + 4); at += 4 + s.length;
      }
      const out = x.dh_analyze(ptr, len, minTokens, minLines, normalize ? 1 : 0);
      const json = dec.decode(new Uint8Array(x.memory.buffer, out, x.dh_result_len()).slice());
      x.dh_free(ptr, len);
      return JSON.parse(json);
    },
  };
}

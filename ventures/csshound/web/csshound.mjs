// Load csshound.wasm and judge CSS against content. Works in browsers and Node.
// analyze(css, content, { dynamic, html }) -> the JSON object `csshound --json`
// prints for a page, plus `dead`: [{ offset, selector }] for each whole rule
// that would go. With html: true, `css` is an HTML page: its <style> blocks
// are the CSS and the rest of it (plus `content`) is the content.

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
    analyze(css, content = "", { dynamic = true, html = false } = {}) {
      const a = enc.encode(css);
      const b = enc.encode(content);
      const len = 8 + a.length + b.length;
      const ptr = x.cs_alloc(len);
      const view = new DataView(x.memory.buffer, ptr, len);
      const bytes = new Uint8Array(x.memory.buffer, ptr, len);
      view.setUint32(0, a.length, true);
      bytes.set(a, 4);
      view.setUint32(4 + a.length, b.length, true);
      bytes.set(b, 8 + a.length);
      const out = x.cs_analyze(ptr, len, (dynamic ? 1 : 0) | (html ? 2 : 0));
      const json = dec.decode(new Uint8Array(x.memory.buffer, out, x.cs_result_len()).slice());
      x.cs_free(ptr, len);
      return JSON.parse(json);
    },
  };
}

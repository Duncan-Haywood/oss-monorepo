// Browser/Node loader for ifc-engine.wasm (the Rust IFC reader, no wasm-bindgen).
// `loadIfcEngine(bytesOrUrl)` -> { plan(bytes, storey), dxf(bytes, storey) }.
// plan() returns the parsed JSON (metres; storeys listed); dxf() returns DXF text in
// inches for planFromDxf. Storeys are 1-based, 0 = lowest (dxf) or all (plan).
export async function loadIfcEngine(src = new URL("./ifc-engine.wasm", import.meta.url)) {
  let bytes = src;
  if (!(src instanceof ArrayBuffer || ArrayBuffer.isView(src))) bytes = await (await fetch(src)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports;
  const dec = new TextDecoder();
  function run(fn, data, storey) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const p = x.ifc_alloc(u8.length);
    new Uint8Array(x.memory.buffer, p, u8.length).set(u8);
    try { fn(p, u8.length, storey | 0); } finally { x.ifc_dealloc(p, u8.length); }
    return dec.decode(new Uint8Array(x.memory.buffer, x.ifc_result_ptr(), x.ifc_result_len()));
  }
  return {
    plan: (data, storey = 0) => JSON.parse(run(x.ifc_plan, data, storey)),
    dxf: (data, storey = 0) => run(x.ifc_dxf, data, storey),
  };
}

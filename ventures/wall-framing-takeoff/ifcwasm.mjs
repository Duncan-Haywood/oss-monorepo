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

/**
 * `openingSize` for planFromDxf, from the engine's plan JSON. The DXF the engine
 * writes carries only each opening's place and width, so without this a window
 * that the model draws as a bare void (sill above the floor) is framed as a door
 * at the 82.5 in default. Here each opening gives its own height, its header
 * height (sill plus height) and, for a void with a sill over 2 in, kind "window".
 * Metres in the JSON become inches, matching the DXF.
 * @param {{ walls: any[] }} info the result of `plan(bytes, storey)`
 */
export function openingSizes(info) {
  const k = 1 / 0.0254, sizes = [];
  for (const w of info?.walls ?? []) {
    const L = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    if (!(L > 0)) continue;
    const ux = (w.end[0] - w.start[0]) / L, uy = (w.end[1] - w.start[1]) / L;
    for (const o of w.openings ?? []) {
      if (!(o.height > 0)) continue;
      const m = (o.from + o.to) / 2;
      const kind = o.kind === "void" ? (o.sill > 0.0508 ? "window" : "door") : undefined;
      sizes.push({ x: (w.start[0] + ux * m) * k, y: (w.start[1] + uy * m) * k, height: o.height * k, header: (o.sill + o.height) * k, kind });
    }
  }
  return (mid) => {
    let best = null, bd = 6;
    for (const q of sizes) { const d = Math.hypot(q.x - mid.x, q.y - mid.y); if (d <= bd) { bd = d; best = q; } }
    return best && { height: Math.round(best.height * 16) / 16, headerHeight: Math.round(best.header * 16) / 16, ...(best.kind ? { kind: best.kind } : {}) };
  };
}

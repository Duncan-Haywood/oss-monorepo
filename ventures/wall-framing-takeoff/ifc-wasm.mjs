// @ts-check
// The Rust IFC reader (ifc-engine/, built to ifc-engine.wasm) behind the same
// result shape as ifc.mjs: IFC text in, { ok, plan, stats, notes, errors } out.
// The wasm turns the model into centre-line walls and hosted openings (joins,
// material layers, placements and units handled there, checked against
// IfcOpenShell); planFromDxf then does what it does for every format.
// Rebuild: cd ifc-engine && cargo build --release --target wasm32-unknown-unknown
//          && cp target/wasm32-unknown-unknown/release/ifc_engine.wasm ../ifc-engine.wasm
import { planFromDxf } from "./dxf.mjs";

/** @type {Promise<any> | null} */
let inst = null;

/** Load the module once. In Node pass bytes (or nothing: read the file next to this one); in a browser it is fetched. */
export function loadIfcEngine(bytes) {
  inst ??= (async () => {
    let b = bytes;
    if (!b) {
      if (typeof process !== "undefined" && process.versions?.node) {
        const { readFile } = await import("node:fs/promises");
        b = await readFile(new URL("./ifc-engine.wasm", import.meta.url));
      } else b = await (await fetch(new URL("./ifc-engine.wasm", import.meta.url))).arrayBuffer();
    }
    return (await WebAssembly.instantiate(b, {})).instance.exports;
  })();
  return inst;
}

/** @returns {Promise<{ ok: boolean, text: string }>} */
async function run(fn, text, storey) {
  const w = await loadIfcEngine();
  const bytes = new TextEncoder().encode(text);
  const ptr = w.wfe_alloc(bytes.length);
  new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
  const code = w[fn](ptr, bytes.length, storey);
  w.wfe_free(ptr, bytes.length);
  const out = new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.wfe_result_ptr(), w.wfe_result_len()).slice());
  return { ok: code === 0, text: out };
}

/** The reader's JSON (metres), storey 0-based or -1 for all. */
export async function ifcPlanJson(text, storey = -1) {
  const r = await run("wfe_plan_json", text, storey);
  if (!r.ok) throw new Error(r.text);
  return JSON.parse(r.text);
}

/** The walls as DXF (inches), storey 0-based or -1 for all. */
export async function ifcPlanDxf(text, storey = -1) {
  const r = await run("wfe_plan_dxf", text, storey);
  if (!r.ok) throw new Error(r.text);
  return r.text;
}

/**
 * Same entry point shape as planFromIfc, async. opt.storey: 1-based number or a storey name.
 * @param {string} text
 * @param {{ storey?: number | string }} [opt]
 */
export async function planFromIfcWasm(text, opt = {}) {
  if (!/ISO-10303-21/.test(text.slice(0, 200))) return { ok: false, errors: ["This does not look like an IFC (STEP) file; it should start with ISO-10303-21. IFCZIP and IFCXML are not read."], notes: [] };
  let all;
  try { all = await ifcPlanJson(text, -1); } catch (e) { return { ok: false, errors: [`Could not read the IFC: ${/** @type {Error} */ (e).message}`], notes: [] }; }
  const notes = [`Read with the Rust IFC reader (WebAssembly): ${all.walls.length} wall${all.walls.length === 1 ? "" : "s"}, units ${all.lengthUnit}.`];
  const st = all.storeys;
  let k = -1;
  if (opt.storey != null) {
    k = typeof opt.storey === "number" ? opt.storey - 1 : st.findIndex((s) => s.name.toLowerCase() === String(opt.storey).toLowerCase());
    if (!(k >= 0 && k < st.length)) return { ok: false, errors: [`No storey ${JSON.stringify(opt.storey)}; the file has ${st.map((s) => `${s.index} = ${s.name}`).join(", ")}.`], notes };
  } else if (st.length > 1) {
    k = 0;
    notes.push(`The file has ${st.length} storeys (${st.map((s) => `${s.index} = ${s.name}`).join(", ")}); reading storey 1 (${st[0].name}) only. Floors are framed one at a time.`);
  }
  if (!all.walls.length) return { ok: false, errors: ["No IfcWall with usable geometry was found."], notes: [...notes, ...all.warnings] };
  const r = planFromDxf(await ifcPlanDxf(text, k));
  if (!r.ok) return { ...r, notes: [...notes, ...(r.notes ?? [])] };
  return { ...r, notes: [...notes, ...all.warnings.slice(0, 5), ...r.notes.filter((n) => !/units/i.test(n))] };
}

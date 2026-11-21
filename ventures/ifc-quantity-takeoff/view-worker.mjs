// Takes off the model and meshes the model view's elements off the page's
// thread (a module worker).
//
//   const w = new Worker(new URL("./view-worker.mjs", import.meta.url), { type: "module" });
//   w.postMessage({ bytes, mesh });    // the IFC file, transferred; mesh: false
//                                      // stops after the takeoff (a revision)
//   w.onmessage = ({ data }) => ...    // { takeoff, ms }, then { ready, origin,
//                                      // total }, then batches { items, done };
//                                      // or { failed, read } at any point
//
// The page used to run its own takeoff alongside this one, which froze it
// for the whole read (14 s on ARK_NUS). Now the takeoff is posted back
// instead: structured cloning copies only a row's enumerable fields, and
// the solids, world matrices and length units the mesher needs are
// non-enumerable (qto.mjs), so the page gets the plain rows (6 MB, 27 ms
// to read on ARK_NUS; eval/takeoff-worker-2026-11-21.md) while the solids
// stay here. Cloning the solids themselves took 18 s of the page's thread
// (eval/view-worker-2026-11-21.md).
//
// Each batch is [{ id, positions, normals, boxOnly, reason }] with the arrays
// transferred, not copied. A new model gets a new worker (the page
// terminates the old one), so there is nothing to cancel here.

import { parseStep } from "./step.mjs";
import { takeoff } from "./qto.mjs";
import { meshRows } from "./view-mesh.mjs";

// a batch every ~150 ms keeps the page drawing as it goes without paying a
// message per element (Mini Project has 2,636)
const BATCH_MS = 150;

self.onmessage = ({ data }) => {
  let rows, origin, posted = false;
  try {
    const t0 = performance.now();
    const model = parseStep(data.bytes);
    data.bytes = null;
    if (!model.schema) throw new Error("no FILE_SCHEMA in the header: is this an IFC file?");
    const t = takeoff(model);
    self.postMessage({ takeoff: { schema: t.schema, units: t.units, rows: t.rows }, ms: performance.now() - t0 });
    posted = true;
    if (data.mesh === false) { self.close(); return; }
    ({ rows, origin } = meshRows.prepare(t.rows));
  } catch (err) {
    // read: true says the file itself could not be read, so the page need not try it again
    self.postMessage({ failed: posted ? `could not draw the model: ${err.message}` : err.message, read: !posted });
    return;
  }
  self.postMessage({ ready: true, origin, total: rows.length });
  let items = [], transfer = [], last = performance.now();
  const flush = (done) => {
    self.postMessage({ items, done }, transfer);
    items = []; transfer = []; last = performance.now();
  };
  for (const it of meshRows(rows, origin)) {
    if (it.mesh) {
      items.push({ id: it.id, positions: it.mesh.positions, normals: it.mesh.normals, boxOnly: !!it.mesh.boxOnly, reason: it.mesh.reason ?? null });
      transfer.push(it.mesh.positions.buffer, it.mesh.normals.buffer);
    }
    if (performance.now() - last > BATCH_MS) flush(false);
  }
  flush(true);
};

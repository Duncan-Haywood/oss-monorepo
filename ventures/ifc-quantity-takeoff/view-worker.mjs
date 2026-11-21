// Meshes the model view's elements off the page's thread (a module worker).
//
//   const w = new Worker(new URL("./view-worker.mjs", import.meta.url), { type: "module" });
//   w.postMessage({ bytes });          // the IFC file, transferred
//   w.onmessage = ({ data }) => ...    // { ready, origin, total }, then batches
//                                      // { items, done }, or { failed }
//
// The worker reads and takes off the file itself rather than being sent the
// page's takeoff: structured-cloning the solids of a 56 MB model took 18 s
// of the page's own thread (eval/view-worker-2026-11-21.md), longer than the
// meshing it was meant to move off it, while reading the bytes again here
// runs alongside the page's own reading. The takeoff is deterministic, so
// the ids and the origin match the page's.
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
  let rows, origin;
  try {
    const t = takeoff(parseStep(data.bytes));
    ({ rows, origin } = meshRows.prepare(t.rows));
  } catch (err) {
    self.postMessage({ failed: `could not read the model: ${err.message}` });
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

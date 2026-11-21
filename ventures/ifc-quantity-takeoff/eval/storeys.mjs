// Storeys the model view lists, and where its plan cut starts on each.
//
//   node eval/storeys.mjs <model.ifc>... [--json out.json]
//
// For every storey: elements, the storey's stated elevation, the bottom and
// top of its elements' boxes, and the plan cut the page starts at when only
// that storey is shown (1.2 m above the bottom of what is shown, capped at
// the top). A cut that lands under the storey's own elevation, or above the
// next storey's, would show the wrong floor's plan.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { storeyList } from "../view-mesh.mjs";
import { sectionPlane } from "../viewer.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
for (const file of args) {
  const t0 = Date.now();
  const r = takeoff(parseStep(readFileSync(file)));
  const rows = r.rows.filter((x) => !x.isAssembly);
  const list = storeyList(r.rows);
  const res = { model: basename(file), elements: rows.length, secs: (Date.now() - t0) / 1000, storeys: [] };
  for (const s of list) {
    const mine = rows.filter((x) => (x.storey ?? null) === s.name && x.box);
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const x of mine) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], x.box[k]); b[k + 3] = Math.max(b[k + 3], x.box[k + 3]); }
    const ok = Number.isFinite(b[0]);
    // the page's starting value: 1.2 m above the bottom, as a slider step of 1/1000
    const t = ok && b[5] > b[2] ? Math.round(Math.min(1, 1.2 / (b[5] - b[2])) * 1000) / 1000 : 0.5;
    const plane = ok ? sectionPlane("z", t, b) : null;
    res.storeys.push({ name: s.name, elevation: s.elevation, count: s.count, bottom: ok ? b[2] : null, top: ok ? b[5] : null, cut: plane ? plane.d : null });
  }
  out.push(res);
  const f = (v) => (v == null ? "-" : v.toFixed(2));
  console.log(`\n${res.model}: ${res.elements} elements, ${list.length} storeys (${res.secs.toFixed(1)} s)`);
  for (const s of res.storeys) console.log(`  ${String(s.name ?? "(no storey)").padEnd(28)} ${String(s.count).padStart(5)}  elev ${f(s.elevation).padStart(7)}  boxes ${f(s.bottom).padStart(8)} to ${f(s.top).padStart(8)}  cut ${f(s.cut).padStart(8)}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));

// Does the model view draw what the takeoff measured?
//
// For each model: take it off, build every element's view mesh (view-mesh.mjs),
// and compare the volume the drawn triangles enclose with the volume the
// takeoff computed for the same solid (net where openings were cut, gross
// otherwise). A boundary that leaks, doubles a face or keeps a fan's extra
// triangle encloses a different volume, so agreement within 0.5% is the
// check that the picture is the measured solid. Faceted bodies (shells as
// the file gives them) are counted apart: their faces are drawn as given.
//
//   node eval/model-view.mjs <model.ifc>... [--json out.json]

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { rowMesh, meshVolume } from "../view-mesh.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const results = [];
for (const file of args) {
  const t0 = performance.now();
  const r = takeoff(parseStep(readFileSync(file)));
  const t1 = performance.now();
  const res = { model: basename(file), elements: 0, drawn: 0, boxOnly: 0, approximate: 0, triangles: 0, checked: 0, agree: 0, faceted: 0, worst: [], takeoffS: +((t1 - t0) / 1000).toFixed(1), meshS: 0, slowestMs: 0 };
  for (const row of r.rows) {
    if (row.isAssembly) continue;
    res.elements++;
    const ts = performance.now();
    const m = rowMesh(row);
    const dt = performance.now() - ts;
    if (dt > res.slowestMs) { res.slowestMs = Math.round(dt); res.slowest = `${row.ifcClass} #${row.id}`; }
    if (!m) continue;
    res.drawn++;
    res.triangles += m.positions.length / 9;
    if (m.boxOnly) { res.boxOnly++; continue; }
    if (!m.exact) { res.approximate++; continue; }
    if (row.computed.faceted) { res.faceted++; continue; }
    const want = m.net ? row.computed.net : row.computed.gross;
    if (!(want > 0)) continue;
    res.checked++;
    const got = Math.abs(meshVolume(m.positions));
    const rel = Math.abs(got - want) / want;
    if (rel <= 0.005) res.agree++;
    else res.worst.push({ element: `${row.ifcClass} #${row.id}`, drawn: +got.toPrecision(6), computed: +want.toPrecision(6), off: +(rel * 100).toFixed(2) });
  }
  res.meshS = +((performance.now() - t1) / 1000).toFixed(1);
  res.worst.sort((a, b) => b.off - a.off);
  res.disagree = res.worst.length;
  res.worst = res.worst.slice(0, 5);
  results.push(res);
  console.log(`${res.model}: ${res.drawn}/${res.elements} drawn (${res.boxOnly} as boxes, ${res.approximate} approximate, ${res.faceted} faceted as given), ${res.triangles} triangles; enclosed volume = computed within 0.5% on ${res.agree} of ${res.checked}; takeoff ${res.takeoffS} s, meshes ${res.meshS} s (slowest ${res.slowestMs} ms, ${res.slowest})`);
  for (const w of res.worst) console.log(`   ${w.element}: drawn ${w.drawn}, computed ${w.computed} (${w.off}% off)`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");

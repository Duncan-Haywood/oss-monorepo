#!/usr/bin/env node
// The model fill end to end on real exports with their stored weights hidden:
// every quantity named NetWeight or GrossWeight is renamed, the fill is asked
// for Qto_*BaseQuantities NetWeight on beams, columns, members, slabs, walls
// and plates (member-weights/member-weights.ids.xml) with --from-geometry and
// a density table, and each written value is compared with the NetWeight the
// exporter had stored on that element. The table is the densities the
// unhidden model's own weights imply (weights.mjs learnedDensities), as an
// office would type its material catalogue once. eval/member-weights-2026-11-22.md.
//   node eval/member-weights-fill.mjs MODEL.ifc ...
import { readFileSync } from "node:fs";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";
import { measureModel, geometryLookup } from "../geometry-quantities.mjs";
import { learnedDensities } from "../weights.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";

const IDS = readFileSync(new URL("./member-weights/member-weights.ids.xml", import.meta.url), "utf8");
for (const f of process.argv.slice(2)) {
  const orig = readFileSync(f, "utf8");
  const rows = takeoff(parseStep(orig)).rows;
  const stored = new Map();
  for (const r of rows) if (r.stored?.NetWeight?.value > 0) stored.set(r.id, r.stored.NetWeight.value);
  if (!stored.size) continue;
  const { densities } = learnedDensities(rows);
  const hidden = orig.replace(/IFCQUANTITYWEIGHT\('(NetWeight|GrossWeight)'/g, "IFCQUANTITYWEIGHT('$1AsExported'");
  const t0 = Date.now();
  const geometry = geometryLookup(await measureModel(hidden, { densities }));
  const r = fillModel(IDS, hidden, { ...resources(), geometry });
  let scored = 0, within = 0, extra = 0, worst = 0;
  for (const w of r.writtenList) {
    const st = stored.get(w.id);
    if (st == null) { extra++; continue; }
    scored++;
    const e = Math.abs(Number(w.value) / st - 1);
    worst = Math.max(worst, e);
    if (e <= 0.005) within++;
  }
  const missed = [...stored.keys()].filter((id) => !r.writtenList.some((w) => w.id === id)).length;
  console.log(`${f.split("/").pop()}: ${r.written} written (${r.fromGeometry} from volume x density) in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${scored} of ${stored.size} stored weights rewritten, ${within} within 0.5% (worst ${(worst * 100).toFixed(3)}%), ${missed} not written, ${extra} on elements that stored none; filled model passes every check: ${r.after ? r.after.pass : "-"}; densities ${[...densities].map(([k, d]) => `${k} ${d}`).join(", ")}`);
}

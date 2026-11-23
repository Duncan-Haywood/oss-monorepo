#!/usr/bin/env node
// Tekla's NetVolume convention (geometry-quantities.mjs
// addNetVolumeConventions): for each element the convention changes, the
// NetVolume the file stores (as an IfcElementQuantity or a Qto_ property
// set), the body's measured net with the section's fillets in, and the
// figure the fill now offers without them.
//   node eval/tekla-net-volume.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry } from "../../ifc-quantity-takeoff/geom.mjs";
import { addNetVolumeConventions } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ref = (a) => (a && a.ref !== undefined ? a.ref : null);
const near = (a, b) => Math.abs(a - b) / b <= 0.02;

function storedNetVolumes(m) {
  const E = m.entities, u = readUnits(m).VOLUMEUNIT, out = new Map();
  for (const rel of E.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const set = E.get(ref(rel.args[5]));
    if (!set || !/^(Qto_|BaseQuantities$)/.test(set.args[2] || "")) continue;
    let v = null;
    for (const r of (set.type === "IFCELEMENTQUANTITY" ? set.args[5] : set.args[4]) || []) {
      const q = E.get(ref(r));
      if (!q || q.args[0] !== "NetVolume") continue;
      if (q.type === "IFCQUANTITYVOLUME" && typeof q.args[3] === "number") v = q.args[3] * u;
      if (q.type === "IFCPROPERTYSINGLEVALUE" && typeof q.args[2]?.value === "number") v = q.args[2].value * u;
    }
    if (v > 0) for (const o of rel.args[4] || []) out.set(ref(o), v);
  }
  return out;
}

const summary = {};
for (const f of args) {
  const m = parseStep(readFileSync(f));
  const { rows } = takeoff(m);
  const before = new Map(rows.map((r) => [r.id, r.computed?.net]));
  const changed = addNetVolumeConventions(m, rows, { Geometry });
  const stored = storedNetVolumes(m);
  const s = { changed, withStored: 0, beforeWithin2: 0, afterWithin2: 0, worse: [] };
  for (const r of rows) {
    if (r.computed?.netFrom !== "no fillets") continue;
    const st = stored.get(r.id);
    if (!st) continue;
    s.withStored++;
    const b = near(before.get(r.id), st), a = near(r.computed.net, st);
    if (b) s.beforeWithin2++;
    if (a) s.afterWithin2++;
    if (b && !a) s.worse.push({ id: r.id, stored: st, before: before.get(r.id), after: r.computed.net });
  }
  const name = f.split("/").pop();
  summary[name] = s;
  console.log(`${name}: ${changed} members take Tekla's no-fillet NetVolume; ${s.withStored} store one: within 2% with fillets ${s.beforeWithin2}, without ${s.afterWithin2}; worse ${s.worse.length}`);
}
if (json) writeFileSync(json, JSON.stringify(summary, null, 1) + "\n");

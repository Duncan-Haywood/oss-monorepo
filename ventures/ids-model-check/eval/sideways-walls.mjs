#!/usr/bin/env node
// Walls whose placement lays their own z sideways and that have no Axis
// (Tekla's IFC4 export), which addWallLines now turns upright before reading
// (geometry-quantities.mjs uprightFrame): per file, how many, and how their
// Length and Height compare with what the file stores (an IfcElementQuantity
// or a Qto_ property set; BaseQuantities too).
//   node eval/sideways-walls.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import * as G from "../../ifc-quantity-takeoff/geom.mjs";
import { addWallLines } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ref = (a) => (a && a.ref !== undefined ? a.ref : null);

function stored(m, names) {
  const E = m.entities, u = readUnits(m).LENGTHUNIT, out = new Map();
  for (const rel of E.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const set = E.get(ref(rel.args[5]));
    if (!set || !/^(Qto_|BaseQuantities$)/.test(set.args[2] || "")) continue;
    const got = {};
    for (const r of (set.type === "IFCELEMENTQUANTITY" ? set.args[5] : set.args[4]) || []) {
      const q = E.get(ref(r));
      if (!q || !names.includes(q.args[0])) continue;
      const v = q.type === "IFCQUANTITYLENGTH" ? q.args[3] : q.args[2]?.value;
      if (typeof v === "number" && v > 0) got[q.args[0]] = v * u;
    }
    for (const o of rel.args[4] || []) out.set(ref(o), { ...(out.get(ref(o)) || {}), ...got });
  }
  return out;
}

const summary = {};
for (const f of args) {
  const m = parseStep(readFileSync(f));
  const { rows } = takeoff(m);
  addWallLines(m, rows, { Geometry: G.Geometry, polyPlanes: G.polyPlanes, readUnits, asTerms: G.asTerms, transformSolid: G.transformSolid });
  const st = stored(m, ["Length", "Height"]);
  const s = { turned: 0, Length: { stored: 0, offered: 0, within2: 0 }, Height: { stored: 0, offered: 0, within2: 0 }, off: [] };
  for (const r of rows) {
    if (r.computed?.lines?.from !== "body, turned upright") continue;
    s.turned++;
    const sv = st.get(r.id) || {};
    for (const [k, v] of [["Length", r.computed.lines.length], ["Height", r.computed.lines.height]]) {
      if (!sv[k]) continue;
      s[k].stored++;
      if (v == null) continue;
      s[k].offered++;
      if (Math.abs(v - sv[k]) / sv[k] <= 0.02) s[k].within2++;
      else s.off.push({ id: r.id, name: k, stored: sv[k], read: v });
    }
  }
  const name = f.split("/").pop();
  summary[name] = s;
  console.log(`${name}: ${s.turned} walls turned upright; Length stored ${s.Length.stored}, offered ${s.Length.offered}, within 2% ${s.Length.within2}; Height stored ${s.Height.stored}, offered ${s.Height.offered}, within 2% ${s.Height.within2}`);
}
if (json) writeFileSync(json, JSON.stringify(summary, null, 1) + "\n");

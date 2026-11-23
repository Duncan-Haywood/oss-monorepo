#!/usr/bin/env node
// The one Tekla Structures 2026 model exported as IFC2X3, IFC4 and IFC4X3
// (eval/fetch-qto-psets.sh): for each element and each quantity in its Qto_
// property set, what Tekla stores and what measureModel reads, per schema,
// matched across the three files by GlobalId. Prints the elements whose
// reading is within 2% in one schema and not in another.
//   node eval/beam-schema-twins.mjs 2X3.ifc 4.ifc 4X3.ifc [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { measureModel } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const MEASURE_UNIT = { IFCLENGTHMEASURE: "LENGTHUNIT", IFCPOSITIVELENGTHMEASURE: "LENGTHUNIT", IFCAREAMEASURE: "AREAUNIT", IFCVOLUMEMEASURE: "VOLUMEUNIT", IFCMASSMEASURE: "MASSUNIT" };
const KIND = { LENGTHUNIT: "length", AREAUNIT: "area", VOLUMEUNIT: "volume", MASSUNIT: "weight" };
const ref = (a) => (a && a.ref !== undefined ? a.ref : null);
const str = (a) => (typeof a === "string" ? a : null);

export async function readings(path) {
  const text = readFileSync(path);
  const m = parseStep(text);
  const units = readUnits(m);
  const geo = await measureModel(text);
  const E = m.entities;
  const rows = new Map(); // guid -> {type, name, values: {pn: {stored, geo}}}
  for (const rel of E.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const set = E.get(ref(rel.args[5]));
    if (!set || set.type !== "IFCPROPERTYSET" || !str(set.args[2])?.startsWith("Qto_")) continue;
    for (const r of rel.args[4] || []) {
      const o = E.get(ref(r));
      if (!o) continue;
      const row = rows.get(str(o.args[0])) || { id: o.id, type: o.type.replace(/STANDARDCASE$/, ""), name: str(o.args[2]), values: {} };
      rows.set(str(o.args[0]), row);
      for (const pr of set.args[4] || []) {
        const p = E.get(ref(pr));
        if (!p || p.type !== "IFCPROPERTYSINGLEVALUE") continue;
        const v = p.args[2];
        const ut = MEASURE_UNIT[v?.typed];
        if (!ut || !(v.value > 0)) continue;
        const pn = str(p.args[0]);
        const q = geo.get(o.id)?.get(pn);
        row.values[pn] = { stored: v.value * units[ut], geo: q && q.kind === KIND[ut] && q.value > 0 ? q.value : null };
      }
    }
  }
  return rows;
}

const ok = (v) => v && v.geo != null && Math.abs(v.geo - v.stored) / v.stored <= 0.02;
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await Promise.all(args.map(readings));
  const labels = args.map((f) => f.split("/").pop());
  const out = [];
  for (const [guid, row] of files[1]) {
    for (const pn of Object.keys(row.values)) {
      const vs = files.map((f) => f.get(guid)?.values[pn]);
      const oks = vs.map(ok);
      if (oks.every(Boolean) || !oks.some(Boolean)) continue;
      out.push({ guid, type: row.type, name: row.name, quantity: pn, ...Object.fromEntries(labels.map((l, i) => [l, vs[i] ? { stored: +vs[i].stored.toPrecision(6), geo: vs[i].geo == null ? null : +vs[i].geo.toPrecision(6) } : null])) });
    }
  }
  for (const o of out) console.log([o.type, o.name, o.guid, o.quantity, ...labels.map((l) => o[l] ? `${o[l].stored}/${o[l].geo}` : "-")].join(" | "));
  console.log(`${out.length} values read within 2% in some schema and not in another`);
  if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
}

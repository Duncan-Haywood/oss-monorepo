#!/usr/bin/env node
// Qto_ sets written as IfcPropertySet (Tekla Structures, some Allplan
// exports) instead of IfcElementQuantity: how close the model fill's geometry
// reading (geometry-quantities.mjs measureModel, what --from-geometry writes)
// comes to the values those property sets store, per class and name.
//   node eval/qto-psets.mjs MODEL.ifc ... [--json out.json]
// Values are compared in SI units (the project's length, area, volume and
// mass units from IfcProject). Agreement: within 2% and within 5%.
// Also counts, per file, the Qto_ sets held each way, and the property names
// in Qto_ property sets that no standard Qto_ template defines (Allplan 2024
// writes Länge/Dicke/Höhe).
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { measureModel } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const templates = JSON.parse(readFileSync(new URL("../schema/psets-ifc4.json", import.meta.url), "utf8"));
const tplNames = (ps) => (Object.hasOwn(templates, ps) ? new Set(Object.keys(templates[ps].props)) : null);
const MEASURE_UNIT = { IFCLENGTHMEASURE: "LENGTHUNIT", IFCPOSITIVELENGTHMEASURE: "LENGTHUNIT", IFCAREAMEASURE: "AREAUNIT", IFCVOLUMEMEASURE: "VOLUMEUNIT", IFCMASSMEASURE: "MASSUNIT" };
const KIND = { LENGTHUNIT: "length", AREAUNIT: "area", VOLUMEUNIT: "volume", MASSUNIT: "weight" };
const ref = (a) => (a && a.ref !== undefined ? a.ref : null);
const str = (a) => (typeof a === "string" ? a : null);

const out = {};
for (const f of args) {
  const text = readFileSync(f);
  const m = parseStep(text);
  const units = readUnits(m);
  const geo = await measureModel(text);
  const E = m.entities;
  const app = [...E.values()].find((e) => e.type === "IFCAPPLICATION");
  const appName = app ? `${str(app.args[2])} ${str(app.args[1])}` : "(no application)";
  const held = { IFCPROPERTYSET: 0, IFCELEMENTQUANTITY: 0 };
  const odd = {};
  const stats = {};
  for (const rel of E.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const set = E.get(ref(rel.args[5]));
    if (!set) continue;
    const name = str(set.args[2]);
    if (!name || !name.startsWith("Qto_")) continue;
    const objs = (rel.args[4] || []).map((r) => E.get(ref(r))).filter(Boolean);
    held[set.type] = (held[set.type] || 0) + objs.length;
    if (set.type !== "IFCPROPERTYSET") continue;
    const tpl = tplNames(name);
    for (const pr of set.args[4] || []) {
      const p = E.get(ref(pr));
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE") continue;
      const pn = str(p.args[0]);
      if (tpl && !tpl.has(pn)) odd[`${name}.${pn}`] = (odd[`${name}.${pn}`] || 0) + objs.length;
      const v = p.args[2];
      const measure = v && v.typed;
      const ut = MEASURE_UNIT[measure];
      const raw = v && typeof v.value === "number" ? v.value : null;
      if (!ut || typeof raw !== "number" || !(raw > 0)) continue;
      const si = raw * units[ut];
      for (const o of objs) {
        const q = geo.get(o.id)?.get(pn);
        const fam = o.type.replace(/STANDARDCASE$|ELEMENTEDCASE$/, "");
        const key = `${fam} ${pn}`;
        const s = (stats[key] ||= { stored: 0, offered: 0, within2: 0, within5: 0, ratios: [] });
        s.stored++;
        if (!q || q.kind !== KIND[ut] || !(q.value > 0)) continue;
        s.offered++;
        const rel2 = Math.abs(q.value - si) / si;
        if (rel2 <= 0.02) s.within2++;
        if (rel2 <= 0.05) s.within5++;
        s.ratios.push(q.value / si);
      }
    }
  }
  for (const s of Object.values(stats)) { const a = s.ratios.sort((x, y) => x - y); s.medianRatio = a.length ? Number(a[a.length >> 1].toFixed(4)) : null; delete s.ratios; }
  const name = f.split("/").pop();
  out[name] = { application: appName, qtoHeldAs: held, nonTemplateNames: odd, stats };
  console.log(`\n${name} (${appName}): Qto_ sets on elements as IfcPropertySet ${held.IFCPROPERTYSET}, as IfcElementQuantity ${held.IFCELEMENTQUANTITY}`);
  if (Object.keys(odd).length) console.log(`  names no Qto_ template defines: ${Object.entries(odd).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  if (!Object.keys(stats).length) continue;
  console.log("class quantity | stored in a Qto_ property set | geometry gives one | within 2% | within 5% | median geometry/stored");
  for (const [k, s] of Object.entries(stats).sort()) console.log(`${k} | ${s.stored} | ${s.offered} | ${s.within2} | ${s.within5} | ${s.medianRatio ?? "-"}`);
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");

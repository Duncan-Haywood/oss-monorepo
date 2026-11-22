#!/usr/bin/env node
// Opening elements' Qto_OpeningElementBaseQuantities read from their bodies
// (geometry-quantities.mjs openingElementLines, run by measureModel) against
// the figures their exporters stored. eval/opening-quantities-2026-11-22.md.
//   node eval/opening-quantities.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { measureModel, openingElementConvention } from "../geometry-quantities.mjs";

const NAMES = ["Width", "Height", "Depth", "Area"];
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
const val = (v) => (typeof v === "number" ? v : typeof v?.value === "number" ? v.value : typeof v === "string" ? v : v?.value);
const total = {};
const out = { files: {}, misses: [], held: [] };
for (const f of args) {
  const text = readFileSync(f);
  const model = parseStep(text);
  const E = model.entities, U = readUnits(model);
  const file = f.split("/").pop();
  const app = [...E.values()].find((e) => e.type === "IFCAPPLICATION");
  const appName = app ? [app.args[2], app.args[3]].filter((x) => typeof x === "string").join(" ") : "";
  const conv = openingElementConvention(appName) || "other";
  // stored quantities on openings, in SI
  const stored = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pd = E.get(ref(e.args[5]));
    if (pd?.type !== "IFCELEMENTQUANTITY") continue;
    for (const id of (e.args[4] || []).map(ref)) {
      if (!/^IFCOPENING/.test(E.get(id)?.type || "")) continue;
      const m = stored.get(id) || {};
      for (const qid of pd.args[5] || []) {
        const q = E.get(ref(qid));
        if (!q || !NAMES.includes(val(q.args[0]))) continue;
        const sc = q.type === "IFCQUANTITYAREA" ? U.AREAUNIT : U.LENGTHUNIT;
        m[val(q.args[0])] = val(q.args[3]) * sc;
      }
      stored.set(id, m);
    }
  }
  if (!stored.size) { out.files[file] = { app: appName, openings: 0 }; continue; }
  const offered = await measureModel(text, { weights: false });
  const host = new Map();
  for (const e of E.values()) if (e.type === "IFCRELVOIDSELEMENT") host.set(ref(e.args[5]), E.get(ref(e.args[4]))?.type || "none");
  out.files[file] = { app: appName, openings: stored.size };
  for (const [id, s] of stored) {
    for (const q of NAMES) {
      const st = s[q];
      if (!(st > 0)) continue;
      const k = `${conv} ${q}`;
      const t = (total[k] ||= { stored: 0, offered: 0, within1: 0, misses: 0, held: 0, worst: 0 });
      t.stored++;
      const o = offered.get(id)?.get(q)?.value;
      const rec = { file, id, name: val(E.get(id).args[2]), host: host.get(id), q, stored: +st.toFixed(5) };
      if (o == null) { t.held++; if (out.held.length < 300) out.held.push(rec); continue; }
      t.offered++;
      const err = Math.abs(o / st - 1);
      if (err <= 0.01) { t.within1++; t.worst = Math.max(t.worst, err); }
      else { t.misses++; if (out.misses.length < 300) out.misses.push({ ...rec, offered: +o.toFixed(5) }); }
    }
  }
}
console.log("files (app, openings storing the set):");
for (const [f, x] of Object.entries(out.files)) console.log(`  ${f}: ${x.app}, ${x.openings}`);
console.log("convention name: stored; offered, within 1% (worst), misses; held back");
for (const [k, t] of Object.entries(total).sort()) console.log(`${k}: ${t.stored}; ${t.offered}, ${t.within1} (${(t.worst * 100).toFixed(3)}%), ${t.misses}; ${t.held}`);
const why = {};
for (const m of [...out.misses.map((x) => ({ ...x, w: "miss" })), ...out.held.map((x) => ({ ...x, w: "held" }))]) { const k = `${m.w} ${m.q} ${m.file} host ${m.host}`; why[k] = (why[k] || 0) + 1; }
console.log("\nmisses and held back by name, file and host:");
for (const [k, n] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n} ${k}`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");

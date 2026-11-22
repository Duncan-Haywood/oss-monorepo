#!/usr/bin/env node
// Which exported property each Revit door's and window's stored
// Qto_ Width, Height, Area and Perimeter equals: every numeric property on the
// element and on its type, tallied by (set, property) for the ones that equal
// the stored figure to 1e-4. eval/revit-door-window-quantities-2026-11-22.md.
//   node eval/revit-door-window-params.mjs MODEL.ifc ...
import { readFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";

const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
const str = (v) => (typeof v === "string" ? v : typeof v?.value === "string" ? v.value : null);
const num = (v) => (typeof v === "number" ? v : typeof v?.value === "number" ? v.value : null);
for (const f of process.argv.slice(2)) {
  const model = parseStep(readFileSync(f));
  const E = model.entities;
  const { rows } = takeoff(model);
  const psetsOf = new Map(); // object id -> [pset ids]
  const push = (o, p) => { if (!psetsOf.has(o)) psetsOf.set(o, []); psetsOf.get(o).push(p); };
  const typeOf = new Map();
  for (const e of E.values()) {
    if (e.type === "IFCRELDEFINESBYPROPERTIES") for (const o of e.args[4] || []) push(ref(o), ref(e.args[5]));
    if (e.type === "IFCRELDEFINESBYTYPE") for (const o of e.args[4] || []) typeOf.set(ref(o), ref(e.args[5]));
  }
  const props = (id, where) => {
    const out = [];
    const ids = [...(psetsOf.get(id) || [])];
    const t = E.get(id);
    if (t && /TYPE|STYLE/.test(t.type) && Array.isArray(t.args[5])) ids.push(...t.args[5].map(ref));
    for (const pid of ids) {
      const p = E.get(pid);
      if (!p || p.type !== "IFCPROPERTYSET") continue;
      for (const r of p.args[4] || []) {
        const pv = E.get(ref(r));
        if (pv?.type !== "IFCPROPERTYSINGLEVALUE") continue;
        const v = num(pv.args[2]);
        if (v != null) out.push({ key: `${where}:${str(p.args[2])}.${str(pv.args[0])}`, v });
      }
    }
    return out;
  };
  const tally = {};
  let n = 0;
  for (const r of rows) {
    if (!/^IFC(DOOR|WINDOW)$/.test(r.ifcType)) continue;
    const st = r.stored || {};
    if (!(st.Width?.value > 0)) continue;
    n++;
    const f0 = r.lengthUnit ?? 1;
    const all = [...props(r.id, "elem"), ...props(typeOf.get(r.id), "type")];
    const W = all.filter((p) => /Width|Breite|Bredde/i.test(p.key)), H = all.filter((p) => /Height|Höhe|Hoyde|Høyde/i.test(p.key));
    for (const q of ["Width", "Height", "Area", "Perimeter"]) {
      if (!(st[q]?.value > 0)) continue;
      const k = `${r.ifcType} ${q}`;
      tally[k] ??= { stored: 0, keys: {} };
      tally[k].stored++;
      const seen = new Set();
      for (const p of all) {
        const v = p.v * (q === "Area" ? f0 * f0 : f0);
        if (Math.abs(v - st[q].value) <= 1e-4 * st[q].value && !seen.has(p.key)) { seen.add(p.key); tally[k].keys[p.key] = (tally[k].keys[p.key] || 0) + 1; }
      }
      if (q === "Area" || q === "Perimeter") for (const w of W) for (const h of H) {
        const v = q === "Area" ? w.v * h.v * f0 * f0 : 2 * (w.v + h.v) * f0;
        const key = `${q === "Area" ? "WxH" : "2(W+H)"} ${w.key} x ${h.key}`;
        if (Math.abs(v - st[q].value) <= 1e-4 * st[q].value && !seen.has(key)) { seen.add(key); tally[k].keys[key] = (tally[k].keys[key] || 0) + 1; }
      }
    }
  }
  console.log(`\n${f.split("/").pop()}: ${n} doors+windows with a stored Width`);
  for (const [k, t] of Object.entries(tally)) {
    const top = Object.entries(t.keys).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([kk, c]) => `${kk} ${c}`).join("; ");
    console.log(`  ${k}: ${t.stored} stored; equal to: ${top || "(none)"}`);
  }
}

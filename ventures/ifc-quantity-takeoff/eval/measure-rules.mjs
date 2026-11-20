// What a small-void rule changes in a bill of quantities, on real models.
//
//   node eval/measure-rules.mjs model.ifc [more.ifc ...] [--json out.json]
//
// For every element with openings (IfcRelVoidsElement), qto.mjs cuts each
// opening from the body on its own and records what it takes out: the volume,
// and the area in the section the BoQ measures (a wall's middle plane, a
// slab's plan). measure.mjs leaves in the openings at or under a threshold.
// This reports, per model:
//   - how many openings there are and how many each threshold leaves in;
//   - whether the openings' own deductions sum to what they take out together
//     (the condition for adding one back exactly), and how often they do not;
//   - the BoQ's total wall and slab area and volume, as modelled and under the
//     rule, and the change;
//   - an outside check: openings whose own quantity set stores Width and
//     Height (Qto_OpeningElementBaseQuantities, or a tool's own set) against
//     the area this tool cut for them, for openings through walls.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, rowQuantities, readUnits } from "../qto.mjs";
import { applyRule } from "../measure.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");

const RULES = [
  { name: "0.50 m2 / 0.05 m3", areaMax: 0.5, volumeMax: 0.05 },
  { name: "1.00 m2 / 0.10 m3", areaMax: 1.0, volumeMax: 0.1 },
];
const refId = (v) => (v && typeof v === "object" && v.ref !== undefined ? v.ref : null);
const num = (v) => (typeof v === "number" ? v : v && typeof v === "object" && typeof v.value === "number" ? v.value : null);
const str = (v) => (typeof v === "string" ? v : v && typeof v === "object" && typeof v.value === "string" ? v.value : null);

/** Width and Height an opening's quantity sets store, in metres. */
function openingSizes(model) {
  const E = model.entities;
  const f = readUnits(model).LENGTHUNIT;
  const out = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const d = E.get(refId(e.args[5]));
    if (!d || d.type !== "IFCELEMENTQUANTITY") continue;
    const q = {};
    for (const r of d.args[5] || []) {
      const qe = E.get(refId(r));
      if (!qe || qe.type !== "IFCQUANTITYLENGTH") continue;
      const n = (str(qe.args[0]) || "").toLowerCase();
      const v = num(qe.args[3]);
      if (v != null && (n === "width" || n === "height")) q[n] = v * f;
    }
    if (q.width == null || q.height == null) continue;
    for (const o of e.args[4] || []) {
      const oe = E.get(refId(o));
      if (oe && /^IFCOPENING/.test(oe.type) && !out.has(oe.id)) out.set(oe.id, q);
    }
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000;
const results = [];
for (const file of files) {
  const t0 = Date.now();
  const model = parseStep(readFileSync(file));
  const res = takeoff(model);
  const sizes = openingSizes(model);
  const m = { file: basename(file), secs: 0, elementsWithOpenings: 0, openings: 0, volumeCut: 0, areaCut: 0, additiveVolume: 0, additiveArea: 0, notAdditive: 0, rules: {}, sizeCheck: { pairs: 0, agree: 0, misses: [] } };
  const base = { area: 0, volume: 0 };
  const per = Object.fromEntries(RULES.map((R) => [R.name, { area: 0, volume: 0, voidsLeft: 0, skipped: 0, areaAdded: 0, areaRemoved: 0, volumeAdded: 0, volumeRemoved: 0, openingsUnderArea: 0, openingsUnderVolume: 0, byClass: {} }]));
  const baseByClass = {};
  for (const r of res.rows) {
    if (r.isAssembly) continue;
    const q = rowQuantities(r);
    const measured = /^IFC(WALL|SLAB|ROOF|PLATE|COVERING)/.test(r.ifcType);
    if (measured) { base.area += q.area ?? 0; base.volume += q.volume ?? 0; const B = (baseByClass[r.ifcClass] ??= { area: 0, volume: 0 }); B.area += q.area ?? 0; B.volume += q.volume ?? 0; }
    for (const R of RULES) {
      const a = applyRule(r, q, R);
      const P = per[R.name];
      if (measured) {
        P.area += a.area ?? 0; P.volume += a.volume ?? 0;
        if (a.areaChange > 0) P.areaAdded += a.areaChange; else P.areaRemoved -= a.areaChange;
        if (a.volumeChange > 0) P.volumeAdded += a.volumeChange; else P.volumeRemoved -= a.volumeChange;
        const C = (P.byClass[r.ifcClass] ??= { area: 0, volume: 0 }); C.area += a.areaChange; C.volume += a.volumeChange;
      }
      P.voidsLeft += a.voidsLeft; if (a.ruleNotes.length) P.skipped++;
    }
    const c = r.computed;
    if (!c || c.status !== "ok" || !c.openings) continue;
    m.elementsWithOpenings++;
    m.openings += c.openings;
    const S = c.areas && !c.areas.error && !c.areas.faceted ? (c.areas.side ?? c.areas.plan) : null;
    if (c.voids && c.net != null) {
      m.volumeCut++;
      const sum = c.voids.reduce((s, v) => s + v.volume, 0), together = c.gross - c.net;
      if (Math.abs(sum - together) <= Math.max(1e-6, 0.005 * together)) m.additiveVolume++; else m.notAdditive++;
      for (const R of RULES) per[R.name].openingsUnderVolume += c.voids.filter((v) => v.volume > 0 && v.volume <= R.volumeMax).length;
    }
    if (S?.voids && S.net != null && S.gross != null) {
      m.areaCut++;
      const sum = S.voids.reduce((s, v) => s + (v ?? 0), 0), together = S.gross - S.net;
      if (S.voids.every((v) => v != null) && Math.abs(sum - together) <= Math.max(1e-6, 0.005 * together)) m.additiveArea++;
      for (const R of RULES) per[R.name].openingsUnderArea += S.voids.filter((v) => v != null && v > 0 && v <= R.areaMax).length;
      // outside check: the opening's stored Width x Height against its cut area in a wall
      if (c.areas.side && c.voids) c.voids.forEach((v, i) => {
        const z = sizes.get(v.id);
        const a = S.voids[i];
        if (!z || a == null || a === 0) return;
        const wh = z.width * z.height;
        m.sizeCheck.pairs++;
        if (Math.abs(a - wh) <= 0.02 * wh) m.sizeCheck.agree++;
        else if (m.sizeCheck.misses.length < 6) m.sizeCheck.misses.push({ wall: `#${r.id} ${r.name ?? ""}`.trim(), opening: `#${v.id}`, cut: r3(a), widthTimesHeight: r3(wh) });
      });
    }
  }
  m.base = { area: r3(base.area), volume: r3(base.volume) };
  for (const R of RULES) {
    const P = per[R.name];
    const byClass = Object.fromEntries(Object.entries(P.byClass).filter(([, c]) => c.area || c.volume).map(([k, c]) => [k, { area: r3(c.area), areaPct: baseByClass[k].area ? r3((100 * c.area) / baseByClass[k].area) : null, volume: r3(c.volume), volumePct: baseByClass[k].volume ? r3((100 * c.volume) / baseByClass[k].volume) : null }]));
    m.rules[R.name] = { areaAdded: r3(P.areaAdded), areaRemoved: r3(P.areaRemoved), volumeAdded: r3(P.volumeAdded), volumeRemoved: r3(P.volumeRemoved), byClass, voidsLeft: P.voidsLeft, openingsUnderArea: P.openingsUnderArea, openingsUnderVolume: P.openingsUnderVolume, rowsNotAdjusted: P.skipped, area: r3(P.area), areaChange: r3(P.area - base.area), areaChangePct: base.area ? r3((100 * (P.area - base.area)) / base.area) : null, volume: r3(P.volume), volumeChange: r3(P.volume - base.volume), volumeChangePct: base.volume ? r3((100 * (P.volume - base.volume)) / base.volume) : null };
  }
  m.secs = (Date.now() - t0) / 1000;
  results.push(m);
  console.log(`${m.file}: ${m.openings} openings in ${m.elementsWithOpenings} elements; volumes cut ${m.volumeCut} (additive ${m.additiveVolume}, not ${m.notAdditive}), areas cut ${m.areaCut} (additive ${m.additiveArea})`);
  for (const R of RULES) { const x = m.rules[R.name]; console.log(`  ${R.name}: openings under area ${x.openingsUnderArea}, under volume ${x.openingsUnderVolume}; wall/slab area ${m.base.area} -> ${x.area} (${x.areaChange >= 0 ? "+" : ""}${x.areaChange} m2, ${x.areaChangePct}%), volume ${m.base.volume} -> ${x.volume} (${x.volumeChange >= 0 ? "+" : ""}${x.volumeChange} m3, ${x.volumeChangePct}%); rows not adjusted ${x.rowsNotAdjusted}`); console.log(`    area +${x.areaAdded} left in, -${x.areaRemoved} taken from gross figures; volume +${x.volumeAdded} / -${x.volumeRemoved}; by class: ${Object.entries(x.byClass).map(([k, c]) => `${k} ${c.area >= 0 ? "+" : ""}${c.area} m2 (${c.areaPct}%) ${c.volume >= 0 ? "+" : ""}${c.volume} m3 (${c.volumePct}%)`).join("; ") || "none"}`); }
  if (m.sizeCheck.pairs) console.log(`  stored Width x Height vs cut area, wall openings: ${m.sizeCheck.agree} of ${m.sizeCheck.pairs} within 2%${m.sizeCheck.misses.length ? "; e.g. " + m.sizeCheck.misses.map((x) => `${x.opening} cut ${x.cut} vs ${x.widthTimesHeight}`).join(", ") : ""}`);
  console.log(`  ${m.secs.toFixed(1)} s`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));

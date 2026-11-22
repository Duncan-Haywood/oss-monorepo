#!/usr/bin/env node
// Columns', beams', members' and piles' Qto_ Length read from their bodies
// (geometry-quantities.mjs memberLength / addMemberLines) against the Length
// their exporters stored. eval/member-lengths-2026-11-22.md.
//   node eval/member-lengths.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { solidExtent } from "../../ifc-quantity-takeoff/geom.mjs";
import { addMemberLines, memberLength, toolConvention } from "../geometry-quantities.mjs";

const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
const TOOLS = [[/archicad|graphisoft/i, "ARCHICAD"], [/revit/i, "Revit"], [/tekla/i, "Tekla"]];
const near = (a, b, t = 0.02) => Math.abs(a - b) / b <= t;
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = {};
const total = { stored: 0, offered: 0, within2: 0, repeated: 0, wrong: 0, notLinear: 0, cutHeld: 0, cutHeldExtent: 0, cutHeldCentroid: 0 };
for (const f of args) {
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  addMemberLines(model, rows, { solidExtent });
  // one stored Length on several elements of one class whose bodies differ in
  // length by more than 2%: the exporter wrote one figure (a run's, a
  // system's) on every piece
  const groups = new Map();
  for (const r of rows) {
    const L = r.stored?.Length?.value;
    if (!CROSS.test(r.ifcType) || !(L > 0)) continue;
    const m = r.computed?.status === "ok" ? memberLength(r, solidExtent) : null;
    const k = `${r.ifcType} ${L.toFixed(6)}`;
    if (!groups.has(k)) groups.set(k, []);
    if (m) groups.get(k).push(m.extent);
  }
  const repeated = (r) => { const g = groups.get(`${r.ifcType} ${r.stored.Length.value.toFixed(6)}`) || []; return g.length >= 2 && Math.max(...g) > 1.02 * Math.min(...g); };
  const s = {};
  for (const r of rows) {
    if (!CROSS.test(r.ifcType)) continue;
    const L = r.stored?.Length?.value;
    if (!(L > 0)) continue;
    const tool = appTool(model, r.id);
    const fam = r.ifcType.replace(/STANDARDCASE$/, "");
    const x = (s[`${tool} ${fam}`] ||= { stored: 0, offered: 0, within2: 0, repeated: 0, wrong: [], notLinear: 0, cutHeld: 0, cutHeldExtent: 0, cutHeldCentroid: 0 });
    x.stored++; total.stored++;
    const lines = r.computed?.lines;
    if (lines?.length != null) {
      x.offered++; total.offered++;
      if (near(lines.length, L)) { x.within2++; total.within2++; }
      else if (repeated(r)) { x.repeated++; total.repeated++; }
      else { total.wrong++; if (x.wrong.length < 8) x.wrong.push({ id: r.id, name: r.name ?? null, stored: +L.toFixed(4), offered: +lines.length.toFixed(4), from: lines.lengthFrom }); }
      continue;
    }
    const m = r.computed?.status === "ok" ? memberLength(r, solidExtent) : null;
    if (!m) continue;
    if (m.extent <= m.width) { x.notLinear++; total.notLinear++; continue; }
    if (!m.square) {
      x.cutHeld++; total.cutHeld++;
      if (near(m.extent, L)) { x.cutHeldExtent++; total.cutHeldExtent++; }
      if (near(m.centroid, L)) { x.cutHeldCentroid++; total.cutHeldCentroid++; }
    }
  }
  const name = f.split("/").pop();
  out[name] = s;
  console.log(`\n${name}`);
  console.log("tool class | stored | offered | within 2% | repeated figure | other misses | not linear (plate, footing) | cut ends held back (extent right / volume over section right)");
  for (const [k, v] of Object.entries(s).sort()) console.log(`${k} | ${v.stored} | ${v.offered} | ${v.within2} | ${v.repeated} | ${v.wrong.length ? v.offered - v.within2 - v.repeated : 0} | ${v.notLinear} | ${v.cutHeld} (${v.cutHeldExtent} / ${v.cutHeldCentroid})`);
  for (const [k, v] of Object.entries(s)) for (const w of v.wrong) console.log(`  miss ${k} #${w.id}: stored ${w.stored}, offered ${w.offered} (${w.from})`);
}
console.log(`\nall: ${total.stored} stored; ${total.offered} offered, ${total.within2} within 2%, ${total.repeated} a repeated stored figure, ${total.wrong} other misses; ${total.notLinear} not linear; ${total.cutHeld} cut ends held back (extent right ${total.cutHeldExtent}, volume/section right ${total.cutHeldCentroid})`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");

function appTool(model, id) {
  const E = model.entities;
  const name = (a) => { if (!a || a.type !== "IFCAPPLICATION") return ""; const d = E.get(a.args[0]?.ref); return [a.args[2], a.args[3], d?.args?.[1]].filter((t) => typeof t === "string").join(" "); };
  const oh = E.get(E.get(id)?.args?.[1]?.ref);
  let t = oh?.type === "IFCOWNERHISTORY" ? name(E.get(oh.args[1]?.ref)) : "";
  if (!t) for (const x of E.values()) if (x.type === "IFCAPPLICATION") { t = name(x); break; }
  return TOOLS.find(([re]) => re.test(t))?.[1] ?? "other";
}

#!/usr/bin/env node
// Railings' Qto_RailingBaseQuantities Length read from their bodies
// (railings.mjs railingLength) against the Length their exporters stored,
// and how many railings in models that store none would be filled.
// eval/railing-lengths-2026-11-22.md.
//   node eval/railing-lengths.mjs MODEL.ifc ... [--json out.json] [--all]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { railingLength } from "../railings.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ai = args.indexOf("--all");
const all = ai >= 0 && !!args.splice(ai, 1);
const near = (a, b, t = 0.02) => Math.abs(a - b) / b <= t;
const out = {};
const total = { railings: 0, stored: 0, offered: 0, within2: 0, worst: 0, held: {}, unstoredOffered: 0, unstored: 0 };
for (const f of args) {
  const name = f.split("/").pop();
  const t0 = Date.now();
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  const app = [...model.entities.values()].find((x) => x.type === "IFCAPPLICATION")?.args?.[2] ?? "?";
  const s = { app, railings: 0, stored: 0, offered: 0, within2: 0, worst: 0, held: {}, misses: [], unstored: 0, unstoredOffered: 0, lines: [] };
  for (const r of rows) {
    if (!/^IFCRAILING/.test(r.ifcType)) continue;
    s.railings++;
    const L = r.stored?.Length?.value;
    const m = r.computed?.status === "ok" ? railingLength(r) : { length: null, reason: "not measured", runs: [], under: 0 };
    const desc = m.runs.map((u) => `${u.strip?.toFixed(3)}/${u.sweep?.toFixed(3)}`).join(" + ");
    if (!(L > 0)) {
      s.unstored++;
      if (m.length != null) s.unstoredOffered++;
      if (all) s.lines.push(`#${r.id} stores none: ${m.length != null ? m.length.toFixed(3) : "held (" + m.reason + ")"} [${desc}]`);
      continue;
    }
    s.stored++;
    if (m.length == null) { s.held[m.reason] = (s.held[m.reason] || 0) + 1; s.lines.push(`#${r.id} stored ${L.toFixed(3)}: held (${m.reason}) [strip/sweep ${desc}; ${m.under} under]`); continue; }
    s.offered++;
    const e = Math.abs(m.length - L) / L;
    if (e > s.worst) s.worst = e;
    if (near(m.length, L)) s.within2++;
    else s.misses.push({ id: r.id, stored: +L.toFixed(4), offered: +m.length.toFixed(4) });
    s.lines.push(`#${r.id} stored ${L.toFixed(3)}: offered ${m.length.toFixed(3)} (${(100 * e).toFixed(2)}%) [strip/sweep ${desc}; ${m.under} under]`);
  }
  s.seconds = (Date.now() - t0) / 1000;
  out[name] = s;
  for (const k of ["railings", "stored", "offered", "within2", "unstored", "unstoredOffered"]) total[k] += s[k];
  total.worst = Math.max(total.worst, s.worst);
  for (const [k, v] of Object.entries(s.held)) total.held[k] = (total.held[k] || 0) + v;
  console.log(`\n${name} (${app}): ${s.railings} railings; ${s.stored} store a Length: ${s.offered} offered, ${s.within2} within 2%, worst ${(100 * s.worst).toFixed(2)}%, held ${JSON.stringify(s.held)}; ${s.unstored} store none: ${s.unstoredOffered} would be filled (${s.seconds.toFixed(1)} s)`);
  for (const l of s.lines) console.log("  " + l);
}
console.log(`\nall: ${total.railings} railings; ${total.stored} stored, ${total.offered} offered, ${total.within2} within 2% (worst ${(100 * total.worst).toFixed(2)}%), held ${JSON.stringify(total.held)}; ${total.unstored} store none, ${total.unstoredOffered} would be filled`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");

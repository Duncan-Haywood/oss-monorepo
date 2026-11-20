#!/usr/bin/env node
// How far the Uniformat II rules (uniformat.mjs) get on real models, and how
// often they agree with the code a model's author set where one is set.
//
//   node eval/uniformat-check.mjs model.ifc [more.ifc ...] [--json out.json] [--list N]
//
// Geometry is not read (the rules do not need it). Assemblies whose parts are
// elements are left out, as the bill of quantities leaves them out.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { uniformatSummary, cutCode, levelOf } from "../uniformat.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith("--") && !["--json", "--list"].includes(args[i - 1]));
const list = Number(opt("--list") ?? 15);
const all = [], total = {};
for (const f of files) {
  const res = takeoff(parseStep(readFileSync(f)), { geometry: false });
  const rows = res.rows.filter((r) => !r.isAssembly);
  const s = uniformatSummary(res.rows);
  for (const [k, v] of Object.entries(s)) total[k] = (total[k] || 0) + v;
  const none = {}, mism = {}, ext = { set: 0, unset: 0 };
  for (const r of rows) {
    if (/^IFCWALL|^IFCDOOR|^IFCWINDOW/.test(r.effectiveClass)) ext[r.isExternal == null ? "unset" : "set"]++;
    const u = r.uniformat;
    if (!u.code) none[u.why] = (none[u.why] || 0) + 1;
    if (u.source === "model" && u.rule) {
      const n = Math.min(levelOf(u.rule), u.level);
      if (cutCode(u.rule, n) !== cutCode(u.code, n)) { const k = `${r.ifcClass}: model ${u.code}, rule ${u.rule} (${r.uniformat.why}; rule: ${ruleWhy(r)})`; mism[k] = (mism[k] || 0) + 1; }
    }
  }
  const name = basename(f);
  all.push({ file: name, schema: res.schema, ...s, wallsDoorsWindows: ext, none, mismatches: mism });
  console.log(`${name} (${res.schema}): ${s.rows} elements; Uniformat from the model ${s.model}, from the rules ${s.rule}, none ${s.none}; level 3 ${s.level3}, level 2 ${s.level2}, level 1 ${s.level1}`);
  console.log(`  walls, doors and windows with IsExternal set: ${ext.set} of ${ext.set + ext.unset}`);
  if (s.compared) console.log(`  model's own code on ${s.compared}: rules silent on ${s.ruleSilent}; agree at level 1 ${s.agree1}, level 2 ${s.agree2}, level 3 ${s.agree3} (each at the finer of the two codes' levels)`);
  for (const [k, n] of Object.entries(mism).sort((a, b) => b[1] - a[1]).slice(0, list)) console.log(`    differs ${n} x ${k}`);
  for (const [k, n] of Object.entries(none).sort((a, b) => b[1] - a[1]).slice(0, Math.min(list, 6))) console.log(`    no code ${n} x ${k}`);
}
function ruleWhy(r) { return r.uniformat.ruleWhy ?? ""; }
console.log(`TOTAL ${files.length} models: ${total.rows} elements; model ${total.model}, rules ${total.rule}, none ${total.none}; level 3 ${total.level3}, level 2 ${total.level2}, level 1 ${total.level1}; model codes compared ${total.compared}, rules silent ${total.ruleSilent}, agree L1 ${total.agree1}, L2 ${total.agree2}, L3 ${total.agree3}`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ total, models: all }, null, 1));

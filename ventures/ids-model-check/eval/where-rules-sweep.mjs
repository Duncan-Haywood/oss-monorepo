// Runs where-rules.mjs over every .ifc under a folder and writes, per file,
// the WHERE rule findings and counts, for eval/where_rules_compare.py.
//   node --stack-size=8000 eval/where-rules-sweep.mjs DIR OUT.json
// eval/where-rules-2026-11-24.md.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseStep } from "../step.mjs";
import { Schema } from "../ids.mjs";
import { whereRules } from "../where-rules.mjs";
const D = new URL("../schema/", import.meta.url);
const SS = {}, RR = {};
for (const id of ["ifc2x3", "ifc4", "ifc4x3"]) { SS[id] = new Schema(JSON.parse(readFileSync(new URL(id + ".json", D)))); RR[id] = JSON.parse(readFileSync(new URL("rules-" + id + ".json", D))); }
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { if (n === ".git") continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ifc$/i.test(n)) files.push(p); } };
walk(process.argv[2]);
files.sort();
const out = []; const errs = new Map(); let t0 = Date.now();
for (const f of files) {
  const row = { file: f, findings: [], stats: null };
  try {
    const p = parseStep(readFileSync(f, "utf8"), { eager: true });
    const raw = (p.schema || "").toUpperCase(); const id = raw.startsWith("IFC4X3") ? "ifc4x3" : raw.startsWith("IFC4") ? "ifc4" : raw.startsWith("IFC2X3") ? "ifc2x3" : null;
    if (!id) { row.skipped = raw; out.push(row); continue; }
    const r = whereRules(p, SS[id], RR[id]);
    row.findings = r.findings.map((x) => ({ id: x.id, rule: x.attr, message: x.message.slice(0, 300) }));
    row.stats = { evaluated: r.stats.evaluated, failed: r.stats.failed, unknown: r.stats.unknown };
    for (const e of r.stats.errors) { const g = errs.get(e.rule) || { count: 0, files: 0, first: e.first }; g.count += e.count; g.files++; errs.set(e.rule, g); }
  } catch (e) { row.error = String(e.message).slice(0, 200); }
  out.push(row);
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(files.length, "files", Date.now() - t0, "ms; findings", out.reduce((a, r) => a + r.findings.length, 0), "; crashed", out.filter((r) => r.error).map((r) => r.file + ": " + r.error).slice(0, 5));
console.log("evaluation errors by rule:"); for (const [k, v] of [...errs].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) console.log(" ", k, v.count, "in", v.files, "files:", v.first);

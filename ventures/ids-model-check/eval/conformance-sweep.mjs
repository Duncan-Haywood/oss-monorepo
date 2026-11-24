// Runs conformance.mjs over every .ifc under the folders given and prints, per
// file, the findings folded by (code, class, attribute), then a total by code.
//   node eval/conformance-sweep.mjs DIR... [--json OUT.json]
// eval/conformance-2026-11-24.md.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resources } from "../node.mjs";
import { conformance } from "../conformance.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const out = ji >= 0 ? args.splice(ji, 2)[1] : null;
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === ".git") continue; const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.ifc$/i.test(f)) files.push(p); } };
for (const d of args) walk(d);
files.sort();
const total = new Map(), filesWith = new Map(), rows = [];
let failed = 0, clean = 0;
for (const f of files) {
  let r;
  try { r = conformance(readFileSync(f), resources().schemas); }
  catch (e) { failed++; console.log(`${f}: not read (${e.message})`); continue; }
  if (!r.findings.length) clean++;
  rows.push({ file: f, schema: r.schema, records: r.records, findings: r.findings.map(({ code, id, type, attr }) => ({ code, id, type, attr })) });
  const codes = new Set();
  for (const g of r.groups) {
    total.set(g.code, (total.get(g.code) || 0) + g.count);
    codes.add(g.code);
    console.log(`${f}: ${g.code} ${g.type || ""}${g.attr ? "." + g.attr : ""} x${g.count} (first #${g.first}) ${g.message.slice(0, 160)}`);
  }
  for (const c of codes) filesWith.set(c, (filesWith.get(c) || 0) + 1);
}
console.log(`\n${files.length} files, ${failed} not read, ${clean} with no finding`);
for (const [c, n] of [...total].sort((a, b) => b[1] - a[1])) console.log(`${c.padEnd(26)} ${String(n).padStart(8)} findings in ${filesWith.get(c)} files`);
if (out) writeFileSync(out, JSON.stringify(rows));

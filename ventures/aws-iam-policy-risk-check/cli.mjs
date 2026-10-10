#!/usr/bin/env node
// node cli.mjs policy.json [--json]   (reads stdin when the file is "-")
import { readFileSync } from "node:fs";
import { parsePolicies, analyze } from "./calc.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") || a === "-");
if (!file) { console.error("usage: node cli.mjs policy.json [--json]   (use - for stdin)"); process.exit(2); }
const p = parsePolicies(readFileSync(file === "-" ? 0 : file, "utf8"));
if (p.error) { console.error(p.error); process.exit(2); }
const r = analyze(p.policies, { chars: p.chars });
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  const s = r.summary;
  console.log(`${s.statements} statements (${s.allow} allow, ${s.deny} deny): score ${s.score}/100, grade ${s.grade}; ${s.bySeverity.critical} critical, ${s.bySeverity.high} high, ${s.bySeverity.medium} medium\n`);
  for (const f of r.findings) console.log(`[${f.severity.toUpperCase()}] ${f.sid}: ${f.title}\n    ${f.detail}\n    Fix: ${f.fix}\n`);
}
process.exit(r.summary.bySeverity.critical + r.summary.bySeverity.high ? 1 : 0); // usable as a CI gate

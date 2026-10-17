#!/usr/bin/env node
// node cli.mjs statements.csv [--json] [--fail-on hot,chatty,...]   |   node cli.mjs --query
import { readFileSync } from "node:fs";
import { parseCsv, normalizeRows, analyze, humanMs, QUERY } from "./calc.mjs";

const args = process.argv.slice(2);
const USAGE = "usage: node cli.mjs statements.csv [--json] [--fail-on code,code]   |   node cli.mjs --query";
if (args.includes("--query")) { console.log(QUERY); process.exit(0); }
const failIdx = args.indexOf("--fail-on");
const failOn = failIdx >= 0 ? String(args[failIdx + 1] ?? "").split(",").filter(Boolean) : [];
const file = args.find((a, i) => !a.startsWith("--") && (failIdx < 0 || i !== failIdx + 1));
if (!file) { console.error(USAGE); process.exit(2); }
const n = normalizeRows(parseCsv(readFileSync(file, "utf8")));
if (n.error) { console.error(n.error); process.exit(2); }
const r = analyze(n.statements);
if (args.includes("--json")) console.log(JSON.stringify(r.summary, null, 2));
else {
  const s = r.summary;
  console.log(`${s.statements} statements (${s.families} shapes), ${humanMs(s.totalMs)} total; ${s.k80} shapes make 80% of the time\n`);
  for (const f of r.findings) console.log(`${(f.share * 100).toFixed(1).padStart(5)}%  [${f.flags.map((x) => x.code).join(",")}]  ${f.sample.slice(0, 110)}`);
}
// Exit 1 only when a named rule fires, so it can gate a scheduled job without failing on every run.
process.exit(failOn.length && r.findings.some((f) => f.flags.some((x) => failOn.includes(x.code))) ? 1 : 0);

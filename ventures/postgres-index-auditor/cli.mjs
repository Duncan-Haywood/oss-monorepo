#!/usr/bin/env node
// node cli.mjs indexes.csv [--min-mb N] [--json]   |   node cli.mjs --query
import { readFileSync } from "node:fs";
import { parseCsv, normalizeRows, analyze, humanBytes, QUERY } from "./calc.mjs";

const args = process.argv.slice(2);
if (args.includes("--query")) { console.log(QUERY); process.exit(0); }
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--min-mb");
if (!file) { console.error("usage: node cli.mjs indexes.csv [--min-mb N] [--json]   |   node cli.mjs --query"); process.exit(2); }
const mb = args.includes("--min-mb") ? Number(args[args.indexOf("--min-mb") + 1]) : 0;
const n = normalizeRows(parseCsv(readFileSync(file, "utf8")));
if (n.error) { console.error(n.error); process.exit(2); }
const r = analyze(n.indexes, { minSize: mb > 0 ? mb * 1048576 : 0 });
if (args.includes("--json")) { console.log(JSON.stringify(r, null, 2)); }
else {
  console.log(`${r.summary.indexes} indexes, ${humanBytes(r.summary.totalSize)}; ${r.summary.flagged} candidates, ${humanBytes(r.summary.reclaim)} reclaimable\n`);
  console.log(r.script);
}
process.exit(r.summary.flagged ? 1 : 0); // non-zero when something is flagged, usable as a CI check

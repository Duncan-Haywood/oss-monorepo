// node peppol-readiness-cli.mjs <file-or-folder>... [--csv out.csv] [--json]
// Peppol BIS Billing 3.1.0 readiness for a batch of sent invoices: each UBL or CII file
// runs under 3.0.22 (in force today) and 3.1.0 (applied by access points from
// 2027-02-24), and the report says which pass today and would be rejected then, grouped
// by rule with what to change. Needs `npm i --no-save slimdom fontoxpath`; rules are in
// ./plain/. Exit 0 when no file is newly rejected, 1 when some are, 2 when none was read.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { plainAvailable, runPlain } from "./plain-node.mjs";
import { classifyFile, isPeppolFile, summarize, toCsv, toMarkdown } from "./peppol-readiness.mjs";

const args = process.argv.slice(2);
const csvAt = args.indexOf("--csv");
const csvOut = csvAt >= 0 ? args[csvAt + 1] : null;
const paths = args.filter((a, i) => !a.startsWith("--") && i !== csvAt + 1);
if (!paths.length) {
  console.error("Usage: node peppol-readiness-cli.mjs <file-or-folder>... [--csv out.csv] [--json]");
  process.exit(2);
}
if (!plainAvailable()) {
  console.error("The rule engine is not installed: npm i --no-save slimdom fontoxpath");
  process.exit(2);
}
const files = [];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).sort().forEach((n) => walk(join(p, n))) : /\.xml$/i.test(p) && files.push(p));
paths.forEach(walk);

const rows = [];
for (const file of files) {
  const xml = readFileSync(file, "utf8");
  if (!isPeppolFile(xml)) { rows.push(classifyFile(file, null, null, { peppol: false })); continue; }
  const run = async (opts) => { try { return await runPlain(xml, opts); } catch (e) { return { error: e.message }; } };
  rows.push(classifyFile(file, await run(), await run({ peppolNext: true })));
}
const s = summarize(rows);
if (csvOut) writeFileSync(csvOut, toCsv(s));
console.log(args.includes("--json") ? JSON.stringify(s, null, 2) : toMarkdown(s));
process.exit(!s.peppol ? 2 : s.counts["newly-rejected"] ? 1 : 0);

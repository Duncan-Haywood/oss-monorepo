// What changes for a file when Peppol BIS 3.1.0 replaces 3.0.22 (in force 2027-02-24):
//   node eval/peppol-next-diff.mjs <file-or-dir>...
// Runs each Peppol BIS UBL/CII file (BT-24 naming peppol.eu) through the plain route
// twice, as shipped and with { peppolNext: true }, and prints the Peppol findings only
// one release raises. Totals at the end: files that pass 3.0.22 with no fatal finding
// but fail 3.1.0 are the ones a sender has to fix before February.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runPlain } from "../plain-node.mjs";

const files = [];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).sort().forEach((n) => walk(join(p, n))) : /\.xml$/i.test(p) && files.push(p));
process.argv.slice(2).forEach(walk);
const key = (f) => `${f.rule}:${f.severity}`;
const peppolOnly = (r) => r.findings.filter((f) => /peppol/.test(f.source));
let n = 0, changed = 0, newlyRejected = 0;
const byRule = new Map();
for (const file of files) {
  const xml = readFileSync(file, "utf8");
  if (!/<(?:\w+:)?(?:CustomizationID|GuidelineSpecifiedDocumentContextParameter)\b[\s\S]{0,200}peppol\.eu/i.test(xml)) continue;
  let now, next;
  try { now = await runPlain(xml); next = await runPlain(xml, { peppolNext: true }); } catch (e) { console.log(`${file}: ${e.message}`); continue; }
  if (now.status !== "ok" || !next.sets?.includes("peppol-next")) continue;
  n++;
  const a = new Set(peppolOnly(now).map(key)), b = new Set(peppolOnly(next).map(key));
  const added = [...b].filter((k) => !a.has(k)).sort(), gone = [...a].filter((k) => !b.has(k)).sort();
  if (!added.length && !gone.length) continue;
  changed++;
  const fatalNow = now.findings.some((f) => f.severity === "fatal"), fatalNext = next.findings.some((f) => f.severity === "fatal");
  if (!fatalNow && fatalNext) newlyRejected++;
  for (const k of added) byRule.set(`+ ${k}`, (byRule.get(`+ ${k}`) || 0) + 1);
  for (const k of gone) byRule.set(`- ${k}`, (byRule.get(`- ${k}`) || 0) + 1);
  console.log(`${file}${!fatalNow && fatalNext ? "  [passes 3.0.22, FAILS 3.1.0]" : ""}\n  + ${added.join(", ") || "-"}\n  - ${gone.join(", ") || "-"}`);
}
console.log(`\n${n} Peppol files; ${changed} get a different Peppol verdict; ${newlyRejected} pass 3.0.22 with no fatal finding and fail 3.1.0.`);
for (const [k, c] of [...byRule].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))) console.log(`  ${k}  ${c}`);

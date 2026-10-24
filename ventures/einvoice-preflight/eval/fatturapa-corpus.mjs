// Runs the FatturaPA rules (IT-001..IT-022) over the fatturaPA/ folder of the
// ZUGFeRD corpus (git clone --depth 1 https://github.com/ZUGFeRD/corpus), which
// holds the Agenzia delle Entrate's official samples and eigor's. Not copied here.
//   node eval/fatturapa-corpus.mjs path/to/corpus/fatturaPA
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkFatturaPa } from "../fatturapa.mjs";

function* walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) yield* walk(p); else if (n.endsWith(".xml")) yield p;
  }
}
if (!process.argv[2]) { console.error("usage: node eval/fatturapa-corpus.mjs <corpus>/fatturaPA"); process.exit(2); }
const tally = {};
let files = 0;
for (const p of walk(process.argv[2])) {
  const r = checkFatturaPa(readFileSync(p, "utf8"));
  files++;
  const rules = [...new Set(r.findings.map((f) => f.rule))].sort();
  for (const x of rules) tally[x] = (tally[x] || 0) + 1;
  console.log(p.split("fatturaPA/").pop(), rules.join(" ") || "-", r.skipped.length ? `(skipped ${r.skipped.length})` : "");
}
console.log(`\n${files} files; files per rule:`, JSON.stringify(Object.fromEntries(Object.entries(tally).sort())));

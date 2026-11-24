// @ts-check
// Submit-requirements outside Part 1 submittal articles, on UFGS sections.
// Usage: node eval/buried-ufgs.mjs <folder of .SEC files> [--sample N --seed S]
// Renders sections as ufgs-eval.mjs does, builds the register, and prints
// counts plus a seeded random sample of found sentences to read by hand.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderSec } from "./ufgs.mjs";
import { buildRegister, linesFromText } from "../engine.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/buried-ufgs.mjs <dir of .SEC> [--sample N --seed S]"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const sampleN = arg("--sample", 0), seed = arg("--seed", 1);
const pages = [];
for (const f of readdirSync(dir).filter((f) => /\.sec$/i.test(f)).sort()) {
  const r = renderSec(readFileSync(join(dir, f), "latin1"));
  if (!r.number) continue;
  const num = r.number.replace(/\s+/g, " ");
  const ls = r.text.split("\n");
  for (let i = 0; i < ls.length; i += 55) pages.push([...ls.slice(i, i + 55), "", `SECTION ${num}  Page ${Math.floor(i / 55) + 1}`].join("\n"));
}
const reg = buildRegister(linesFromText(pages.join("\f")));
const b = reg.buried;
const byPart = {};
for (const x of b) byPart[x.part] = (byPart[x.part] || 0) + 1;
const uncovered = b.filter((x) => !x.coveredBy);
console.log(`${reg.sections.length} sections, ${reg.items.length} Part 1 rows`);
console.log(`outside Part 1 lists: ${b.length} sentences in ${new Set(b.map((x) => x.section)).size} sections; by part ${JSON.stringify(byPart)}`);
console.log(`matched to a Part 1 row: ${b.length - uncovered.length}; unmatched: ${uncovered.length}; with a When: ${b.filter((x) => x.when).length}`);
if (sampleN) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pool = [...b];
  for (let i = 0; i < sampleN && pool.length; i++) {
    const x = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const cov = x.coveredBy ? reg.items.find((it) => it.id === x.coveredBy) : null;
    console.log(`\n#${i + 1} ${x.id} [${x.article}] ${x.sd || "Other"} when="${x.when}"\n  ${x.text}\n  covered by: ${cov ? `${cov.id} ${cov.sd} ${cov.label}` : "-"}`);
    if (!cov) console.log(`  Part 1 list: ${reg.items.filter((it) => it.section === x.section).map((it) => it.label).join(" | ").slice(0, 600)}`);
  }
}

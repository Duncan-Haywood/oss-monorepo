// @ts-check
// Score the register against the submittal lists UFGS sections tag in their
// own XML. Usage: node eval/ufgs-eval.mjs <folder of .SEC files> [--show N]
// Each section is rendered on its own (eval/ufgs.mjs), then all of them are
// joined with form feeds into one "book" so section splitting is tested too.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderSec } from "./ufgs.mjs";
import { buildRegister, linesFromText } from "../engine.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/ufgs-eval.mjs <dir of .SEC> [--show N]"); process.exit(2); }
const show = Number(process.argv[process.argv.indexOf("--show") + 1] || 0) || 0;
const files = readdirSync(dir).filter((f) => /\.sec$/i.test(f)).sort();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const pages = [];
const truthBy = new Map();
for (const f of files) {
  const xml = readFileSync(join(dir, f), "latin1");
  const r = renderSec(xml);
  if (!r.number) continue;
  const num = r.number.replace(/\s+/g, " ");
  truthBy.set(num, r.truth);
  // ~55 lines per printed page, with a running footer to strip.
  const ls = r.text.split("\n");
  for (let i = 0; i < ls.length; i += 55) pages.push([...ls.slice(i, i + 55), "", `SECTION ${num}  Page ${Math.floor(i / 55) + 1}`].join("\n"));
}
const reg = buildRegister(linesFromText(pages.join("\f")));
let tp = 0, fp = 0, fn = 0, sdRight = 0, gRight = 0, matched = 0;
const misses = [], extras = [];
const secFound = new Set(reg.sections.map((s) => s.number));
let secMissed = 0;
for (const [num, truth] of truthBy) {
  if (!secFound.has(num)) secMissed++;
  const got = reg.items.filter((i) => i.section === num);
  const pool = got.map((g) => ({ g, key: norm(g.label), used: false }));
  for (const t of truth) {
    const k = norm(t.name);
    const hit = pool.find((p) => !p.used && p.key === k) || pool.find((p) => !p.used && (p.key.startsWith(k) || k.startsWith(p.key)) && Math.min(p.key.length, k.length) > 6);
    if (hit) {
      hit.used = true; tp++; matched++;
      if (hit.g.sd === t.sd) sdRight++;
      if ((hit.g.approval === "G") === t.g) gRight++;
    } else { fn++; misses.push(`${num} ${t.sd} ${t.name}`); }
  }
  for (const p of pool) if (!p.used) { fp++; extras.push(`${num} ${p.g.sd} ${p.g.label}`); }
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "-") + "%";
console.log(`files ${files.length}, sections rendered ${truthBy.size}, sections found ${reg.sections.length} (missed ${secMissed})`);
console.log(`items in XML ${tp + fn}, found ${tp + fp}`);
console.log(`recall ${pct(tp, tp + fn)} (${tp}/${tp + fn}), precision ${pct(tp, tp + fp)} (${tp}/${tp + fp})`);
console.log(`of matched: SD code right ${pct(sdRight, matched)}, G flag right ${pct(gRight, matched)}`);
if (show) {
  console.log("\nmissed (first " + show + "):\n  " + misses.slice(0, show).join("\n  "));
  console.log("\nextra (first " + show + "):\n  " + extras.slice(0, show).join("\n  "));
}

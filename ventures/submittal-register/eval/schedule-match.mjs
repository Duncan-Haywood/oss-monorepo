// @ts-check
// Match UFGS section numbers and titles to the activities of real P6
// schedules and print every match, so a reader can judge them.
// Usage: node eval/schedule-match.mjs <dir of UFGS .SEC> <file.xer> [--sample N] [--seed S] [--unmatched N]
// --sample N prints a seeded random N of the matches (for scoring by eye);
// --unmatched N prints N unmatched sections with the activities that share
// any word with the section title (to look for misses).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderSec } from "./ufgs.mjs";
import { matchSections, readXer } from "../schedule.mjs";

const [dir, xer] = process.argv.slice(2);
if (!dir || !xer) { console.error("usage: node eval/schedule-match.mjs <dir of .SEC> <file.xer> [--sample N] [--seed S] [--unmatched N]"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const sampleN = arg("--sample", 0), seed = arg("--seed", 1), unN = arg("--unmatched", 0);

const sections = [];
for (const f of readdirSync(dir).filter((f) => /\.sec$/i.test(f)).sort()) {
  const r = renderSec(readFileSync(join(dir, f), "latin1"));
  // Work sections only: Divisions 03 to 33 (00, 01 and 02 are procurement, general requirements, existing conditions).
  if (r.number && /^(0[3-9]|[12]\d|3[0-3])/.test(r.number) && r.truth.length) sections.push({ number: r.number.replace(/\s+/g, " "), title: r.title });
}
const text = readFileSync(xer, "latin1");
const { activities } = readXer(text);
const t0 = Date.now();
const m = matchSections(sections, activities);
const ms = Date.now() - t0;
const hits = sections.filter((s) => m.get(s.number));
console.log(`${xer.split("/").pop()}: ${activities.length} activities; ${hits.length} of ${sections.length} UFGS work sections matched (${ms} ms)`);
const bySpec = hits.filter((s) => m.get(s.number)?.basis === "spec number").length;
if (bySpec) console.log(`  ${bySpec} by section number in the activity`);

let x = seed >>> 0 || 1;
const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return n ? a.slice(0, n) : arr; };
for (const s of pick(hits, sampleN)) {
  const r = m.get(s.number);
  if (!r) continue;
  console.log(`${s.number.padEnd(14)} ${s.title.slice(0, 44).padEnd(44)} | ${r.activity.start} ${r.activity.code} ${r.activity.name.slice(0, 60)} [${r.basis}; ${r.candidates} cand]`);
}
if (unN) {
  console.log("\nUnmatched sample:");
  const un = pick(sections.filter((s) => !m.get(s.number)), unN);
  for (const s of un) {
    const words = s.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4);
    const near = activities.filter((a) => words.some((w) => a.name.toLowerCase().includes(w.slice(0, 5)))).slice(0, 3).map((a) => a.name.slice(0, 40));
    console.log(`${s.number.padEnd(14)} ${s.title.slice(0, 50).padEnd(50)} | ${near.join(" / ") || "-"}`);
  }
}

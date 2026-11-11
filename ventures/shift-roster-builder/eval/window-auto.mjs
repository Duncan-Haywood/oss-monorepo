// Should half-life auto also offer "last 4 weeks only", and should it pick with the closure-aware score? (2026-11-11)
//
// closure-score.mjs found "last 4 weeks only" clearly beating the plain average at all six Bread Basket settings under
// --score-closed, but half-life auto (demand.mjs pickHalfLife) only chooses among the plain average and half-lives
// 8, 4 and 2, and it picks with the old score (minimum staff counted as needed in every hour the plan staffs).
// This script asks both questions out of sample, the way halflife-default.mjs did: at every tested week, use the
// candidate with the least mean loss over the weeks tested before it (ties to the earlier candidate, so to the plain
// average first; before K earlier weeks, the plain average). Four rules:
//   A-old  candidates all/hl8/hl4/hl2, picked on the old score   (what ships before this change)
//   B-old  A plus last4, picked on the old score
//   A-new  A, picked on the closure-aware score
//   B-new  A plus last4, picked on the closure-aware score
// Each rule's weekly loss is then read under BOTH scores (the plans are the same; only the scorer differs), paired
// against the plain average and against A-old, with normal 95% intervals over weeks.
// Shifts cut (min 4 h, max 8 h), short and over costed the same, as the CLI and page score it.
// Files downloaded and checked by SHA-256, not committed (licence pages not read from the session).
//   node eval/window-auto.mjs [dir-with-french.csv-korean.csv-bb.csv]      output: eval/window-auto.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { id: "french", local: "french.csv", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splhs: [20, 40, 80], unit: "EUR" },
  { id: "korean", local: "korean.csv", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splhs: [15000, 30000, 60000], unit: "won" },
  { id: "breadbasket", local: "bb.csv", url: "https://raw.githubusercontent.com/viktree/curly-octo-chainsaw/master/BreadBasket_DMS.csv", sha: "72d21cc42c084d1e54a7b9183b0294d8b4142cf4b5a224eb41a21228a71797a8", splhs: [5, 10, 20], unit: "tickets" },
];
const K = 4;
const SETS = { A: ["all", "hl8", "hl4", "hl2"], B: ["all", "hl8", "hl4", "hl2", "last4"] };
const RULES = [["A-old", "A", "old"], ["B-old", "B", "old"], ["A-new", "A", "new"], ["B-new", "B", "new"]];
const dir = process.argv[2];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function paired(xs, base) {
  const d = xs.map((x, i) => x - base[i]), m = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  const h = 1.96 * sd / Math.sqrt(d.length);
  return { m, lo: m - h, hi: m + h };
}
// Week i's pick: lowest mean `pickOn` loss over weeks 0..i-1. Returns the ids picked, week by week.
function picks(pickOn, cands) {
  const out = [];
  for (let i = 0; i < pickOn.all.length; i++) {
    let id = "all";
    if (i >= K) { let best = Infinity; for (const c of cands) { const s = mean(pickOn[c].slice(0, i)); if (s < best - 1e-9) { best = s; id = c; } } }
    out.push(id);
  }
  return out;
}
const fmt = (x) => (x >= 0 ? "+" : "") + x.toFixed(1);
const ciS = (p) => `${fmt(p.m)} (${fmt(p.lo)} to ${fmt(p.hi)})`;

const rows = [];
for (const F of FILES) {
  const bytes = dir ? await readFile(`${dir}/${F.local}`) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.id}: SHA-256 ${got} is not the file this was measured on (${F.sha}).`); process.exit(1); }
  const text = bytes.toString("utf8");
  for (const splh of F.splhs) for (const minStaff of [1, 2]) {
    const methods = SETS.B;
    const per = { old: backtestSales(text, { splh, minStaff, shifts: true, methods }).perWeek, new: backtestSales(text, { splh, minStaff, shifts: true, methods, scoreClosed: true }).perWeek };
    const row = { file: F.id, unit: F.unit, splh, minStaff, weeks: per.old.all.length, per, rules: {} };
    for (const [name, set, on] of RULES) {
      const ids = picks(per[on], SETS[set]);
      const tally = {}; for (const id of ids) tally[id] = (tally[id] || 0) + 1;
      row.rules[name] = { ids, tally, old: ids.map((id, i) => per.old[id][i]), new: ids.map((id, i) => per.new[id][i]) };
    }
    rows.push(row);
    console.log(`\n== ${F.id}, ${splh} ${F.unit} per labor hour, min staff ${minStaff} (${row.weeks} weeks)`);
    console.log(`  plain average: old score ${mean(per.old.all).toFixed(1)}, new score ${mean(per.new.all).toFixed(1)} short + over a week; last4 alone vs plain: old ${ciS(paired(per.old.last4, per.old.all))}, new ${ciS(paired(per.new.last4, per.new.all))}`);
    for (const [name] of RULES) {
      const r = row.rules[name], a = row.rules["A-old"];
      console.log(`  ${name}  new score ${mean(r.new).toFixed(1).padStart(6)}  vs plain ${ciS(paired(r.new, per.new.all)).padEnd(24)} vs A-old ${ciS(paired(r.new, a.new)).padEnd(24)}| old score vs A-old ${ciS(paired(r.old, a.old)).padEnd(24)}| used: ${Object.entries(r.tally).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
  }
}

console.log(`\n== Summary over ${rows.length} settings (3 files x 3 rates x 2 minimum staff): clearly better / tie / clearly worse, mean change`);
for (const score of ["new", "old"]) {
  console.log(`  read on the ${score} score:`);
  for (const [name] of RULES) {
    for (const [vs, baseOf] of [["plain", (row) => row.per[score].all], ["A-old", (row) => row.rules["A-old"][score]]]) {
      if (name === "A-old" && vs === "A-old") continue;
      let w = 0, t = 0, l = 0; const ms = [];
      for (const row of rows) { const b = baseOf(row), p = paired(row.rules[name][score], b); ms.push(p.m / Math.max(1e-9, mean(b))); if (p.hi < 0) w++; else if (p.lo > 0) l++; else t++; }
      console.log(`    ${name} vs ${vs.padEnd(6)} ${w} / ${t} / ${l}   mean ${fmt(100 * mean(ms))}%`);
    }
  }
}
// Per-file view of the B-new rule against A-old on the new score.
console.log(`\n== B-new against A-old on the new score, by file`);
for (const F of FILES) {
  const rs = rows.filter((r) => r.file === F.id);
  console.log(`  ${F.id.padEnd(12)} ${rs.map((r) => `${r.splh}/${r.minStaff} ${fmt(paired(r.rules["B-new"].new, r.rules["A-old"].new).m)}`).join(", ")}`);
}

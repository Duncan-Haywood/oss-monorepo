// Should --from-sales weight recent weeks by default, and by how much? (2026-11-11)
//
// Both real bakery backtests (eval/bakery-backtest.mjs, eval/french-bakery.mjs) found a half-life beating the plain
// average, but the best one differed (4 weeks on the Korean file, 2 on the French), and picking a default from the
// same files it is then scored on flatters it. This script asks the question three out-of-sample ways:
//   1. Cross-file: the half-life that won on one bakery, used as a fixed default on the other.
//   2. Online choice ("auto"): at every tested week, use the weighting (plain, half-life 8, 4 or 2) with the least
//      short + over over the weeks already tested before it, which is what a shop could do with only its past. Until
//      `K` earlier weeks exist it uses a fallback (plain, or half-life 4).
//   3. Every method on the same weeks, paired against the plain average, normal 95% interval over weeks.
// Scored as the CLI and page score it: shifts cut from the headcount (--min-shift 4, --max-shift 8), short and over
// costed the same. Files are downloaded and checked by SHA-256 (not committed; see the two scripts above).
//   node eval/halflife-default.mjs [korean.csv french.csv]      output: eval/halflife-default.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { id: "korean", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splhs: [15000, 30000, 60000], cur: "won" },
  { id: "french", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splhs: [20, 40, 80], cur: "EUR" },
];
const K = 4; // earlier tested weeks needed before the online choice trusts its own record
const CANDIDATES = ["all", "hl8", "hl4", "hl2"];

async function load(f, path) {
  const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(f.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== f.sha) { console.error(`${f.id}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  return bytes.toString("utf8");
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function paired(xs, base) {
  const d = xs.map((x, i) => x - base[i]), m = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  const h = 1.96 * sd / Math.sqrt(d.length);
  return { m, lo: m - h, hi: m + h };
}
// Online choice: week i uses the candidate with the lowest mean loss over weeks 0..i-1 (ties go to the earlier
// candidate in CANDIDATES, so to the plain average first); before K weeks, the fallback.
function online(per, fallback) {
  const out = [], picks = {};
  for (let i = 0; i < per.all.length; i++) {
    let id = fallback;
    if (i >= K) {
      let best = Infinity;
      for (const c of CANDIDATES) { const s = mean(per[c].slice(0, i)); if (s < best - 1e-9) { best = s; id = c; } }
    }
    picks[id] = (picks[id] || 0) + 1;
    out.push(per[id][i]);
  }
  return { loss: out, picks };
}

const texts = {};
for (const [i, f] of FILES.entries()) texts[f.id] = await load(f, process.argv[2 + i]);

const rows = []; // one per file x setting
for (const f of FILES) {
  for (const splh of f.splhs) for (const minStaff of [1, 2]) {
    const r = backtestSales(texts[f.id], { splh, minStaff, shifts: true });
    const per = r.perWeek;
    const autoPlain = online(per, "all"), autoHl4 = online(per, "hl4");
    const cand = { all: per.all, hl8: per.hl8, hl4: per.hl4, hl2: per.hl2, "auto(plain first)": autoPlain.loss, "auto(hl4 first)": autoHl4.loss };
    rows.push({ file: f.id, cur: f.cur, splh, minStaff, weeks: r.weeks, cand, picks: autoHl4.picks, inSampleBest: r.best });
  }
}

const fmt = (x) => (x >= 0 ? "+" : "") + x.toFixed(1);
console.log(`Shifts cut from the headcount (min 4 h, max 8 h); short + over person-hours per week; paired against the plain average.\n`);
for (const row of rows) {
  console.log(`== ${row.file}, ${row.splh} ${row.cur} per labor hour, min staff ${row.minStaff} (${row.weeks} weeks; in-sample best ${row.inSampleBest})`);
  for (const [name, loss] of Object.entries(row.cand)) {
    const p = name === "all" ? null : paired(loss, row.cand.all);
    console.log(`  ${name.padEnd(18)} ${mean(loss).toFixed(1).padStart(7)}${p ? `  ${fmt(p.m)} (${fmt(p.lo)} to ${fmt(p.hi)})` : "  baseline"}`);
  }
  console.log(`  auto(hl4 first) used: ${Object.entries(row.picks).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

// Summary: wins (interval below zero), ties, losses (interval above zero) against the plain average per method.
console.log(`\n== Summary over ${rows.length} settings (2 files x 3 rates x 2 minimum staff): clearly better / tie / clearly worse than plain, mean change`);
for (const name of Object.keys(rows[0].cand).filter((n) => n !== "all")) {
  let w = 0, t = 0, l = 0; const ms = [];
  for (const row of rows) {
    const p = paired(row.cand[name], row.cand.all); ms.push(p.m / mean(row.cand.all));
    if (p.hi < 0) w++; else if (p.lo > 0) l++; else t++;
  }
  console.log(`  ${name.padEnd(18)} ${w} / ${t} / ${l}   mean ${(100 * mean(ms)).toFixed(1)}% of the plain average's short + over`);
}
// Cross-file: the fixed half-life that did best (lowest summed relative loss) on one file, scored on the other.
console.log(`\n== Cross-file: pick the fixed half-life on one bakery, score it on the other`);
for (const [train, test] of [["korean", "french"], ["french", "korean"]]) {
  const rel = (rs, c) => mean(rs.map((row) => mean(row.cand[c]) / mean(row.cand.all)));
  const tr = rows.filter((r) => r.file === train), te = rows.filter((r) => r.file === test);
  const pick = ["hl8", "hl4", "hl2"].reduce((a, b) => (rel(tr, b) < rel(tr, a) ? b : a));
  const res = te.map((row) => paired(row.cand[pick], row.cand.all));
  console.log(`  chosen on ${train}: ${pick}; on ${test}: ${res.filter((p) => p.hi < 0).length} of ${res.length} settings clearly better, ${res.filter((p) => p.lo > 0).length} clearly worse; mean ${(100 * (rel(te, pick) - 1)).toFixed(1)}%`);
}

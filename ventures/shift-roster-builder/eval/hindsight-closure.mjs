// How much of the 4-week window's gain is hindsight? (2026-11-12)
//
// The closure score (the --backtest and half-life-auto default since 2026-11-12) decides which weekday-hours are
// "normally shut" from the whole file, the tested week's own future included. Plans never see that, but the score
// does, and the 4-week window is exactly the method that tracks a change in opening hours fastest, so its measured gain
// (eval/window-auto.mjs: -16.3% against the four-weighting auto set, Bread Basket -47%) could partly be the scorer
// knowing the new hours before any plan could. Here the reference for each tested week is built from the dates before
// that week only (backtestSales closedFrom: "past"), which is what a shop's own history could have said at the time.
//
// Same 18 settings as eval/window-auto.mjs (3 real files x 3 rates x min staff 1, 2), same online choice (K = 4).
// Pre-registered before the first run (2026-11-12):
//   1. The window stays in half-life auto if, under the past-only reference, auto B (A plus last4) is clearly worse
//      than auto A (paired 95% interval above zero) in none of the 18 settings and its mean change against A is below
//      zero. Otherwise its gain was hindsight and it comes out of the auto set.
//   2. The share of the gain that survives is reported as mean change (past) / mean change (whole file); no threshold.
//   3. The whole-file reference stays the scorer's default unless rule 1 fails.
//
// Files are downloaded and checked by SHA-256, not committed.
//   node eval/hindsight-closure.mjs [dir-with-french.csv-korean.csv-bb.csv]      output: eval/hindsight-closure.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { id: "french", local: "french.csv", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splhs: [20, 40, 80], unit: "EUR" },
  { id: "korean", local: "korean.csv", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splhs: [15000, 30000, 60000], unit: "won" },
  { id: "breadbasket", local: "bb.csv", url: "https://raw.githubusercontent.com/viktree/curly-octo-chainsaw/master/BreadBasket_DMS.csv", sha: "72d21cc42c084d1e54a7b9183b0294d8b4142cf4b5a224eb41a21228a71797a8", splhs: [5, 10, 20], unit: "tickets" },
];
const K = 4;
const A = ["all", "hl8", "hl4", "hl2"], B = [...A, "last4"];
const dir = process.argv[2];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (x) => (x >= 0 ? "+" : "") + x.toFixed(1);
function paired(xs, base) {
  const d = xs.map((x, i) => x - base[i]), m = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  const h = 1.96 * sd / Math.sqrt(d.length);
  return { m, lo: m - h, hi: m + h };
}
function online(per, cands) {
  const out = [], picks = {};
  for (let i = 0; i < per.all.length; i++) {
    let id = "all";
    if (i >= K) { let best = Infinity; for (const c of cands) { const s = mean(per[c].slice(0, i)); if (s < best - 1e-9) { best = s; id = c; } } }
    picks[id] = (picks[id] || 0) + 1;
    out.push(per[id][i]);
  }
  return { loss: out, picks };
}

const rows = [];
for (const F of FILES) {
  const bytes = dir ? await readFile(`${dir}/${F.local}`) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.id}: SHA-256 ${got} is not the file this was measured on (${F.sha}).`); process.exit(1); }
  const text = bytes.toString("utf8");
  for (const splh of F.splhs) for (const minStaff of [1, 2]) {
    const row = { file: F.id, unit: F.unit, splh, minStaff, ref: {} };
    for (const ref of ["file", "past"]) {
      const r = backtestSales(text, { splh, minStaff, shifts: true, methods: B, closedFrom: ref });
      const a = online(r.perWeek, A), b = online(r.perWeek, B);
      row.ref[ref] = { weeks: r.weeks, plain: r.perWeek.all, a, b, p: paired(b.loss, a.loss) };
    }
    rows.push(row);
    console.log(`== ${F.id}, ${splh} ${F.unit}/labor hour, min staff ${minStaff} (${row.ref.file.weeks} weeks)`);
    for (const ref of ["file", "past"]) {
      const x = row.ref[ref];
      console.log(`  ${ref === "file" ? "whole-file reference" : "past-only reference "}: plain ${mean(x.plain).toFixed(1)}, auto A ${mean(x.a.loss).toFixed(1)}, auto B ${mean(x.b.loss).toFixed(1)}  B vs A ${fmt(x.p.m)} (${fmt(x.p.lo)} to ${fmt(x.p.hi)})  B used: ${Object.entries(x.b.picks).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    }
  }
}

console.log("\n== Summary, 18 settings: auto B vs auto A, clearly better / tie / clearly worse, mean change");
const share = {};
for (const ref of ["file", "past"]) {
  let w = 0, t = 0, l = 0; const ms = [];
  for (const r of rows) { const x = r.ref[ref]; ms.push(x.p.m / mean(x.a.loss)); if (x.p.hi < 0) w++; else if (x.p.lo > 0) l++; else t++; }
  share[ref] = mean(ms);
  console.log(`  ${ref === "file" ? "whole-file reference" : "past-only reference "}: ${w} / ${t} / ${l}   mean ${(100 * mean(ms)).toFixed(1)}%`);
  for (const f of FILES) console.log(`    ${f.id}: mean ${(100 * mean(rows.filter((r) => r.file === f.id).map((r) => r.ref[ref].p.m / mean(r.ref[ref].a.loss)))).toFixed(1)}%`);
}
const worse = rows.filter((r) => r.ref.past.p.lo > 0).length;
console.log(`\nRule 1 (window stays): clearly worse under past-only in ${worse} of ${rows.length}, mean ${(100 * share.past).toFixed(1)}% -> ${worse === 0 && share.past < 0 ? "PASS, the window stays" : "FAIL, the window comes out"}`);
console.log(`Rule 2 (share of the gain that survives): ${(100 * share.past / share.file).toFixed(0)}%`);

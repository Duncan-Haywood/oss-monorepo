// The fourth real sales file: does it agree with the three bakeries? (2026-11-11)
//
// Two items in the flagship's `next:` waited on "a fourth file agrees": making --score-closed the --backtest default, and
// offering the 4-week window in half-life auto under the default score (eval/window-auto.mjs: under --score-closed,
// auto B = plain/hl8/hl4/hl2/last4 was clearly better than A = plain/hl8/hl4/hl2 at 6 of 18 settings, all Bread
// Basket, and clearly worse at none).
//
// The file: UCI "Online Retail II" (Chen, 2019; CC BY 4.0; https://archive.ics.uci.edu/dataset/502/online+retail+ii),
// a UK online gift wholesaler's invoice lines, 2009-12-01 to 2011-12-09, 1,067,371 rows, columns
// Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country. UCI refused the connection from this
// session; read from a GitHub LFS mirror whose SHA-256 is the pointer's oid. Not a shop with a counter: staffing it is
// staffing order intake and dispatch, which follows when orders arrive. Not committed (37 MB compressed upstream).
//
// Pre-registered before the first run (2026-11-11). The fourth file agrees if, at all 6 settings (3 rates x minimum
// staff 1 or 2; shifts cut, short and over costed the same):
//   (1) score: under --score-closed, rules off (--keep-rare) minus rules on is not clearly negative (the closure and
//       rare-hour rules are not shown to hurt), and
//   (2) window: under --score-closed, auto B is clearly worse than auto A in none.
// Both hold: the next run may make --score-closed the default and offer the window. Either fails: both stay opt-in.
// The default-score reading of B vs A is reported beside it.
//   node eval/fourth-file.mjs [path-to-online_retail_II.csv]      output: eval/fourth-file.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const F = { id: "online-retail-ii", url: "https://media.githubusercontent.com/media/MousaAshraf/E-commerce-Product-Recommendation/HEAD/data/online_retail_II.csv", sha: "32569a66f3842a82b0d8c4d63b263c5d98a76bde5d1f65c6c01bf457e541d3a9", splhs: [2000, 4000, 8000], unit: "GBP" };
const K = 4;
const SETS = { A: ["all", "hl8", "hl4", "hl2"], B: ["all", "hl8", "hl4", "hl2", "last4"] };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (x) => (x >= 0 ? "+" : "") + x.toFixed(1);
function paired(xs, base) {
  const d = xs.map((x, i) => x - base[i]), m = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  const h = 1.96 * sd / Math.sqrt(d.length);
  return { m, lo: m - h, hi: m + h };
}
const ci = (p) => `${fmt(p.m)} (${fmt(p.lo)} to ${fmt(p.hi)})`;
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

const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on (${F.sha}).`); process.exit(1); }
const text = bytes.toString("utf8");

let pass1 = 0, pass2 = 0, n = 0;
for (const splh of F.splhs) for (const minStaff of [1, 2]) {
  n++;
  const base = { splh, minStaff, shifts: true, methods: SETS.B };
  const old = backtestSales(text, base), neu = backtestSales(text, { scoreClosed: false, ...base, scoreClosed: true });
  const offNew = backtestSales(text, { scoreClosed: false, ...base, scoreClosed: true, keepRare: true, methods: [] });
  const offOld = backtestSales(text, { scoreClosed: false, ...base, keepRare: true, methods: [] });
  console.log(`\n== ${F.id}, ${splh} ${F.unit} per labor hour, minimum staff ${minStaff} (${old.weeks} tested weeks)`);
  const a = (b) => b.methods[0];
  console.log(`  plain average: scheduled ${a(neu).scheduled.toFixed(1)}; short + over old score ${a(old).miss.toFixed(1)}, new score ${a(neu).miss.toFixed(1)}`);
  const rOld = paired(offOld.perWeek.all, old.perWeek.all), rNew = paired(offNew.perWeek.all, neu.perWeek.all);
  console.log(`  (1) rules off minus rules on: old score ${ci(rOld)}, new score ${ci(rNew)}`);
  if (!(rNew.hi < 0)) pass1++;
  const res = {};
  for (const [score, b] of [["old", old], ["new", neu]]) {
    const A = online(b.perWeek, SETS.A), B = online(b.perWeek, SETS.B);
    res[score] = paired(B.loss, A.loss);
    console.log(`  auto, ${score} score: A ${mean(A.loss).toFixed(1)} (${Object.entries(A.picks).map(([k, v]) => `${k} ${v}`).join(", ")}); B ${mean(B.loss).toFixed(1)} (${Object.entries(B.picks).map(([k, v]) => `${k} ${v}`).join(", ")}); B vs A ${ci(res[score])}`);
  }
  if (!(res.new.lo > 0)) pass2++;
  console.log(`  weightings vs plain, new score: ${neu.methods.slice(1).map((m) => `${m.id} ${ci({ m: m.vsDefault, lo: m.ci[0], hi: m.ci[1] })}`).join("; ")}`);
}
console.log(`\n== Pre-registered test, ${n} settings: (1) rules not shown to hurt under the new score at ${pass1} of ${n}; (2) auto B not clearly worse than A under the new score at ${pass2} of ${n}.`);
console.log(pass1 === n && pass2 === n ? "AGREES: both conditions hold at every setting." : "DOES NOT AGREE: at least one condition fails; both stay opt-in.");

// Should half-life auto also offer "the last 4 weeks only"? (2026-11-11)
//
// Under --score-closed, "last 4 weeks only" beat the plain average clearly at all six Bread Basket settings
// (eval/closure-score.out.txt), but half-life auto (`pickHalfLife` in demand.mjs) only chooses among equal weights and
// half-lives 8, 4 and 2. Adding a candidate is not free: a choice among more options overfits more, and a 4-week window
// forgets a shop's quiet weekday hours faster than a half-life does. So the question is asked out of sample, the way
// eval/halflife-default.mjs asked it: at every tested week, the online rule uses the candidate with the least short +
// over over the weeks tested before it (plain until K = 4 earlier weeks exist; ties to the earlier candidate, so plain
// first), which is what a shop could do with only its past.
//
//   A: the shipped set, plain / hl8 / hl4 / hl2
//   B: A plus last4
//   C: A plus last4 and last1 (asked too, so a "more windows" reading is not missed)
//
// Pre-registered before the first run (2026-11-11): B ships as the new auto set if, under the default score, it is
// clearly worse than A (paired 95% interval above zero) in none of the 18 settings (3 files x 3 rates x min staff 1, 2)
// and its mean change against A is below zero. The --score-closed reading is reported beside it, not used to decide,
// because --score-closed is not the default yet.
//
// Files are downloaded and checked by SHA-256, not committed (licence pages not read from the session).
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
const SETS = { A: ["all", "hl8", "hl4", "hl2"], B: ["all", "hl8", "hl4", "hl2", "last4"], C: ["all", "hl8", "hl4", "hl2", "last4", "last1"] };
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
    if (i >= K) {
      let best = Infinity;
      for (const c of cands) { const s = mean(per[c].slice(0, i)); if (s < best - 1e-9) { best = s; id = c; } }
    }
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
  for (const splh of F.splhs) for (const minStaff of [1, 2]) for (const scoreClosed of [false, true]) {
    const r = backtestSales(text, { splh, minStaff, shifts: true, scoreClosed });
    const auto = Object.fromEntries(Object.entries(SETS).map(([k, c]) => [k, online(r.perWeek, c)]));
    // What pickHalfLife would choose for the week after the file ends (all past weeks), per set.
    const final = Object.fromEntries(Object.entries(SETS).map(([k, c]) => [k, c.reduce((a, x) => (mean(r.perWeek[x]) < mean(r.perWeek[a]) - 1e-9 ? x : a), "all")]));
    rows.push({ file: F.id, unit: F.unit, splh, minStaff, scoreClosed, weeks: r.weeks, plain: r.perWeek.all, auto, final });
  }
}

console.log("Shifts cut (min 4 h, max 8 h); short + over person-hours a week; online choice per tested week (K = 4).\n");
for (const row of rows) {
  const a = row.auto.A.loss;
  console.log(`== ${row.file}, ${row.splh} ${row.unit}/labor hour, min staff ${row.minStaff}, ${row.scoreClosed ? "--score-closed" : "default score"} (${row.weeks} weeks)`);
  console.log(`  plain ${mean(row.plain).toFixed(1)}; auto A ${mean(a).toFixed(1)}`);
  for (const k of ["B", "C"]) {
    const p = paired(row.auto[k].loss, a);
    console.log(`  auto ${k} ${mean(row.auto[k].loss).toFixed(1)}  vs A ${fmt(p.m)} (${fmt(p.lo)} to ${fmt(p.hi)})  used: ${Object.entries(row.auto[k].picks).map(([x, n]) => `${x} ${n}`).join(", ")}`);
  }
  console.log(`  pick on all weeks: A ${row.final.A}, B ${row.final.B}, C ${row.final.C}`);
}
for (const sc of [false, true]) {
  const rs = rows.filter((r) => r.scoreClosed === sc);
  console.log(`\n== Summary, ${sc ? "--score-closed" : "default score"}, ${rs.length} settings: clearly better / tie / clearly worse, mean change`);
  for (const [k, ref] of [["A", "plain"], ["B", "plain"], ["C", "plain"], ["B", "A"], ["C", "A"]]) {
    let w = 0, t = 0, l = 0; const ms = [];
    for (const r of rs) {
      const base = ref === "plain" ? r.plain : r.auto.A.loss;
      const p = paired(r.auto[k].loss, base); ms.push(p.m / mean(base));
      if (p.hi < 0) w++; else if (p.lo > 0) l++; else t++;
    }
    console.log(`  auto ${k} vs ${ref.padEnd(5)} ${w} / ${t} / ${l}   mean ${(100 * mean(ms)).toFixed(1)}%`);
  }
  for (const f of FILES) {
    const fr = rs.filter((r) => r.file === f.id);
    console.log(`  ${f.id}: auto B vs A mean ${(100 * mean(fr.map((r) => paired(r.auto.B.loss, r.auto.A.loss).m / mean(r.auto.A.loss)))).toFixed(1)}%`);
  }
}

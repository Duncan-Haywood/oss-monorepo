// Joining short runs in the priced shift cut (2026-11-11, README "Joining short runs"), on both real POS exports (same
// public mirrors and SHA-256 as eval/cost-cut.mjs; downloaded, not committed). The priced cut used to decide each run
// shorter than --min-shift on its own: stretch it to the cheapest minShift window or leave it unstaffed. Two short runs an
// hour apart (a 3rd person at 11:00 and at 13:00) were each priced as a separate 4-hour shift, and a short run was never
// added to the shift next to it. The joined cut (joinLevel in demand.mjs) chooses each headcount level whole: a block may
// cover several runs and the gaps between them. Every full week after the first four is planned from the weeks before it
// and scored as r x short + over, for the plain average (cut at r) and the fractile rule, both with every earlier week
// equal. "joined - per run" is paired over the tested weeks with a normal 95% interval. Person-hours a week, minimum
// staff 1, --max-shift 8. Also counted: the share of planned shifts that differ.
// Output: eval/join-cut.out.txt.   node eval/join-cut.mjs [korean.csv french.csv]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const RS = [1 / 3, 1, 3];
const MIN_SHIFTS = [4, 6];
const f = (x) => x.toFixed(1);
const paired = (wx, wy) => {
  const d = wx.map((x, k) => x - wy[k]);
  const md = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - md) ** 2, 0) / Math.max(1, d.length - 1));
  const half = 1.96 * sd / Math.sqrt(d.length);
  return { md, lo: md - half, hi: md + half, s: `${md >= 0 ? "+" : ""}${f(md)} (${f(md - half)} to ${f(md + half)})` };
};
let wins = 0, losses = 0, ties = 0, n = 0;
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name}`);
  console.log("splh   min  r     | fractile: per-run short over cost | joined short over cost | joined - per run (95% CI) | average: per-run cost joined cost | joined - per run (95% CI)");
  for (const splh of F.splh) for (const minShift of MIN_SHIFTS) for (const r of RS) {
    const base = { splh, shortCost: r, minShift, shifts: true };
    const A = backtestSales(text, base), B = backtestSales(text, { ...base, join: true });
    const qa = A.methods.find((m) => m.id === "q-all"), qb = B.methods.find((m) => m.id === "q-all");
    const dq = paired(B.perWeek["q-all"], A.perWeek["q-all"]), da = paired(B.perWeek.all, A.perWeek.all);
    for (const d of [dq, da]) { n++; if (d.hi < 0) wins++; else if (d.lo > 0) losses++; else ties++; }
    console.log(`${String(splh).padEnd(7)}${String(minShift).padEnd(5)}${r.toFixed(2).padEnd(6)}| ${f(qa.short).padStart(23)} ${f(qa.over).padStart(4)} ${f(qa.miss).padStart(5)} | ${f(qb.short).padStart(12)} ${f(qb.over).padStart(4)} ${f(qb.miss).padStart(5)} | ${dq.s.padEnd(26)}| ${f(A.methods[0].miss).padStart(20)} ${f(B.methods[0].miss).padStart(11)} | ${da.s}`);
  }
}
console.log(`\n${n} comparisons (fractile and average rows): joined clearly cheaper in ${wins}, clearly dearer in ${losses}, interval spans 0 in ${ties}.`);

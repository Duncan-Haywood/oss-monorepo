// The cost-aware cut (2026-11-11) on both real POS exports. eval/short-cost.mjs scored the headcount *plan*; a week is
// worked as *shifts*, and the cut stretches every run shorter than --min-shift to a whole shift. This scores what the
// shifts staff, three ways, for the plain average and for the fractile rule (every earlier week equal):
//   plan  - the headcount plan before the cut (what short-cost.mjs reported)
//   plain - the shifts the usual cut makes (stretch every short run)
//   aware - the cost-aware cut (demand.mjs marginalCost): each short run is stretched to its cheapest window, or dropped
//           when every window costs more in expected r x short + over than leaving those hours short
// Each week is planned from the weeks before it and scored as r x short + over person-hours. "vs" columns are paired
// differences with a normal 95% interval over the tested weeks. Same public mirrors and SHA-256 as eval/short-cost.mjs;
// the files are downloaded, not committed.   node eval/cut-cost.mjs [korean.csv french.csv]   Output: eval/cut-cost.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const RS = [1 / 3, 1, 2, 3, 5];
const f = (x) => x.toFixed(1);
// Paired difference of two per-week cost series, mean and normal 95% interval.
const paired = (a, b) => {
  const d = a.map((x, i) => x - b[i]), n = d.length, m = d.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)), h = n > 1 ? 1.96 * sd / Math.sqrt(n) : 0;
  return `${m >= 0 ? "+" : ""}${f(m)} (${f(m - h)} to ${f(m + h)})`;
};
// backtestSales returns means; the per-week series are rebuilt from short and over by re-running with weekly output.
const weekly = (text, o) => {
  const b = backtestSales(text, { ...o, weekly: true });
  return Object.fromEntries(b.methods.map((m) => [m.id, m]));
};
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name} (minimum staff 1, shifts 4-8 h)`);
  console.log("splh    r    | average: plan plain aware | fractile: plan plain aware (short/over) | fractile aware vs average plain     | fractile aware vs fractile plain");
  for (const splh of F.splh) for (const r of RS) {
    const [P, C, A] = [null, "plain", "aware"].map((cut) => weekly(text, { splh, shortCost: r, cut }));
    const cost = (m) => m.weeks.map((w) => r * w.short + w.over);
    console.log(`${String(splh).padEnd(6)}${r.toFixed(2).padStart(5)}  | ${f(P.all.miss).padStart(13)} ${f(C.all.miss).padStart(5)} ${f(A.all.miss).padStart(5)} | ${f(P["q-all"].miss).padStart(14)} ${f(C["q-all"].miss).padStart(5)} ${f(A["q-all"].miss).padStart(5)} (${f(A["q-all"].short)}/${f(A["q-all"].over)})`.padEnd(88) + `| ${paired(cost(A["q-all"]), cost(C.all)).padEnd(28)}| ${paired(cost(A["q-all"]), cost(C["q-all"]))}`);
  }
  const splh = F.splh[1], r = 3;
  console.log(`\nsplh ${splh}, r = ${r}: shortest shift  | average plain | fractile plain aware | aware vs plain (fractile)`);
  for (const minShift of [2, 3, 4, 6]) {
    const [C, A] = ["plain", "aware"].map((cut) => weekly(text, { splh, shortCost: r, cut, minShift }));
    const cost = (m) => m.weeks.map((w) => r * w.short + w.over);
    console.log(`  ${String(minShift).padStart(2)} h${" ".repeat(28)}${f(C.all.miss).padStart(6)} | ${f(C["q-all"].miss).padStart(14)} ${f(A["q-all"].miss).padStart(5)} | ${paired(cost(A["q-all"]), cost(C["q-all"]))}`);
  }
}

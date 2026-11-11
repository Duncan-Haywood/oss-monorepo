// Can the backtest score a staffed closure? (2026-11-11)
// Before --score-closed, the backtest counted minimum staff as needed in every hour the plan staffed, so a plan that
// staffed the French bakery's lunch closure (about 13:30-16:00) was never "over" there, and the break rule's saving of
// 9-10 person-hours a week could not be scored. With scoreClosed, minimum staff is needed only in hours the shop normally
// trades (on 1 in 5 of that weekday's dates or more, across the whole file) or on a date it sold something in that hour.
// This script scores the default plan with the break and rare-hour rules on and off (--keep-rare) under both scorings,
// and checks whether the new scoring changes which weighting wins on each real file.
// Files are downloaded and checked by SHA-256, not committed (licence pages not read from the session).
//   node eval/closure-score.mjs [dir-with-french.csv-korean.csv-bb.csv]
// Output: eval/closure-score.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { id: "french", local: "french.csv", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splhs: [20, 40, 80], unit: "EUR" },
  { id: "korean", local: "korean.csv", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splhs: [15000, 30000, 60000], unit: "won" },
  { id: "breadbasket", local: "bb.csv", url: "https://raw.githubusercontent.com/viktree/curly-octo-chainsaw/master/BreadBasket_DMS.csv", sha: "72d21cc42c084d1e54a7b9183b0294d8b4142cf4b5a224eb41a21228a71797a8", splhs: [5, 10, 20], unit: "tickets" },
];
const dir = process.argv[2];
const f1 = (x) => x.toFixed(1);
const ci = (m) => `${m.vsDefault >= 0 ? "+" : ""}${f1(m.vsDefault)} (${f1(m.ci[0])} to ${f1(m.ci[1])})`;

for (const F of FILES) {
  const bytes = dir ? await readFile(`${dir}/${F.local}`) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.id}: SHA-256 ${got} is not the file this was measured on (${F.sha}).`); process.exit(1); }
  const text = bytes.toString("utf8");
  for (const splh of F.splhs) {
    for (const minStaff of [1, 2]) {
      const base = { splh, minStaff, shifts: true };
      const run = (extra) => backtestSales(text, { ...base, ...extra });
      const onOld = run({}), offOld = run({ keepRare: true });
      const onNew = run({ scoreClosed: true }), offNew = run({ keepRare: true, scoreClosed: true });
      const a = (b) => b.methods[0];
      console.log(`\n== ${F.id}, ${splh} ${F.unit} per labor hour, minimum staff ${minStaff} (${onOld.weeks} tested weeks; plain average, shifts cut)`);
      console.log(`                         scheduled   old score: short   over  short+over   new score: short   over  short+over`);
      for (const [lab, o, n] of [["rules on (default)", onOld, onNew], ["rules off (--keep-rare)", offOld, offNew]]) {
        console.log(`${lab.padEnd(25)}${f1(a(o).scheduled).padStart(9)}${f1(a(o).short).padStart(19)}${f1(a(o).over).padStart(7)}${f1(a(o).miss).padStart(12)}${f1(a(n).short).padStart(19)}${f1(a(n).over).padStart(7)}${f1(a(n).miss).padStart(12)}`);
      }
      // Paired per-week difference, rules off minus rules on, under each score.
      const pair = (x, y) => {
        const d = x.perWeek.all.map((v, i) => v - y.perWeek.all[i]);
        const m = d.reduce((s, v) => s + v, 0) / d.length, sd = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, d.length - 1));
        const h = 1.96 * sd / Math.sqrt(d.length);
        return `${m >= 0 ? "+" : ""}${f1(m)} (${f1(m - h)} to ${f1(m + h)})`;
      };
      console.log(`rules off minus rules on, short+over a week: old score ${pair(offOld, onOld)}, new score ${pair(offNew, onNew)}`);
      const best = (b) => `${b.methods.find((m) => m.id === b.best).label}${b.clear ? " (clear)" : ""}`;
      console.log(`best weighting: old score ${best(onOld)}; new score ${best(onNew)}`);
      console.log(`weightings vs plain average, new score: ${onNew.methods.slice(1).map((m) => `${m.id} ${ci(m)}`).join("; ")}`);
    }
  }
}

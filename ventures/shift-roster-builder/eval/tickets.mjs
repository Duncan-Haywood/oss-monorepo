// Plan from tickets (customers served) instead of sales, on the two real bakery exports (README "Planning from tickets").
// A sales plan staffs an hour for its till total; a counter's work is closer to the number of customers in the queue.
// Where the average ticket is small (a baguette at 08:00) and where it is big (a cake order at 11:00) the two plans put
// hours in different places. This script measures how far apart they are and what each costs when the other one is
// taken as the true need, on the file's own past weeks (backtestSales with judgeBy).
//
// The ticket rate is calibrated, not guessed: tickets per labor hour T = S / (average ticket value), so at sales per
// labor hour S both plans call for the same total work over the file. Same downloads and SHA-256 as
// eval/french-bakery.mjs and eval/bakery-backtest.mjs. Output: eval/tickets.out.txt.
//   node eval/tickets.mjs [french.csv korean.csv]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSales, demandShifts, backtestSales } from "../demand.mjs";

const FILES = [
  { name: "French bakery (item lines, ticket_number)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80], cur: "EUR" },
  { name: "Korean bakery (one row per order)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000], cur: "KRW" },
];

const f1 = (x) => x.toFixed(1);
for (const [i, f] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(f.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== f.sha) { console.error(`${f.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  const s = readSales(text), t = readSales(text, { unit: "tickets" });
  const sales = s.entries.reduce((a, e) => a + e.amount, 0), nT = t.entries.length;
  const avgTicket = sales / nT;
  console.log(`\n######## ${f.name}`);
  console.log(`${nT} tickets, ${Math.round(sales)} ${f.cur} sold, average ticket ${avgTicket.toFixed(2)} ${f.cur}`);
  console.log(t.notes.join("\n"));

  // Where the two counts disagree: each hour of the day's share of the file's sales and of its tickets, and the
  // average ticket in that hour.
  const bySales = new Array(24).fill(0), byT = new Array(24).fill(0);
  for (const e of s.entries) bySales[e.hour] += e.amount;
  for (const e of t.entries) byT[e.hour]++;
  console.log("\nhour  share of sales  share of tickets  average ticket");
  for (let h = 0; h < 24; h++) {
    if (!byT[h] || byT[h] < nT / 1000) continue;
    console.log(`${String(h).padStart(2)}:00  ${(100 * bySales[h] / sales).toFixed(1).padStart(13)}%  ${(100 * byT[h] / nT).toFixed(1).padStart(15)}%  ${(bySales[h] / byT[h]).toFixed(2).padStart(14)}`);
  }

  for (const S of f.splh) {
    const T = S / avgTicket;
    const ds = demandShifts(text, { splh: S, halfLife: "none" }), dt = demandShifts(text, { unit: "tickets", splh: T, halfLife: "none" });
    console.log(`\n== ${S} ${f.cur} per labor hour; tickets per labor hour ${T.toFixed(2)} (same total work)`);
    console.log(`plan from sales:   ${ds.needed} person-hours needed a week, ${ds.scheduled} scheduled`);
    console.log(`plan from tickets: ${dt.needed} person-hours needed a week, ${dt.scheduled} scheduled`);
    // How many person-hours sit in different hours: half the sum of the hour-by-hour differences of the two cut plans.
    let moved = 0;
    for (let d = 0; d < 7; d++) {
      const a = new Array(25).fill(0), b = new Array(25).fill(0);
      for (const [x, y] of ds.days[d].shifts) for (let h = x; h < y; h++) a[h]++;
      for (const [x, y] of dt.days[d].shifts) for (let h = x; h < y; h++) b[h]++;
      for (let h = 0; h < 25; h++) moved += Math.abs(a[h] - b[h]);
    }
    console.log(`hour-by-hour difference between the two cut plans: ${moved} person-hours a week (${f1(100 * moved / (ds.scheduled + dt.scheduled))}% of the two plans' hours)`);
    const run = (planUnit, judgeUnit) => {
      const o = { splh: planUnit === "tickets" ? T : S, unit: planUnit === "tickets" ? "tickets" : undefined, shifts: true, methods: ["all"] };
      o.judgeBy = { unit: judgeUnit === "tickets" ? "tickets" : undefined, splh: judgeUnit === "tickets" ? T : S };
      const b = backtestSales(text, o);
      return { m: b.methods[0], per: b.perWeek.all, weeks: b.weeks };
    };
    for (const judge of ["sales", "tickets"]) {
      const a = run("sales", judge), b = run("tickets", judge);
      const diff = b.per.map((x, k) => x - a.per[k]);
      const md = diff.reduce((x, y) => x + y, 0) / diff.length;
      const sd = Math.sqrt(diff.reduce((x, y) => x + (y - md) ** 2, 0) / (diff.length - 1));
      const half = 1.96 * sd / Math.sqrt(diff.length);
      console.log(`  need judged by ${judge.padEnd(7)} (${a.weeks} weeks): from sales short ${f1(a.m.short)} over ${f1(a.m.over)} = ${f1(a.m.miss)}; from tickets short ${f1(b.m.short)} over ${f1(b.m.over)} = ${f1(b.m.miss)}; tickets - sales ${f1(md)} (95% CI ${f1(md - half)} to ${f1(md + half)})`);
    }
  }
}

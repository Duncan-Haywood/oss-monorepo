// Real POS export: the Korean bakery orders file (Kaggle "Bakery Sales", hosubjeong; 2,654 lines, 2019-07-11 to
// 2020-06-18, order-level datetime, weekday and total in KRW). The file is not committed (its licence page could not
// be read from the session that wrote this); this script downloads a public GitHub mirror, checks its SHA-256, and runs
// --from-sales and the backtest on it. Output: eval/bakery-backtest.out.txt.
//   node eval/bakery-backtest.mjs [path-to-local-copy]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demandShifts, backtestSales } from "../demand.mjs";
import { backtestReport } from "../cli.mjs";

const URL = "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv";
const SHA256 = "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b";
const bytes = process.argv[2] ? await readFile(process.argv[2]) : Buffer.from(await (await fetch(URL)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
const text = bytes.toString("utf8");
if (got !== SHA256) { console.error(`SHA-256 ${got} is not the file this was measured on (${SHA256}).`); process.exit(1); }

console.log("== --from-sales --splh 30000 (defaults)");
const d = demandShifts(text, { splh: 30000 });
console.log(d.shiftsText); console.log(d.notes.join("\n"));
console.log(`${d.needed} person-hours needed, ${d.scheduled} scheduled; skipped rows: ${d.skipped.length}`);
const k = demandShifts(text, { splh: 30000, keepRare: true });
console.log(`\n== same with --keep-rare (the behaviour before 2026-11-11): ${k.needed} needed, ${k.scheduled} scheduled`);
console.log(k.shiftsText);
for (const splh of [15000, 30000, 60000]) {
  for (const minStaff of [1, 2]) {
    console.log(`\n== --backtest --splh ${splh} --min-staff ${minStaff}`);
    process.stdout.write(backtestReport(backtestSales(text, { splh, minStaff })));
  }
}
const kr = backtestSales(text, { splh: 30000, keepRare: true }).methods[0], df = backtestSales(text, { splh: 30000 }).methods[0];
console.log(`\n== default plan, rare-day/hour rules off vs on (splh 30000): scheduled ${kr.scheduled.toFixed(2)} vs ${df.scheduled.toFixed(2)}, short ${kr.short.toFixed(2)} vs ${df.short.toFixed(2)}, over ${kr.over.toFixed(2)} vs ${df.over.toFixed(2)} person-hours/week`);

// Real POS export, second shop: a French bakery's item lines (Kaggle "French bakery daily sales", Matthieu Gimbert;
// 234,005 lines, 2021-01-02 to 2022-09-30, columns ",date,time,ticket_number,article,Quantity,unit_price" with prices
// written "0,90 €"). It has no sales column, a lunch closure, 1,294 refund lines and is large enough to overflow a
// spread Math.max; all four were faults in --from-sales before 2026-11-11. The file is not committed (its licence page
// could not be read from the session); this script downloads the public GitHub mirror it was measured on, checks its
// SHA-256, and runs --from-sales and the backtest. Output: eval/french-bakery.out.txt.
//   node eval/french-bakery.mjs [path-to-local-copy]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demandShifts, backtestSales } from "../demand.mjs";
import { backtestReport } from "../cli.mjs";

const URL = "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv";
const SHA256 = "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2";
const bytes = process.argv[2] ? await readFile(process.argv[2]) : Buffer.from(await (await fetch(URL)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
const text = bytes.toString("utf8");
if (got !== SHA256) { console.error(`SHA-256 ${got} is not the file this was measured on (${SHA256}).`); process.exit(1); }

const SPLH = 40; // euros of sales per labor hour: about what one person behind a bakery counter rings up in a quiet hour
console.log(`== --from-sales --splh ${SPLH} (defaults)`);
const d = demandShifts(text, { splh: SPLH });
console.log(d.shiftsText); console.log(d.notes.join("\n"));
console.log(`${d.needed} person-hours needed, ${d.scheduled} scheduled; unreadable rows: ${d.skipped.length}`);
const k = demandShifts(text, { splh: SPLH, keepRare: true });
console.log(`\n== same with --keep-rare (no break or rare-hour rules): ${k.needed} needed, ${k.scheduled} scheduled`);
console.log(k.shiftsText);
const span = (t) => t.split("\n").filter((l) => { const m = /, (\d+):00, (\d+):00,/.exec(l); return m && +m[1] <= 14 && +m[2] >= 16; }).length;
console.log(`\nshift lines that span 14:00-16:00: ${span(d.shiftsText)} with the rules, ${span(k.shiftsText)} with --keep-rare`);
for (const splh of [20, 40, 80]) {
  for (const minStaff of [1, 2]) {
    console.log(`\n== --backtest --splh ${splh} --min-staff ${minStaff}`);
    process.stdout.write(backtestReport(backtestSales(text, { splh, minStaff })));
  }
}
for (const splh of [20, 40, 80]) {
  const kr = backtestSales(text, { splh, keepRare: true }).methods[0], df = backtestSales(text, { splh }).methods[0];
  console.log(`\n== default plan, rules off vs on (splh ${splh}): scheduled ${kr.scheduled.toFixed(2)} vs ${df.scheduled.toFixed(2)}, short ${kr.short.toFixed(2)} vs ${df.short.toFixed(2)}, over ${kr.over.toFixed(2)} vs ${df.over.toFixed(2)} person-hours/week`);
}

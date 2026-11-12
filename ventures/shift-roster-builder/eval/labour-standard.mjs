// A blended labour standard on a real file (2026-11-12).
//
// `--standard` (demand.mjs readSales) plans from minutes of work: minutes a ticket + minutes a unit of money + minutes
// an item, so --splh is minutes of work per labor hour. No file here says what the right minutes are (that needs a
// time study at the counter), so this sweeps the blend instead, on the French bakery's item lines (ticket, quantity,
// unit price), with the total work held fixed: share a of the week's minutes from tickets and 1 - a from money, the
// total matched to the money plan at 40 EUR per labor hour (1.5 min a euro at a = 0). It reports:
//   1. a check that a = 0 gives the money plan at 40 EUR and a = 1 the ticket plan at the matched ticket rate, exactly
//      (same shift lines), so the blend is the two existing drivers and the line between them;
//   2. where the hours go as a moves: hours scheduled a week in total and before 10:00, 10:00-14:00 and from 14:00;
//   3. the out-of-sample backtest of each blend against its own target (plain average, priced cut, shortest 4, longest
//      8, minimum staff 1, closure score): short + over as a share of the hours scheduled, i.e. how predictable each
//      driver is. A steadier driver needs fewer hours to pad for noise.
//   4. the same with items as the third driver (share b of the work from items, the rest split as in a = 0.5).
// File downloaded and checked by SHA-256 (not committed).
//   node eval/labour-standard.mjs [french.csv]          output: eval/labour-standard.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSales, demandShifts, backtestSales } from "../demand.mjs";

const F = { url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2" };
const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
const text = bytes.toString("utf8");

const SPLH = 40, base = { minStaff: 1, minShift: 4, maxShift: 8, halfLife: "none" };
const sum = (r) => r.entries.reduce((a, e) => a + e.amount, 0);
const euros = sum(readSales(text)), tickets = sum(readSales(text, { count: "tickets" })), items = sum(readSales(text, { standard: "1/item" }));
const M = euros / SPLH * 60; // total minutes of work in the file at the money plan's rate
console.log(`French bakery: ${Math.round(euros)} EUR, ${tickets} tickets, ${Math.round(items)} items; ${(euros / tickets).toFixed(2)} EUR a ticket.`);
console.log(`Work held at ${Math.round(M)} minutes in the file (money plan at ${SPLH} EUR per labor hour = ${(60 / SPLH).toFixed(2)} min a euro).\n`);

// 1. End points.
const money = demandShifts(text, { ...base, splh: SPLH });
const tplh = SPLH * tickets / euros;
const tix = demandShifts(text, { ...base, count: "tickets", splh: tplh });
const s0 = demandShifts(text, { ...base, standard: { sale: M / euros }, splh: 60 });
const s1 = demandShifts(text, { ...base, standard: { ticket: M / tickets }, splh: 60 });
console.log(`1. a = 0 gives the money plan's shift lines: ${s0.shiftsText === money.shiftsText ? "yes" : "NO"} (${s0.scheduled} h a week vs ${money.scheduled})`);
console.log(`   a = 1 gives the ticket plan's at ${tplh.toFixed(2)} tickets per labor hour: ${s1.shiftsText === tix.shiftsText ? "yes" : "NO"} (${s1.scheduled} h vs ${tix.scheduled})\n`);

const part = (d) => {
  const out = [0, 0, 0];
  for (const day of d.days) for (const [a, b] of day.shifts) for (let h = a; h < b; h++) out[h < 10 ? 0 : h < 14 ? 1 : 2]++;
  return out;
};
const row = (label, std) => {
  const d = demandShifts(text, { ...base, standard: std, splh: 60 });
  const p = part(d);
  const b = backtestSales(text, { minStaff: 1, minShift: 4, maxShift: 8, standard: std, splh: 60, shifts: true, scoreClosed: true });
  const m = b.methods[0];
  return `${label.padEnd(26)} ${String(d.scheduled).padStart(5)} ${String(p[0]).padStart(7)} ${String(p[1]).padStart(7)} ${String(p[2]).padStart(7)}   ${m.short.toFixed(1).padStart(6)} ${m.over.toFixed(1).padStart(6)} ${(100 * (m.short + m.over) / m.scheduled).toFixed(1).padStart(6)}%`;
};
const head = `${"".padEnd(26)} ${"hours".padStart(5)} ${"<10:00".padStart(7)} ${"10-14".padStart(7)} ${"14:00+".padStart(7)}   ${"short".padStart(6)} ${"over".padStart(6)} ${"off".padStart(7)}`;
console.log("2-3. Ticket share a of the work (rest money). Plan from the whole file; backtest per tested week (mean person-hours).");
console.log(head);
for (const a of [0, 0.25, 0.5, 0.75, 1]) console.log(row(`a = ${a}`, { ticket: a * M / tickets, sale: (1 - a) * M / euros }));
console.log("\n4. Item share b of the work, the rest half tickets, half money.");
console.log(head);
for (const b of [0, 0.25, 0.5, 1]) console.log(row(`b = ${b}`, { ticket: (1 - b) / 2 * M / tickets, sale: (1 - b) / 2 * M / euros, item: b * M / items }));

// Fixed work in a labour standard, on a real file (2026-11-12).
//
// `--standard` takes fixed terms beside the variable ones: "10/hour" (minutes in every trading hour: wiping down,
// restocking, the till), "30/open" (setting up, in the first trading hour of each date) and "45/close" (cleaning down,
// in the last). No file says what the right minutes are, so this holds the total work fixed and asks a manager's
// question: if a quarter of the work does not scale with customers, where do the hours go, and does it matter whether
// that quarter is modelled as fixed minutes or, as before, as a slower rate (--splh 48)?
// On the French bakery's item lines (ticket, quantity, unit price), tickets as the variable driver. Reports:
//   1. a check that the fixed terms add exactly their minutes (file total) and nothing when set to 0;
//   2. the week's scheduled hours, split before 10:00, 10:00-14:00 and from 14:00, and the person-hours in each
//      weekday's first and last trading hour, for: tickets only; tickets at --splh 48 (a fifth of each hour spare, i.e. a quarter more work as a slower rate) against the same quarter added as fixed minutes every trading hour;
//      a quarter of the work as fixed minutes every trading hour; a quarter as opening and closing minutes; and half
//      of each fixed quarter;
//   3. the out-of-sample backtest per tested week (plain average, closure score), each plan against its own minutes.
//      A fixed term is as predictable as the trading hours, so the "off" share falls as fixed work rises by
//      construction; it is printed to show the size of that effect, not as evidence that the standard is right.
// File downloaded and checked by SHA-256 (not committed).
//   node eval/fixed-work.mjs [french.csv]          output: eval/fixed-work.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSales, demandShifts, backtestSales } from "../demand.mjs";

const F = { url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2" };
const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
const text = bytes.toString("utf8");

const base = { minStaff: 1, minShift: 4, maxShift: 8, halfLife: "none" };
const sum = (r) => r.entries.reduce((a, e) => a + e.amount, 0);
const tickets = sum(readSales(text, { count: "tickets" }));
// Trading hours and trading days in the file, read from a fixed-only standard (1 minute each).
const hr = readSales(text, { standard: "1/hour" }).parts.fixed, days = readSales(text, { standard: "1/open" }).parts.fixed;
const TPLH = 10, M = tickets / TPLH * 60; // total minutes at 10 tickets per labor hour, i.e. 6 minutes a ticket
console.log(`French bakery: ${tickets} tickets on ${days} trading days, ${hr} trading hours (${(hr / days).toFixed(1)} a day).`);
console.log(`Work held at ${Math.round(M)} minutes (6 min a ticket, 10 tickets per labor hour at 60 minutes of work an hour).\n`);

// 1. Exactness.
const tOnly = readSales(text, { standard: { ticket: 6 } }), withF = readSales(text, { standard: { ticket: 6, hour: 7, open: 11, close: 13 } });
const expect = 7 * hr + (11 + 13) * days;
console.log(`1. Fixed terms add ${Math.round(sum(withF) - sum(tOnly))} minutes, expected ${expect}: ${Math.abs(sum(withF) - sum(tOnly) - expect) < 1e-6 ? "yes" : "NO"};`);
const z = demandShifts(text, { ...base, standard: { ticket: 6, hour: 0 }, splh: 60 }), t = demandShifts(text, { ...base, standard: { ticket: 6 }, splh: 60 });
console.log(`   0/hour gives the tickets-only shift lines: ${z.shiftsText === t.shiftsText ? "yes" : "NO"}.\n`);

const part = (d) => {
  const out = [0, 0, 0];
  let first = 0, last = 0;
  for (const day of d.days) {
    const hrs = [];
    for (const [a, b] of day.shifts) for (let h = a; h < b; h++) { out[h < 10 ? 0 : h < 14 ? 1 : 2]++; hrs.push(h); }
    if (hrs.length) { const lo = Math.min(...hrs), hi = Math.max(...hrs); first += hrs.filter((h) => h === lo).length; last += hrs.filter((h) => h === hi).length; }
  }
  return { out, first, last };
};
const row = (label, std, splh = 60) => {
  const d = demandShifts(text, { ...base, standard: std, splh });
  const p = part(d);
  const b = backtestSales(text, { minStaff: 1, minShift: 4, maxShift: 8, standard: std, splh, shifts: true, scoreClosed: true });
  const m = b.methods[0];
  return `${label.padEnd(36)} ${String(d.scheduled).padStart(5)} ${p.out.map((x) => String(x).padStart(7)).join(" ")} ${String(p.first).padStart(6)} ${String(p.last).padStart(6)}   ${m.short.toFixed(1).padStart(6)} ${m.over.toFixed(1).padStart(6)} ${(100 * (m.short + m.over) / m.scheduled).toFixed(1).padStart(6)}%`;
};
const q = M / 4; // a quarter of the work
console.log("2-3. Plan from the whole file; backtest per tested week (mean person-hours). first/last: person-hours in each day's first and last scheduled hour, summed over the week.");
console.log(`${"".padEnd(36)} ${"hours".padStart(5)} ${"<10:00".padStart(7)} ${"10-14".padStart(7)} ${"14:00+".padStart(7)} ${"first".padStart(6)} ${"last".padStart(6)}   ${"short".padStart(6)} ${"over".padStart(6)} ${"off".padStart(7)}`);
console.log(row("tickets only (6 min)", { ticket: 6 }));
console.log(row("tickets, --splh 48 (+1/4 as a rate)", { ticket: 6 }, 48));
console.log(row("3/4 tickets + 1/4 every hour", { ticket: 4.5, hour: q / hr }));
console.log(row("3/4 tickets + 1/4 open and close", { ticket: 4.5, open: q / 2 / days, close: q / 2 / days }));
console.log(row("3/4 tickets + 1/8 hour + 1/8 o/c", { ticket: 4.5, hour: q / 2 / hr, open: q / 4 / days, close: q / 4 / days }));
console.log(row("tickets + 1/4 extra every hour", { ticket: 6, hour: q / hr }));
console.log(`\nFixed minutes used: 1/4 every hour = ${(q / hr).toFixed(1)} min an hour; 1/4 open and close = ${(q / 2 / days).toFixed(0)} min each end of the day.`);

// Closing work after the last sale hour, on a real file (2026-11-12 later).
//
// `--standard` took "45/close" (cleaning down in the last trading hour, between the last customers). Many shops clean
// down with the doors shut instead, so the closer stays on. "45/after-close" (and "20/before-open") puts the same
// minutes in the hour after the last trading hour (before the first), and minimum staff does not apply to that hour.
// This asks what that changes on the French bakery's item lines, tickets as the variable driver (6 min a ticket),
// at the same fixed minutes: (a) 45 min at close vs 45 after close; (b) 30 at open + 45 at close vs 30 before open +
// 45 after close; at minimum staff 1 and 2. Reports the week's scheduled hours, how many shift-days end after the shop's
// last trading hour, the person-hours in the hour after close and before open, and the out-of-sample backtest (plain
// average, closure score, shifts cut) against each plan's own minutes. The minutes are a sweep, not a measurement.
// File downloaded and checked by SHA-256 (not committed).
//   node eval/after-close.mjs [french.csv]          output: eval/after-close.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demandShifts, backtestSales, readSales } from "../demand.mjs";

const F = { url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2" };
const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
const text = bytes.toString("utf8");

// Exactness: the outside terms add exactly their minutes.
const sum = (r) => r.entries.reduce((a, e) => a + e.amount, 0);
const days = readSales(text, { standard: "1/open" }).parts.fixed;
const a0 = readSales(text, { standard: { ticket: 6 } }), a1 = readSales(text, { standard: { ticket: 6, beforeOpen: 11, afterClose: 13 } });
console.log(`French bakery, ${days} trading days. 11/before-open + 13/after-close add ${Math.round(sum(a1) - sum(a0))} minutes, expected ${24 * days}: ${Math.abs(sum(a1) - sum(a0) - 24 * days) < 1e-6 ? "yes" : "NO"}.\n`);

const base = { minShift: 4, maxShift: 8, halfLife: "none", splh: 60 };
const row = (label, std, minStaff) => {
  const d = demandShifts(text, { ...base, minStaff, standard: std });
  const ref = demandShifts(text, { ...base, minStaff, standard: { ticket: 6 } });
  let late = 0, after = 0, before = 0;
  d.days.forEach((day, i) => {
    const r = ref.days[i].shifts; if (!r.length) return;
    const lo = Math.min(...r.map((s) => s[0])), hi = Math.max(...r.map((s) => s[1]));
    for (const [x, y] of day.shifts) { if (y > hi) late++; for (let h = x; h < y; h++) { if (h >= hi) after++; if (h < lo) before++; } }
  });
  const b = backtestSales(text, { ...base, minStaff, standard: std, shifts: true }).methods[0];
  return `${label.padEnd(34)} ${String(minStaff).padStart(3)} ${String(d.scheduled).padStart(6)} ${String(late).padStart(6)} ${String(before).padStart(7)} ${String(after).padStart(6)}   ${b.short.toFixed(1).padStart(6)} ${b.over.toFixed(1).padStart(6)} ${(100 * (b.short + b.over) / b.scheduled).toFixed(1).padStart(6)}%`;
};
console.log("Plan from the whole file (week); before/after: person-hours before the tickets-only plan's first hour / from its last hour on; late: shift-days ending past it. Backtest: mean person-hours per tested week.");
console.log(`${"".padEnd(34)} ${"min".padStart(3)} ${"hours".padStart(6)} ${"late".padStart(6)} ${"before".padStart(7)} ${"after".padStart(6)}   ${"short".padStart(6)} ${"over".padStart(6)} ${"off".padStart(7)}`);
for (const m of [1, 2]) {
  console.log(row("tickets only (6 min)", { ticket: 6 }, m));
  console.log(row("+ 45/close", { ticket: 6, close: 45 }, m));
  console.log(row("+ 45/after-close", { ticket: 6, afterClose: 45 }, m));
  console.log(row("+ 30/open + 45/close", { ticket: 6, open: 30, close: 45 }, m));
  console.log(row("+ 30/before-open + 45/after-close", { ticket: 6, beforeOpen: 30, afterClose: 45 }, m));
  console.log(row("+ 90/after-close", { ticket: 6, afterClose: 90 }, m));
  console.log("");
}

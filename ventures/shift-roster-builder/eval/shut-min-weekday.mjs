// A shut-hour minimum by weekday, on a real file (2026-11-12).
//
// `--shut-min 2` (nobody locks up alone) put two closers on every night. Many shops want that only on the late or busy
// nights. `--shut-min "1, Fri/Sat=2"` sets it per weekday. This asks what the weekly plan costs on the French bakery's
// item lines (tickets as the driver, 6 min a ticket, 45 min after close, 30 before open) under: one closer every day;
// two every day; two on Friday and Saturday only; two on the bakery's own two busiest weekdays by tickets. Reports the
// week's scheduled person-hours, the heads in the hour after close per weekday, and the out-of-sample backtest
// (plain average, closure score, shifts cut). The minutes are a sweep, not a measurement of this bakery's closing.
// File downloaded and checked by SHA-256 (not committed).
//   node eval/shut-min-weekday.mjs [french.csv]          output: eval/shut-min-weekday.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demandShifts, backtestSales, readSales } from "../demand.mjs";
import { DAYS } from "../calc.mjs";

const F = { url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2" };
const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
const text = bytes.toString("utf8");

const std = { ticket: 6, beforeOpen: 30, afterClose: 45 };
// The two busiest weekdays by ticket-minutes (the variable work only), from the whole file.
const plain = readSales(text, { standard: { ticket: 6 } });
const byDay = new Array(7).fill(0);
for (const e of plain.entries) byDay[e.day] += e.amount;
const busy = [...byDay.keys()].sort((a, b) => byDay[b] - byDay[a]).slice(0, 2).sort();
console.log(`French bakery: ticket-minutes by weekday ${DAYS.map((d, i) => `${d} ${Math.round(byDay[i])}`).join(", ")}; busiest two: ${busy.map((d) => DAYS[d]).join("/")}.\n`);

const base = { minShift: 4, maxShift: 8, halfLife: "none", splh: 60, minStaff: 1, standard: std };
const settings = [["one closer every day", 1], ["two every day", 2], ["two on Fri/Sat only", "1, Fri/Sat=2"], [`two on ${busy.map((d) => DAYS[d]).join("/")} (busiest)`, `1, ${busy.map((d) => DAYS[d]).join("/")}=2`]];
console.log("Plan from the whole file (one week); after: heads in the first hour after the last trading hour, Mon..Sun. Backtest: mean person-hours per tested week.");
console.log(`${"--shut-min".padEnd(34)} ${"hours".padStart(6)}  ${"after Mon..Sun".padEnd(16)} ${"short".padStart(7)} ${"over".padStart(7)}`);
for (const [label, shutMin] of settings) {
  const d = demandShifts(text, { ...base, shutMin });
  const ref = demandShifts(text, { ...base, standard: { ticket: 6 } });
  const after = d.days.map((day, i) => {
    const r = ref.days[i].shifts; if (!r.length) return "-";
    const hi = Math.max(...r.map((s) => s[1]));
    return String(day.shifts.filter(([x, y]) => x <= hi && y > hi).length);
  }).join(" ");
  const b = backtestSales(text, { ...base, shutMin, shifts: true }).methods[0];
  console.log(`${label.padEnd(34)} ${String(d.scheduled).padStart(6)}  ${after.padEnd(16)} ${b.short.toFixed(1).padStart(7)} ${b.over.toFixed(1).padStart(7)}`);
}

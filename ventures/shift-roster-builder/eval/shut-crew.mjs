// Shut-door work spread over hours, and the shut-hour minimum, on a real file (2026-11-12, last).
//
// Until this change "90/after-close" put all 90 minutes in the one hour after the last trading hour: 2 heads for that
// hour. Now the work runs at 60 minutes a person and spills into the next hour (one person staying two hours), and
// --shut-min sets the fewest people on in a shut-door hour (2 for a lone-worker rule; the crew of n clears n x 60 an
// hour). This plans the French bakery (tickets as the driver, 6 min a ticket) with 45, 90 and 150 minutes after close,
// at minimum staff 1 and 2, shut-min 1 and 2, and a rate of 60 or 45 minutes of work per labor hour. It reports the
// week's scheduled hours, the person-hours from the tickets-only plan's last hour on, and the backtest (plain average,
// closure score, shifts cut) against each plan's own minutes. Minutes are a sweep, not a measurement.
// File downloaded and checked by SHA-256 (not committed).
//   node eval/shut-crew.mjs [french.csv]          output: eval/shut-crew.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demandShifts, backtestSales } from "../demand.mjs";

const F = { url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2" };
const path = process.argv[2];
const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
const got = createHash("sha256").update(bytes).digest("hex");
if (got !== F.sha) { console.error(`SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
const text = bytes.toString("utf8");

const base = { minShift: 4, maxShift: 8, halfLife: "none" };
const row = (after, minStaff, shutMin, splh) => {
  const o = { ...base, splh, minStaff, shutMin };
  const std = after ? { ticket: 6, afterClose: after } : { ticket: 6 };
  const d = demandShifts(text, { ...o, standard: std });
  const ref = demandShifts(text, { ...o, standard: { ticket: 6 } });
  let tail = 0, late = 0;
  d.days.forEach((day, i) => {
    const r = ref.days[i].shifts; if (!r.length) return;
    const hi = Math.max(...r.map((s) => s[1]));
    for (const [x, y] of day.shifts) { if (y > hi) late++; for (let h = x; h < y; h++) if (h >= hi) tail++; }
  });
  const b = backtestSales(text, { ...o, standard: std, shifts: true }).methods[0];
  return `${String(after || "-").padStart(5)} ${String(splh).padStart(4)} ${String(minStaff).padStart(4)} ${String(shutMin).padStart(5)} ${String(d.scheduled).padStart(6)} ${String(late).padStart(5)} ${String(tail).padStart(6)}   ${b.short.toFixed(1).padStart(6)} ${b.over.toFixed(1).padStart(6)} ${(100 * (b.short + b.over) / b.scheduled).toFixed(1).padStart(6)}%`;
};
console.log("French bakery, 6 min a ticket. after: minutes after close; rate: minutes of work per labor hour; tail: person-hours from the tickets-only plan's last hour on; late: shift-days ending past it. Backtest: mean person-hours per tested week.");
console.log(`${"after".padStart(5)} ${"rate".padStart(4)} ${"min".padStart(4)} ${"shut".padStart(5)} ${"hours".padStart(6)} ${"late".padStart(5)} ${"tail".padStart(6)}   ${"short".padStart(6)} ${"over".padStart(6)} ${"off".padStart(7)}`);
for (const splh of [60, 45]) for (const minStaff of [1, 2]) {
  console.log(row(0, minStaff, 1, splh));
  for (const after of [45, 90, 150]) for (const shutMin of [1, 2]) console.log(row(after, minStaff, shutMin, splh));
  console.log("");
}

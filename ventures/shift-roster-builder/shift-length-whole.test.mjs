// A shift length that is not a whole number of hours (2026-11-14, red team). The page's "Shortest shift" box takes a
// decimal, and cutShifts works in whole hours: 6.5 stretched a 6-hour day to 15:30, stepped onto hour 15.5, read an
// empty run there and, with the cut priced (the default with dated rows), dropped it without moving on, so the page
// hung. Without the price it returned phantom 15:30-21:30 shifts. Whole hours only, said plainly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cutShifts, demandShifts, backtestSales } from "./demand.mjs";

const DAY = () => { const p = new Array(24).fill(0); for (let h = 9; h < 15; h++) p[h] = 1; p[14] = 2; return p; };
const WHOLE = /whole number of hours/;

test("cutShifts refuses a shortest or longest shift that is not whole hours, instead of hanging", () => {
  const cost = { tail: new Array(24).fill(null), r: 1, minStaff: 1, floor: null, join: false };
  assert.throws(() => cutShifts(DAY(), 6.5, 8, cost), WHOLE);
  assert.throws(() => cutShifts(DAY(), 6.5, 8), WHOLE);
  assert.throws(() => cutShifts(DAY(), 4, 7.5), WHOLE);
  assert.throws(() => cutShifts(DAY(), Number.NaN, 8), WHOLE);
  // Whole hours still cut as before, every end on the clock.
  for (const sh of cutShifts(DAY(), 6, 8, cost)) for (const t of sh) assert.ok(Number.isInteger(t) && t >= 0 && t <= 24, String(sh));
});

test("demandShifts and backtestSales pass the whole-hours message through from the page's inputs", () => {
  const csv = "day,hour,sales\n" + [[9, 40], [10, 40], [11, 40], [12, 40], [13, 40], [14, 90]].map(([h, v]) => `Mon,${h}:00,${v}`).join("\n");
  assert.throws(() => demandShifts(csv, { splh: 50, minShift: 6.5 }), WHOLE);
  assert.throws(() => demandShifts(csv, { splh: 50, maxShift: 7.5 }), WHOLE);
  const dated = "date,sales\n" + ["2026-03-02", "2026-03-09", "2026-03-16"].flatMap((d) => [9, 10, 11, 12].map((h) => `${d} ${h}:00,100`)).join("\n");
  assert.throws(() => backtestSales(dated, { splh: 50, minShift: 2.5, shifts: true, warmup: 1 }), WHOLE);
  assert.ok(demandShifts(csv, { splh: 50, minShift: 4 }).shiftsText.length > 0);
});

// Calendar.workBetween counts long spans from week sums and exception days
// instead of walking each day. This pins it to the day walk it replaced:
// same minutes for random spans on P6, weekday, 24-hour and holiday-heavy
// calendars, and after an exception day is added (calreview.mjs does that).
import test from "node:test";
import assert from "node:assert/strict";
import { Calendar } from "./calendar.mjs";
import { parseXer } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

const DAY = 1440;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// the old workBetween: every day from t1 to t2, clamped to the span
const walk = (cal, t1, t2) => (t2 < t1 ? -walk(cal, t2, t1) : cal._walkWork(Math.floor(t1 / DAY), Math.floor(t2 / DAY), t1, t2));

function holidays() {
  const ex = new Map();
  const d0 = Math.floor(Date.UTC(2026, 0, 1) / 86400000);
  for (let k = 0; k < 300; k++) ex.set(d0 + Math.floor(rnd() * 1500), rnd() < 0.5 ? [] : [[8 * 60, 12 * 60]]);
  ex.set(d0 + 3, [[0, DAY]]); // a weekend day made all-working
  return new Calendar({ id: "h", week: Calendar.weekdays(8).week, exceptions: ex, hoursPerDay: 8 });
}

const cals = [Calendar.fromXer(parseXer(EXAMPLE_XER).tables.CALENDAR[0]), Calendar.weekdays(10, "w6", "", 6), Calendar.allDay(), holidays()];

test("workBetween over long spans matches the day walk", () => {
  const base = Date.UTC(2025, 10, 1) / 60000;
  for (const cal of cals) {
    for (let i = 0; i < 3000; i++) {
      const t1 = base + Math.floor(rnd() * 900 * DAY);
      const t2 = t1 + Math.floor((rnd() - 0.2) * 700 * DAY) + (i % 3 ? Math.floor(rnd() * DAY) : 0);
      assert.equal(cal.workBetween(t1, t2), walk(cal, t1, t2), `${cal.id} ${t1} ${t2}`);
    }
  }
});

test("an exception added after a first call is counted", () => {
  const cal = Calendar.weekdays(8);
  const t1 = Date.UTC(2026, 2, 2) / 60000, t2 = t1 + 60 * DAY;
  const before = cal.workBetween(t1, t2);
  cal.exceptions.set(Math.floor(t1 / DAY) + 10, []); // a Thursday off
  assert.equal(cal.workBetween(t1, t2), before - 480);
  assert.equal(cal.workBetween(t1, t2), walk(cal, t1, t2));
});

test("a period outside the day falls back to the walk", () => {
  const cal = new Calendar({ id: "odd", week: [[], [[-60, 600]], [[480, 1000]], [[480, 1000]], [[480, 1000]], [[480, 1000]], []] });
  const t1 = Date.UTC(2026, 0, 5) / 60000 + 300, t2 = t1 + 100 * DAY;
  assert.equal(cal.workBetween(t1, t2), walk(cal, t1, t2));
});

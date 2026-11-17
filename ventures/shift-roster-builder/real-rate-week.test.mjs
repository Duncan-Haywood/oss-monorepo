// The whole-week reissue study at real rates (eval/real-rate-week.mjs, 2026-11-13): the draw is shared by both policies, a
// call-out only applies to someone working that day in the roster being changed, extra copies join the week, and the
// kept reissue never makes more changes than a free rebuild on a one-event week.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, TEMPLATES, sampleStaff, sampleShifts } from "./calc.mjs";
import { drawWeek, playWeek } from "./eval/real-rate-week.mjs";

test("drawWeek is deterministic and covers Tuesday to Sunday only", () => {
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const a = drawWeek(slots, staff, { call: 0.3, extra: 0.3, seed: 7 }), b = drawWeek(slots, staff, { call: 0.3, extra: 0.3, seed: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 0 && a.every((e) => e.day >= 1 && e.day <= 6));
  assert.deepEqual(drawWeek(slots, staff, { call: 0, extra: 0, seed: 7 }), []);
});

test("a quiet week changes nothing; a call-out from someone not on that day is skipped", () => {
  const st = sampleStaff(), sh = sampleShifts();
  const q = playWeek(st, sh, []);
  assert.equal(q.reissues, 0); assert.equal(q.changes, 0); assert.equal(q.net, 0);
  // Eli is available Mon/Wed/Fri evenings and weekends, never Tuesday, so a Tuesday call-out from Eli is not a reissue.
  const r = playWeek(st, sh, [{ day: 1, out: ["Eli"], extras: [] }]);
  assert.equal(r.reissues, 0);
});

test("an extra copy joins the week and is either covered or left open", () => {
  const st = sampleStaff(), sh = sampleShifts();
  const base = playWeek(st, sh, []);
  const r = playWeek(st, sh, [{ day: 2, out: [], extras: ["Wed, 11:00, 14:00, 1, extra"] }], { keepShift: 1 });
  assert.equal(r.reissues, 1); assert.equal(r.extras, 1);
  assert.ok(r.open === base.firstOpen + 3 || r.pay > base.firstPay, "the extra 3 h are open or paid");
});

test("on the salon template a single call-out: the kept reissue makes no more changes than a free rebuild, same open hours", () => {
  const t = TEMPLATES.salon;
  const st = t.staff(), sh = t.shifts();
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const posted = buildRoster(staff, slots, { minRestHours: 10 });
  const wed = posted.assignments.find((a) => a.slot.day === 2 && a.person);
  assert.ok(wed, "someone works Wednesday");
  const ev = [{ day: 2, out: [wed.person], extras: [] }];
  const free = playWeek(st, sh, ev), kept = playWeek(st, sh, ev, { keepShift: 1 });
  assert.equal(free.callers, 1); assert.equal(kept.callers, 1);
  assert.ok(kept.changes <= free.changes, `${kept.changes} vs ${free.changes}`);
  assert.equal(kept.open, free.open);
});

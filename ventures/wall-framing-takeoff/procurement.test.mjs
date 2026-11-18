import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, sampleSchedule } from "./schedule.mjs";
import { procurement, procurementText, procurementCsv } from "./procurement.mjs";

const s = schedule(sampleSchedule());
// walls start date is read off the schedule, so the hand figures below follow from it.
const walls = s.rows.find((r) => r.id === "walls").startDate;
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

test("order-by is need date minus lead and buffer, rolled back to a weekday", () => {
  const p = procurement(s, [{ item: "Trusses", for: "walls", leadDays: 28, bufferDays: 3 }]);
  assert.ok(p.ok);
  let want = addDays(walls, -31);
  while ([0, 6].includes(new Date(want + "T00:00:00Z").getUTCDay())) want = addDays(want, -1);
  assert.equal(p.rows[0].orderBy, want);
  assert.equal(p.rows[0].needDate, walls);
});

test("today after the order-by date makes the item late and names the earliest start", () => {
  const today = addDays(walls, -10);
  const p = procurement(s, [{ item: "Windows", for: "walls", leadDays: 42, cost: 9000 }, { item: "Nails", for: "walls", leadDays: 2, cost: 100 }], today);
  const w = p.rows.find((r) => r.item === "Windows");
  assert.equal(w.status, "late");
  assert.equal(w.earliestStart, addDays(today, 42));
  assert.equal(w.daysLate, 32);
  assert.equal(p.rows.find((r) => r.item === "Nails").status, "open");
  assert.equal(p.lateCount, 1);
  assert.equal(p.worstSlipDays, 32);
  assert.equal(p.lateCost, 9000);
  assert.deepEqual(p.suggestNotBefore, [{ id: "walls", notBefore: addDays(today, 42) }]);
});

test("a buffer can absorb lateness without moving the start", () => {
  const today = addDays(walls, -20);
  const r = procurement(s, [{ item: "Beam", for: "walls", leadDays: 14, bufferDays: 10 }], today).rows[0];
  assert.equal(r.status, "late"); // order-by was 24 days before the start
  assert.equal(r.earliestStart, addDays(today, 14)); // arrives 6 days before the start
  assert.equal(r.daysLate, 0);
  assert.match(procurementText(procurement(s, [{ item: "Beam", for: "walls", leadDays: 14, bufferDays: 10 }], today)).join("\n"), /buffer used up/);
});

test("bad input is named", () => {
  assert.equal(procurement(s, [{ item: "x", for: "nope", leadDays: 1 }]).ok, false);
  assert.equal(procurement(s, [{ item: "x", for: "walls", leadDays: -1 }]).ok, false);
  assert.equal(procurement(s, [{ item: "x", for: "walls", leadDays: 1 }], "2026-13-40").ok, false);
  assert.equal(procurement(s, []).ok, false);
  assert.equal(procurement({ ok: false }, [{}]).ok, false);
});

test("text and csv render, and csv neutralises formulas", () => {
  const p = procurement(s, [{ item: "=SUM(A1)", for: "walls", leadDays: 7 }], addDays(walls, -3));
  assert.match(procurementText(p).join("\n"), /LATE/);
  assert.match(procurementCsv(p), /'=SUM\(A1\)/);
});

test("a cost that is NaN, infinite, negative or text is refused, not summed", () => {
  const id = s.rows[0].id;
  for (const cost of [NaN, Infinity, -500, "900", 1e12]) {
    const r = procurement(s, [{ item: "Trusses", for: id, leadDays: 20, cost }]);
    assert.equal(r.ok, false, String(cost));
    assert.match(r.errors[0], /cost must be a number/);
  }
  assert.equal(procurement(s, [{ item: "Trusses", for: id, leadDays: 20, cost: 0 }]).ok, true);
});

test("a date that does not exist (Feb 30) is refused, not rolled into March", () => {
  const p = procurement(s, [{ item: "Trusses", for: "walls", leadDays: 28 }], "2026-02-30");
  assert.equal(p.ok, false);
  assert.match(p.errors[0], /not a date/);
  assert.equal(procurement(s, [{ item: "Trusses", for: "walls", leadDays: 28 }], "2028-02-29").ok, true);
});

test("schedule start, notBefore and deadline refuse a day that does not exist", () => {
  for (const [k, v] of [["start", "2026-02-30"], ["deadline", "2026-04-31"]]) {
    const r = schedule({ ...sampleSchedule(), [k]: v });
    assert.equal(r.ok, false, k);
    assert.match(r.errors[0], /not a date/);
  }
  const sc = sampleSchedule();
  sc.activities[1].notBefore = "2026-06-31";
  const r = schedule(sc);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /notBefore/);
  assert.equal(schedule({ ...sampleSchedule(), start: "2028-02-29" }).ok, true);
});

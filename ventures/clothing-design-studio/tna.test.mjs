import test from "node:test";
import assert from "node:assert/strict";
import { tnaPlan, defaultSteps } from "./tna.mjs";

// One sample round: the longest chain is
// techpack 7 + quotes 10 + sample 14 + review 3 + fabric 21 + production 25 + qc 3 + freight 21 + customs 5 + receiving 3 = 112 days.
// (trims, 14 days, runs beside fabric, 21, so it has 7 days of slack.)
const one = { sampleRounds: 1, bufferDays: 0 };

test("112-day chain: stock needed 30 Jun means start 11 Mar; from 1 Jan it lands 22 Apr", () => {
  const r = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01" });
  assert.equal(r.startBy, "2027-03-11");        // 30 Jun is day 181 of 2027; 181 - 111 = 70 = 11 Mar
  assert.equal(r.projectedInStock, "2027-04-22"); // 1 Jan + 111 days
  assert.equal(r.lateByDays, 0);
});

test("trims run beside fabric and carry 7 days of slack; the chain does not", () => {
  const r = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01" });
  const get = id => r.steps.find(s => s.id === id);
  assert.equal(get("trims").slackDays - get("fabric").slackDays, 7);
  assert.ok(r.critical.includes("fabric") && !r.critical.includes("trims"));
});

test("buffer pulls the deadline in", () => {
  const r = tnaPlan({ ...one, bufferDays: 14, inStock: "2027-06-30", today: "2027-01-01" });
  assert.equal(r.deadline, "2027-06-16");
  assert.equal(r.startBy, "2027-02-25");
});

test("starting too late reports days late", () => {
  const r = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-04-01" }); // 1 Apr + 111 days = 21 Jul, 21 days after 30 Jun
  assert.equal(r.projectedInStock, "2027-07-21");
  assert.equal(r.lateByDays, 21);
  assert.match(r.notes[0], /21 days after/);
  assert.match(r.notes.join(" "), /already behind you/);
});

test("each extra sample round adds 17 days", () => {
  const a = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01" });
  const b = tnaPlan({ sampleRounds: 3, bufferDays: 0, inStock: "2027-06-30", today: "2027-01-01" });
  assert.equal((Date.parse(a.startBy) - Date.parse(b.startBy)) / 864e5, 34);
});

test("factory closure days do not count for factory steps", () => {
  // Hand dates: tech pack 1-7 Jan, quotes 8-17 Jan, sample 18-31 Jan, review 1-3 Feb, fabric from 4 Feb.
  // Closed 1-10 Feb overlaps the fabric step on 4-10 Feb: 7 days lost.
  const base = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01" });
  const closed = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01", closures: [{ from: "2027-02-01", to: "2027-02-10" }] });
  const prod = r => r.steps.find(s => s.id === "production");
  assert.equal((Date.parse(closed.projectedInStock) - Date.parse(base.projectedInStock)) / 864e5, 7);
  assert.equal(prod(closed).days, 25);
  assert.match(closed.notes.join(" "), /closure days/);
});

test("closures do not stop non-factory steps", () => {
  const r = tnaPlan({ ...one, inStock: "2027-12-31", today: "2027-01-01", closures: [{ from: "2027-01-01", to: "2027-01-07" }] });
  assert.equal(r.projectedInStock, "2027-04-22"); // techpack is ours: no delay
});

test("a week's slip in a chain step is a week; in a side step is zero", () => {
  const r = tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01" });
  assert.equal(r.slipDaysPerWeekLate.production, 7);
  assert.equal(r.slipDaysPerWeekLate.trims, 0);
});

test("bad input gets a message, not a crash", () => {
  assert.match(tnaPlan({ inStock: "2027-13-40", today: "2027-01-01" }).error, /Dates|real date/);
  assert.match(tnaPlan(null).error, /Give the date/);
  assert.match(tnaPlan({ ...one, sampleRounds: 9, inStock: "2027-06-30", today: "2027-01-01" }).error, /Sample rounds/);
  assert.match(tnaPlan({ ...one, inStock: "2027-06-30", today: "2027-01-01", closures: [{ from: "2027-02-10", to: "2027-02-01" }] }).error, /end on or after/);
  const steps = [{ id: "a", name: "A", days: 1, needs: ["b"] }, { id: "b", name: "B", days: 1, needs: ["a"] }];
  assert.match(tnaPlan({ inStock: "2027-06-30", today: "2027-01-01", steps }).error, /circle/);
});

test("defaultSteps shape", () => {
  const s = defaultSteps({ sampleRounds: 2 });
  assert.equal(s.filter(x => x.id.startsWith("sample")).length, 2);
  assert.deepEqual(s.find(x => x.id === "production").needs, ["fabric", "trims"]);
});

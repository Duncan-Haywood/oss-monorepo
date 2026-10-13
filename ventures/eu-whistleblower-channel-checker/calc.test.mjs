import { test } from "node:test";
import assert from "node:assert/strict";
import { obligation, compute, clocks, parse, addMonths, SAMPLE, summaryText, requirementsCsv, REQUIREMENTS } from "./calc.mjs";

const base = { headcount: "120", sector: "private", today: "2026-10-13" };

test("private thresholds: 50 and 250", () => {
  assert.equal(obligation(49, "private").required, false);
  assert.equal(obligation(50, "private").required, true);
  assert.equal(obligation(50, "private").sharing, true);
  assert.equal(obligation(249, "private").sharing, true);
  assert.equal(obligation(250, "private").sharing, false);
});

test("regulated financial firms need a channel at any size", () => {
  assert.equal(obligation(3, "financial").required, true);
  assert.equal(compute({ ...base, headcount: "3", sector: "financial" }).required, true);
});

test("an under-50 private employer is told national law may differ", () => {
  const r = compute({ ...base, headcount: "20" });
  assert.equal(r.required, false);
  assert.equal(r.open.length, REQUIREMENTS.length);
  assert.ok(!r.findings.some((f) => f.title.startsWith("Open:")));
});

test("open requirements are exactly the unchecked ones", () => {
  const r = compute({ ...base, written: "1", ack: "1" });
  assert.equal(r.open.length, REQUIREMENTS.length - 2);
  assert.ok(!r.open.some((d) => d.id === "ack"));
});

test("all done gives the keep-the-evidence note", () => {
  const all = Object.fromEntries(REQUIREMENTS.map((d) => [d.id, "1"]));
  const r = compute({ ...base, ...all });
  assert.equal(r.open.length, 0);
  assert.ok(r.findings.some((f) => /Keep the evidence|evidence/.test(f.title)));
});

test("clocks: ack 7 days, feedback 3 months from the acknowledgement", () => {
  const c = compute({ ...base, received: "2026-09-01", acknowledged: "2026-09-04" }).clocks;
  assert.equal(c.ackDue, "2026-09-08");
  assert.equal(c.ackLate, false);
  assert.equal(c.ackLateOnSend, false);
  assert.equal(c.feedbackDue, "2026-12-04");
});

test("clocks: no acknowledgement runs feedback from the end of the 7 days", () => {
  const c = compute({ ...base, received: "2026-09-01" }).clocks;
  assert.equal(c.feedbackFrom, "2026-09-08");
  assert.equal(c.feedbackDue, "2026-12-08");
  assert.equal(c.ackLate, true);
});

test("late acknowledgement and overdue feedback are flagged", () => {
  const r = compute({ ...base, received: "2026-05-01", acknowledged: "2026-05-12", today: "2026-10-13" });
  assert.equal(r.clocks.ackLateOnSend, true);
  assert.equal(r.clocks.feedbackLate, true);
  assert.ok(r.findings.some((f) => /overdue/.test(f.title)));
});

test("month addition clamps to month end", () => {
  assert.equal(addMonths(new Date("2026-11-30T00:00:00Z"), 3).toISOString().slice(0, 10), "2027-02-28");
  assert.equal(addMonths(new Date("2027-11-30T00:00:00Z"), 3).toISOString().slice(0, 10), "2028-02-29");
});

test("bad input is rejected, never clamped", () => {
  for (const bad of [{ headcount: "" }, { headcount: "0" }, { headcount: "12.5" }, { headcount: "abc" }]) {
    assert.ok(compute({ ...base, ...bad }).errors.length);
  }
  assert.ok(compute({ ...base, received: "2026-02-30" }).errors.length);
  assert.ok(compute({ ...base, received: "01/09/2026" }).errors.length);
  assert.ok(compute({ ...base, acknowledged: "2026-09-02" }).errors.length);
  assert.ok(compute({ ...base, received: "2026-09-05", acknowledged: "2026-09-01" }).errors.length);
  assert.equal(parse(undefined).errors.length, 1);
});

test("unknown sector falls back to private, not a crash", () => {
  assert.equal(parse({ ...base, sector: "__proto__" }).sector, "private");
});

test("sample runs and summary and csv render", () => {
  const r = compute(SAMPLE);
  assert.ok(!r.errors);
  assert.match(summaryText(r), /Acknowledge by: 2026-09-08  <-- overdue/);
  const csv = requirementsCsv(r).split("\n");
  assert.equal(csv.length, REQUIREMENTS.length + 1);
  assert.match(csv[1], /"done"|"open"/);
});

test("clocks returns null without a received date", () => {
  assert.equal(clocks(parse(base)), null);
});

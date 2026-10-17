import { test } from "node:test";
import assert from "node:assert/strict";
import { lienDeadlines, formatDate, parseDate, STATE_RULES } from "./calc.mjs";

const iso = (d) => d.toISOString().slice(0, 10);
const run = (o) => lienDeadlines({ firstFurnishing: "2026-03-10", lastFurnishing: "2026-06-20", ...o });

test("California: 20 days to preliminary notice, 90 days after completion to lien", () => {
  const r = run({ state: "CA" });
  assert.equal(iso(r.prelim.date), "2026-03-30");
  assert.equal(iso(r.lien.date), "2026-09-18");
  assert.equal(r.lien.usedLastFurnishingAsCompletion, true);
});

test("California: a real completion date moves the lien date later", () => {
  const r = run({ state: "CA", completionDate: "2026-07-31" });
  assert.equal(iso(r.lien.date), "2026-10-29");
  assert.equal(r.lien.usedLastFurnishingAsCompletion, false);
});

test("California: a recorded notice of completion shortens to 30 days", () => {
  const r = run({ state: "CA", completionDate: "2026-07-31", noticeOfCompletionDate: "2026-08-10" });
  assert.equal(iso(r.lien.date), "2026-09-09");
  assert.match(r.lien.description, /earlier of/);
});

test("Arizona: 20 days / 120 days, or 60 days after a notice of completion", () => {
  const r = run({ state: "AZ" });
  assert.equal(iso(r.prelim.date), "2026-03-30");
  assert.equal(iso(r.lien.date), "2026-10-18");
  const n = run({ state: "AZ", noticeOfCompletionDate: "2026-07-01" });
  assert.equal(iso(n.lien.date), "2026-08-30");
});

test("Texas commercial: 15th of 3rd month for notice, 15th of 4th month for lien", () => {
  const r = run({ state: "TX", projectType: "commercial" });
  assert.equal(iso(r.prelim.date), "2026-06-15");
  assert.equal(iso(r.lien.date), "2026-10-15");
});

test("Texas residential: 15th of 2nd month and 15th of 3rd month", () => {
  const r = run({ state: "TX", projectType: "residential" });
  assert.equal(iso(r.prelim.date), "2026-05-15");
  assert.equal(iso(r.lien.date), "2026-09-15");
});

test("Texas month arithmetic crosses the year end", () => {
  const r = lienDeadlines({ state: "TX", firstFurnishing: "2026-11-05", lastFurnishing: "2026-12-20" });
  assert.equal(iso(r.prelim.date), "2027-02-15");
  assert.equal(iso(r.lien.date), "2027-04-15");
});

test("Florida: 45 days to Notice to Owner, 90 days after last furnishing to lien", () => {
  const r = run({ state: "FL" });
  assert.equal(iso(r.prelim.date), "2026-04-24");
  assert.equal(iso(r.lien.date), "2026-09-18");
  assert.ok(r.findings.some((f) => /final payment/.test(f.detail)));
});

test("Washington: 60 days commercial, 10 days residential, 90 days to lien", () => {
  assert.equal(iso(run({ state: "WA" }).prelim.date), "2026-05-09");
  const res = run({ state: "WA", projectType: "residential" });
  assert.equal(iso(res.prelim.date), "2026-03-20");
  assert.equal(iso(res.lien.date), "2026-09-18");
  assert.ok(res.findings.some((f) => /single-family/.test(f.detail)));
});

test("weekend deadlines report the last business day as the safe date", () => {
  const r = run({ state: "WA" }); // 2026-05-09 is a Saturday
  assert.equal(r.prelim.weekend, true);
  assert.equal(iso(r.prelim.safeDate), "2026-05-08");
  assert.ok(r.findings.some((f) => /weekend/.test(f.title)));
});

test("status reflects days remaining against today, measured to the safe date", () => {
  const r = run({ state: "TX", today: "2026-10-10" }); // lien Thu 2026-10-15
  assert.equal(r.lien.status, "soon");
  assert.equal(r.lien.daysLeft, 5);
  assert.equal(run({ state: "TX", today: "2026-10-15" }).lien.status, "today");
  assert.equal(run({ state: "TX", today: "2026-10-16" }).lien.status, "passed");
  assert.equal(run({ state: "TX", today: "2026-07-01" }).lien.status, "open");
  assert.equal(run({ state: "TX" }).lien.status, "unknown");
});

test("a passed date produces a high-severity finding", () => {
  const r = run({ state: "CA", today: "2026-12-01" });
  assert.ok(r.findings.some((f) => f.severity === "high" && /already passed/.test(f.title)));
});

test("missing or impossible dates compute nothing instead of guessing", () => {
  const none = lienDeadlines({ state: "CA" });
  assert.equal(none.prelim, null);
  assert.equal(none.lien, null);
  const bad = lienDeadlines({ state: "CA", firstFurnishing: "2026-06-01", lastFurnishing: "2026-05-01" });
  assert.equal(bad.inputsOk, false);
  assert.equal(bad.lien, null);
  assert.equal(parseDate("2026-02-31"), null);
  assert.equal(parseDate("nope"), null);
});

test("unsupported states throw rather than fall back to a guessed rule", () => {
  assert.throws(() => lienDeadlines({ state: "OH" }), /unsupported/);
});

test("every rule carries a citation and a not-legal-advice finding is always present", () => {
  for (const [code, info] of Object.entries(STATE_RULES)) {
    assert.match(info.citation, /§|ch\./, code);
    const r = run({ state: code });
    assert.ok(r.findings.some((f) => /not legal advice/.test(f.title)), code);
  }
});

test("formatDate renders a UTC date", () => {
  assert.equal(formatDate(new Date(Date.UTC(2026, 8, 18))), "Fri, Sep 18, 2026");
});

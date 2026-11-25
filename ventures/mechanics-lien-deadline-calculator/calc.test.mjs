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

test("Georgia: 30-day notice from first furnishing for a second-tier claimant, 90 days to lien", () => {
  const r = run({ state: "GA", tier: "second" });
  assert.equal(iso(r.prelim.date), "2026-04-09");
  assert.equal(iso(r.lien.date), "2026-09-18");
  assert.match(JSON.stringify(r), /Notice to Contractor/);
});

test("Colorado: lien 4 months after last furnishing, notice of intent 10 days before", () => {
  const r = run({ state: "CO", firstFurnishing: "2026-03-20", lastFurnishing: "2026-06-30" });
  assert.equal(iso(r.lien.date), "2026-10-30");
  assert.equal(iso(r.prelim.date), "2026-10-20");
  assert.match(JSON.stringify(r), /notice of intent/);
  const eom = run({ state: "CO", firstFurnishing: "2026-01-01", lastFurnishing: "2026-10-31" });
  assert.equal(iso(eom.lien.date), "2027-02-28");
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
  assert.throws(() => lienDeadlines({ state: "MT" }), /unsupported/);
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

test("Georgia: a first-tier claimant owes no Notice to Contractor but keeps the lien date", () => {
  const r = run({ state: "GA" });
  assert.equal(r.tier, "first");
  assert.equal(r.prelim, null);
  assert.match(r.prelimNotRequired, /do not contract directly with the general contractor/);
  assert.equal(iso(r.lien.date), "2026-09-18");
  assert.ok(r.findings.some((f) => /no Notice to Contractor for a first-tier/.test(f.title)));
  // the 30-day/notice-of-commencement caveat is only for those who owe the notice
  assert.ok(!r.findings.some((f) => /earlier cutoff/.test(f.title)));
});

test("tier changes nothing outside Georgia", () => {
  for (const state of ["CA", "TX", "FL", "AZ", "WA", "CO", "NC", "OH"]) {
    for (const projectType of ["commercial", "residential"]) {
      const a = run({ state, projectType, tier: "first" });
      const b = run({ state, projectType, tier: "second" });
      assert.equal(iso(a.prelim.date), iso(b.prelim.date), state);
      assert.equal(iso(a.lien.date), iso(b.lien.date), state);
    }
  }
});

test("Texas commercial: one notice per month of work, 15th of the 3rd month after each", () => {
  // Work March to June 2026: notices due Jun 15, Jul 15, Aug 15, Sep 15
  // (Tex. Prop. Code § 53.056 as amended by HB 2237, counted by hand).
  const r = run({ state: "TX", projectType: "commercial" });
  assert.deepEqual(r.noticeSchedule.map((x) => x.workMonth), ["March 2026", "April 2026", "May 2026", "June 2026"]);
  assert.deepEqual(r.noticeSchedule.map((x) => iso(x.date)), ["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]);
  // Aug 15 2026 is a Saturday: safe date Friday Aug 14
  assert.equal(iso(r.noticeSchedule[2].safeDate), "2026-08-14");
  assert.equal(iso(r.noticeSchedule[0].date), iso(r.prelim.date));
  assert.ok(r.findings.some((f) => /4 monthly notices/.test(f.title)));
});

test("Texas residential schedule uses the 2nd month and crosses the year end", () => {
  const r = lienDeadlines({ state: "TX", projectType: "residential", firstFurnishing: "2026-11-05", lastFurnishing: "2027-01-02" });
  assert.deepEqual(r.noticeSchedule.map((x) => iso(x.date)), ["2027-01-15", "2027-02-15", "2027-03-15"]);
});

test("Texas schedule reports passed months and points to the earliest open one", () => {
  const r = run({ state: "TX", today: "2026-07-20" });
  assert.deepEqual(r.noticeSchedule.map((x) => x.status), ["passed", "passed", "open", "open"]);
  const f = r.findings.find((x) => /2 of 4 monthly notice dates have passed/.test(x.title));
  assert.ok(f);
  assert.match(f.detail, /May 2026 work/);
  assert.ok(r.findings.some((x) => /first month's notice date has already passed/.test(x.title)));
});

test("Texas uses the current notice name and states the 2022 contract-date limit", () => {
  const r = run({ state: "TX" });
  assert.equal(r.prelimLabel, "notice of claim for unpaid labor or materials");
  assert.ok(r.findings.some((f) => /1 January 2022/.test(f.title)));
});

test("a single-month Texas job keeps the plain wording and long jobs are capped", () => {
  const one = lienDeadlines({ state: "TX", firstFurnishing: "2026-03-02", lastFurnishing: "2026-03-30" });
  assert.equal(one.noticeSchedule.length, 1);
  assert.ok(!one.findings.some((f) => /monthly notices/.test(f.title)));
  const long = lienDeadlines({ state: "TX", firstFurnishing: "2020-01-01", lastFurnishing: "2026-01-01" });
  assert.equal(long.noticeSchedule.length, 36);
  assert.ok(long.findings.some((f) => /first 36 months/.test(f.title)));
});

test("no schedule outside Texas", () => {
  assert.equal(run({ state: "CA" }).noticeSchedule, null);
});

test("Colorado: notice of intent is 10 days before the safe filing date, not the weekend statutory date", () => {
  // last furnishing 2026-01-09 -> lien 2026-05-09 (Sat), safe filing Fri 2026-05-08.
  const r = lienDeadlines({ state: "CO", firstFurnishing: "2025-12-01", lastFurnishing: "2026-01-09" });
  assert.equal(iso(r.lien.date), "2026-05-09");
  assert.equal(iso(r.lien.safeDate), "2026-05-08");
  // Serving on the shown notice date and filing on the shown safe date must leave 10 full days.
  assert.equal(iso(r.prelim.safeDate), "2026-04-28");
  assert.ok((r.lien.safeDate - r.prelim.safeDate) / 86_400_000 >= 10);
});

test("an open date far away raises no deadline-imminent finding", () => {
  const r = run({ state: "TX", today: "2026-07-01" }); // lien open, months away
  assert.equal(r.lien.status, "open");
  assert.ok(!r.findings.some((f) => /lien filing date is/.test(f.title)));
  assert.ok(!r.findings.some((f) => /days? away|is today/.test(f.title)));
});

test("Texas passed-month count counts only passed months", () => {
  // 2026-03..2026-06 schedule; on 2026-07-20 two months passed, two open.
  const r = run({ state: "TX", today: "2026-07-20" });
  assert.ok(r.findings.some((f) => f.title === "2 of 4 monthly notice dates have passed"));
  // Asymmetric case: one passed, three open.
  const one = run({ state: "TX", today: "2026-06-20" });
  assert.ok(one.findings.some((f) => f.title === "1 of 4 monthly notice dates have passed"));
  // Nothing passed yet: no passed-count finding.
  const early = run({ state: "TX", today: "2026-03-15" });
  assert.ok(!early.findings.some((f) => /monthly notice dates have passed/.test(f.title)));
});

test("parseDate rejects non-string input instead of throwing", () => {
  assert.equal(parseDate(20260310), null);
  assert.equal(parseDate({}), null);
  assert.equal(parseDate(null), null);
});

test("Texas with only a last furnishing date computes the lien without a schedule", () => {
  const r = lienDeadlines({ state: "TX", lastFurnishing: "2026-06-20" });
  assert.equal(r.noticeSchedule, null);
  assert.equal(iso(r.lien.date), "2026-10-15");
  assert.equal(r.prelim, null);
});

test("every modeled rule resolves to a real date for ordinary inputs", () => {
  for (const state of Object.keys(STATE_RULES)) {
    for (const projectType of ["commercial", "residential"]) {
      for (const tier of ["first", "second"]) {
        const r = run({ state, projectType, tier });
        assert.ok(r.lien && r.lien.date instanceof Date, `${state} ${projectType} ${tier} lien`);
        assert.equal(r.lien.weekend, [0, 6].includes(r.lien.date.getUTCDay()));
        if (!r.prelimNotRequired) assert.ok(r.prelim && r.prelim.date instanceof Date, `${state} ${projectType} ${tier} prelim`);
      }
    }
  }
});

// Added 2026-11-25 with the three states read in the statute text; dates
// counted by hand from first 2026-03-10 and last 2026-06-20.
test("North Carolina: Notice to Lien Agent 15 days after first, claim of lien 120 days after last", () => {
  const r = run({ state: "NC" });
  assert.equal(iso(r.prelim.date), "2026-03-25");
  assert.equal(iso(r.lien.date), "2026-10-18"); // Jun 30 = 10, Jul 31 = 41, Aug 31 = 72, Sep 30 = 102, Oct 18 = 120
  assert.ok(r.findings.some((f) => /designated lien agent/.test(f.detail)));
  assert.equal(iso(run({ state: "NC", projectType: "residential" }).lien.date), "2026-10-18");
});

test("New York: no preliminary notice; notice of lien 8 months after last, 4 on a single family dwelling", () => {
  const r = run({ state: "NY" });
  assert.equal(r.prelim, null);
  assert.match(r.prelimNotRequired, /no preliminary notice/);
  assert.ok(r.findings.some((f) => f.title === "New York: no preliminary notice required"));
  assert.ok(!r.findings.some((f) => /first-tier/.test(f.title)));
  assert.equal(iso(r.lien.date), "2027-02-20");
  const home = run({ state: "NY", projectType: "residential" });
  assert.equal(iso(home.lien.date), "2026-10-20");
  assert.ok(home.findings.some((f) => /single family dwelling/.test(f.detail)));
  // month-end clamp: 8 months after Jun 30 is Feb 28 (2027 is not a leap year)
  assert.equal(iso(run({ state: "NY", lastFurnishing: "2026-06-30" }).lien.date), "2027-02-28");
});

test("Ohio: notice of furnishing 21 days after first; affidavit 75 days after last, 60 residential", () => {
  const r = run({ state: "OH" });
  assert.equal(iso(r.prelim.date), "2026-03-31");
  assert.equal(iso(r.lien.date), "2026-09-03"); // Jun 30 = 10, Jul 31 = 41, Aug 31 = 72, Sep 3 = 75
  assert.ok(r.findings.some((f) => /notice of commencement/.test(f.detail)));
  assert.equal(iso(run({ state: "OH", projectType: "residential" }).lien.date), "2026-08-19"); // Jul 31 = 41, Aug 19 = 60
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { lienDeadlines, formatDate, parseDate, STATE_RULES, federalHolidayOn, monthlyNoticeSchedule, MAX_SCHEDULE_MONTHS } from "./calc.mjs";

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
  assert.equal(iso(run({ state: "WA", tier: "second" }).prelim.date), "2026-05-09");
  const res = run({ state: "WA", projectType: "residential", tier: "second" });
  assert.equal(iso(res.prelim.date), "2026-03-20");
  assert.equal(iso(res.lien.date), "2026-09-18");
  assert.ok(res.findings.some((f) => /single-family/.test(f.detail)));
});

test("weekend deadlines report the last business day as the safe date", () => {
  const r = run({ state: "WA", tier: "second" }); // 2026-05-09 is a Saturday
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
  assert.throws(() => lienDeadlines({ state: "IA" }), /unsupported/);
  assert.throws(() => lienDeadlines({ state: "IL" }), /unsupported/);
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

test("tier changes nothing outside Georgia and Washington", () => {
  for (const state of ["CA", "TX", "FL", "AZ", "CO", "NC", "OH"]) {
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
        if (!r.prelimNotRequired && !r.prelimNotModeled) assert.ok(r.prelim && r.prelim.date instanceof Date, `${state} ${projectType} ${tier} prelim`);
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

// Statute check 2026-11-25 (see calc.mjs header): RCW 60.04.031(2)(c), (3)(b).
test("Washington: a sub hired by the prime contractor owes no notice, except on an owner-occupied remodel", () => {
  const com = run({ state: "WA", tier: "first" });
  assert.equal(com.prelim, null);
  assert.match(com.prelimNotRequired, /60\.04\.031\(2\)\(c\)/);
  assert.equal(iso(com.lien.date), "2026-09-18");
  const res = run({ state: "WA", tier: "first", projectType: "residential" });
  assert.equal(iso(res.prelim.date), "2026-05-09"); // remodel: 60-day look-back
  assert.ok(res.findings.some((f) => /who owes this notice/.test(f.title) && /remodel/.test(f.detail)));
  assert.ok(!res.findings.some((f) => /residential category/.test(f.title)));
});

test("look-back states: a late notice covers only the days before it, and the date is given", () => {
  // CA, first furnishing 2026-03-10; today 2026-06-01 -> notice served today covers work from 2026-05-12.
  const ca = run({ state: "CA", today: "2026-06-01" });
  assert.equal(ca.prelim.status, "passed");
  assert.equal(iso(ca.lateNoticeReach), "2026-05-12");
  assert.ok(ca.findings.some((f) => /already passed/.test(f.title) && /May 12, 2026/.test(f.detail) && /8204/.test(f.detail)));
  const az = run({ state: "AZ", today: "2026-06-01" });
  assert.equal(iso(az.lateNoticeReach), "2026-05-12");
  const wa = run({ state: "WA", tier: "second", today: "2026-06-01" });
  assert.equal(iso(wa.lateNoticeReach), "2026-04-02");
  const waNew = run({ state: "WA", tier: "second", projectType: "residential", today: "2026-06-01" });
  assert.equal(iso(waNew.lateNoticeReach), "2026-05-22");
  // before the date: an info note explains the look-back, no reach date
  const early = run({ state: "CA", today: "2026-03-12" });
  assert.equal(early.lateNoticeReach, null);
  assert.ok(early.findings.some((f) => /late notice still counts/.test(f.title)));
});

test("Florida: a late Notice to Owner is named as a complete defense, with no look-back date", () => {
  const fl = run({ state: "FL", today: "2026-06-01" });
  assert.equal(fl.prelim.status, "passed");
  assert.equal(fl.lateNoticeReach, null);
  assert.ok(fl.findings.some((f) => /already passed/.test(f.title) && /complete defense/.test(f.detail) && /713\.06\(2\)\(a\)/.test(f.detail)));
});

test("California cites § 8414 (claimants other than a direct contractor), not § 8412", () => {
  const r = run({ state: "CA" });
  assert.match(r.citation, /8414/);
  assert.doesNotMatch(r.citation, /8412/);
});

test("every state links its statute on an official or code-copy host", () => {
  const hosts = /^https:\/\/(leginfo\.legislature\.ca\.gov|statutes\.capitol\.texas\.gov|capitol\.texas\.gov|www\.flsenate\.gov|www\.azleg\.gov|app\.leg\.wa\.gov|law\.justia\.com|www\.ncleg\.gov|www\.nysenate\.gov|codes\.ohio\.gov|www\.legislature\.mi\.gov|www\.revisor\.mn\.gov|www\.leg\.state\.nv\.us|www\.oregonlegislature\.gov|le\.utah\.gov|law\.lis\.virginia\.gov|delcode\.delaware\.gov|legislature\.idaho\.gov|www\.ksrevisor\.gov|mgaleg\.maryland\.gov|archive\.legmt\.gov|nebraskalegislature\.gov|ndlegis\.gov|www\.scstatehouse\.gov|sdlegislature\.gov)\//;
  for (const state of Object.keys(STATE_RULES)) {
    const r = run({ state });
    assert.ok(r.sources.length >= 1, state);
    for (const s of r.sources) assert.match(s.url, hosts, state);
  }
});

// Added 2026-11-28: six states copied from PayApps' statute-read rules (calc.mjs
// header). Dates counted by hand from first 2026-03-10 and last 2026-06-20.
test("Michigan: notice of furnishing 20 days after first, claim of lien 90 days after last", () => {
  const r = run({ state: "MI" });
  assert.equal(iso(r.prelim.date), "2026-03-30"); // Mar 10 + 20
  assert.equal(iso(r.lien.date), "2026-09-18"); // Jun 30 = 10, Jul 31 = 41, Aug 31 = 72, Sep 18 = 90
  assert.ok(r.findings.some((f) => /notice of commencement/.test(f.detail) && /570\.1108/.test(f.detail)));
  const late = run({ state: "MI", today: "2026-06-01" });
  assert.ok(late.findings.some((f) => /already passed/.test(f.title) && /570\.1109\(5\), \(6\)/.test(f.detail)));
  assert.equal(late.lateNoticeReach, null);
});

test("Minnesota: 120 days after last; the earlier notices are not dated, never called not required", () => {
  const r = run({ state: "MN" });
  assert.equal(iso(r.lien.date), "2026-10-18");
  assert.equal(r.prelim, null);
  assert.equal(r.prelimNotRequired, null);
  assert.match(r.prelimNotModeled, /not checked against the statute/);
  assert.ok(r.findings.some((f) => /is not dated here/.test(f.title)));
  assert.ok(r.findings.some((f) => /serve/.test(f.detail) && /514\.08/.test(f.detail)));
});

test("Nevada: 90 days after the later of completion and own last furnishing, or 40 after a notice of completion", () => {
  assert.equal(iso(run({ state: "NV" }).lien.date), "2026-09-18");
  // completion before the last day is not used (the statute takes the later one)
  const early = run({ state: "NV", completionDate: "2026-06-01" });
  assert.equal(iso(early.lien.date), "2026-09-18");
  assert.match(early.lien.description, /later of the two/);
  // completion after: counts from completion; Jul 15 + 90 = Oct 13
  assert.equal(iso(run({ state: "NV", completionDate: "2026-07-15" }).lien.date), "2026-10-13");
  // notice of completion Jul 1 + 40 = Aug 10, earlier
  assert.equal(iso(run({ state: "NV", completionDate: "2026-07-15", noticeOfCompletionDate: "2026-07-01" }).lien.date), "2026-08-10");
});

test("Oregon and Virginia: whichever comes first, own last furnishing or completion", () => {
  assert.equal(iso(run({ state: "OR" }).lien.date), "2026-09-03"); // Jun 20 + 75
  assert.equal(iso(run({ state: "OR", completionDate: "2026-06-01" }).lien.date), "2026-08-15"); // Jun 1 + 75, earlier
  // Virginia: 90 from Jun 30 = Sep 28; without completion, 90 from the last day (Sep 18) is the earliest it can be
  const va = run({ state: "VA" });
  assert.equal(iso(va.lien.date), "2026-09-18");
  assert.ok(va.findings.some((f) => /moves? .*earlier|is earlier/.test(f.detail) && /completion/.test(f.title + f.detail)));
  assert.equal(iso(run({ state: "VA", completionDate: "2026-12-01" }).lien.date), "2026-09-28");
});

test("Utah: 180 days after final completion, or 90 after a notice of completion", () => {
  assert.equal(iso(run({ state: "UT" }).lien.date), "2026-12-17"); // Jun 20 + 180
  assert.equal(iso(run({ state: "UT", noticeOfCompletionDate: "2026-07-01" }).lien.date), "2026-09-29"); // Jul 1 + 90
});

test("a deadline on a federal holiday steps back to the business day before", () => {
  const r = lienDeadlines({ state: "WA", projectType: "commercial", firstFurnishing: "2026-08-01", lastFurnishing: "2026-08-28" });
  // Washington: 90 days after the last day = 2026-11-26, Thanksgiving Day.
  assert.equal(iso(r.lien.date), "2026-11-26");
  assert.deepEqual(r.lien.holidays, ["Thanksgiving Day"]);
  assert.equal(r.lien.weekend, false);
  assert.equal(iso(r.lien.safeDate), "2026-11-25");
  assert.ok(r.findings.some((f) => /federal holiday/.test(f.title) && /Thanksgiving Day/.test(f.detail)));
});

test("a weekend deadline also steps back past a federal holiday just before it", () => {
  // 90 days after 2026-04-05 is Saturday 2026-07-04; Independence Day is observed Friday 3 July.
  const r = lienDeadlines({ state: "WA", projectType: "commercial", firstFurnishing: "2026-03-01", lastFurnishing: "2026-04-05" });
  assert.equal(iso(r.lien.date), "2026-07-04");
  assert.equal(r.lien.weekend, true);
  assert.deepEqual(r.lien.holidays, ["Independence Day"]);
  assert.equal(iso(r.lien.safeDate), "2026-07-02");
});

test("federalHolidayOn knows the observed dates", () => {
  assert.equal(federalHolidayOn(new Date(Date.UTC(2026, 6, 3))), "Independence Day");
  assert.equal(federalHolidayOn(new Date(Date.UTC(2026, 6, 4))), null);
  assert.equal(federalHolidayOn(new Date(Date.UTC(2027, 11, 31))), "New Year's Day"); // 2028-01-01 is a Saturday
  assert.equal(federalHolidayOn(new Date(Date.UTC(2026, 0, 19))), "Birthday of Martin Luther King, Jr.");
  assert.equal(federalHolidayOn(new Date(Date.UTC(2026, 4, 25))), "Memorial Day");
});

test("the nine states added 2026-11-28 count from the last day furnished", () => {
  // 2026-09-01 is a Tuesday; +90 is Mon 2026-11-30, +120 Wed 2026-12-30, +180 Sun 2027-02-28
  // (safe date Fri 2027-02-26), +3 months Tue 2026-12-01.
  const want = { DE: "2026-12-30", ID: "2026-11-30", KS: "2026-12-01", MD: "2027-02-28", MT: "2026-11-30", NE: "2026-12-30", ND: "2026-11-30", SC: "2026-11-30", SD: "2026-12-30" };
  for (const [state, date] of Object.entries(want)) {
    const r = lienDeadlines({ state, firstFurnishing: "2026-06-01", lastFurnishing: "2026-09-01", today: "2026-09-02" });
    assert.equal(r.lien.date.toISOString().slice(0, 10), date, state);
  }
  const md = lienDeadlines({ state: "MD", firstFurnishing: "2026-06-01", lastFurnishing: "2026-09-01", today: "2026-09-02" });
  assert.equal(md.lien.safeDate.toISOString().slice(0, 10), "2027-02-26");
  // The notice of intention: 60 days before the petition's safe date, so never after 120 days.
  assert.ok(md.prelim.date <= new Date(Date.UTC(2026, 11, 30)), "Maryland notice within 120 days");
});

test("Memorial Day when May ends on a Monday is that last day (2027-05-31)", () => {
  assert.equal(federalHolidayOn(new Date(Date.UTC(2027, 4, 31))), "Memorial Day");
  assert.equal(federalHolidayOn(new Date(Date.UTC(2027, 4, 24))), null);
});

test("the Texas schedule is truncated only past MAX_SCHEDULE_MONTHS months", () => {
  const first = new Date(Date.UTC(2020, 0, 1));
  const exact = monthlyNoticeSchedule(first, new Date(Date.UTC(2020, MAX_SCHEDULE_MONTHS - 1, 1)), 3, null);
  assert.equal(exact.rows.length, MAX_SCHEDULE_MONTHS);
  assert.equal(exact.truncated, false);
  const oneMore = monthlyNoticeSchedule(first, new Date(Date.UTC(2020, MAX_SCHEDULE_MONTHS, 1)), 3, null);
  assert.equal(oneMore.rows.length, MAX_SCHEDULE_MONTHS);
  assert.equal(oneMore.truncated, true);
});

test("a completion or notice-of-completion date before the first furnishing is flagged as a likely typo", () => {
  // A wrong year (2025 for 2026) used to give a "passed" deadline a year before work began, with no hint.
  for (const state of ["VA", "OR", "CA", "NV"]) {
    const r = lienDeadlines({ state, firstFurnishing: "2026-01-05", lastFurnishing: "2026-03-02", completionDate: "2025-01-02", today: "2026-03-10" });
    assert.ok(r.findings.some((f) => f.severity === "high" && /Completion date is before your first furnishing/.test(f.title)), state);
  }
  const noc = lienDeadlines({ state: "CA", firstFurnishing: "2026-01-05", lastFurnishing: "2026-03-02", noticeOfCompletionDate: "2025-01-03", today: "2026-03-10" });
  assert.ok(noc.findings.some((f) => f.severity === "high" && /Notice of completion is before your first furnishing/.test(f.title)));
  const ok = lienDeadlines({ state: "CA", firstFurnishing: "2026-01-05", lastFurnishing: "2026-03-02", completionDate: "2026-02-20", noticeOfCompletionDate: "2026-02-25" });
  assert.ok(!ok.findings.some((f) => /before your first furnishing/.test(f.title)));
});

test("the holiday list matches PayApps' federal-holidays.ts day for day, 2020-2060", async () => {
  // Two copies of the same list (this page is PayApps' free front door); a fix to one must reach
  // the other, or the free page and the paid app show different safe dates. Node 22 strips the types.
  const app = await import("../payapps/apps/payapps/src/shared/federal-holidays.ts");
  const diffs = [];
  for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2061, 0, 1); t += 86_400_000) {
    const d = new Date(t);
    const a = federalHolidayOn(d);
    const b = app.federalHolidayOn(iso(d));
    if (a !== b) diffs.push(`${iso(d)}: calc ${a}, payapps ${b}`);
  }
  assert.deepEqual(diffs, []);
});

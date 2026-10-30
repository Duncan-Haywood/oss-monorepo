import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const P = E.DEFAULT_PROFILE;

test("parseWeekly reads ranges, day spans, past-midnight ends and off days", () => {
  const { slots, errors } = E.parseWeekly("Mon-Fri 15-22; Sat 8:00pm-1am; Sun off");
  assert.deepEqual(errors, []);
  assert.deepEqual(slots[1], [[900, 1320]]);
  assert.deepEqual(slots[5], [[900, 1320]]);
  assert.deepEqual(slots[6], [[1200, 1500]]);
  assert.deepEqual(slots[0], []);
  assert.equal(E.parseWeekly("Fri-Mon 9-17").slots[0].length, 1);
  assert.ok(E.parseWeekly("whenever").errors.length);
});

test("scheduleFit is the share of requested minutes inside availability", () => {
  assert.equal(E.scheduleFit("Mon-Fri 15-22", "Tue 16-20"), 1);
  assert.equal(E.scheduleFit("Mon-Fri 15-22", "Sat 16-20"), 0);
  assert.equal(E.scheduleFit("Mon 15-22", "Mon 13-17"), 0.5);
  assert.equal(E.scheduleFit("Mon 15-22", ""), null);
});

test("scoreLead ranks a good fit hot and a blocked one decline, with reasons", () => {
  const good = E.scoreLead({ kids: ["3", "6"], schedule: "Fri 18-21", distanceMiles: 3, budget: 30, wants: "weekly", source: "referral" }, P);
  assert.equal(good.tier, "hot");
  assert.ok(good.reasons.length >= 4);
  const far = E.scoreLead({ kids: ["5"], distanceMiles: 40 }, P);
  assert.equal(far.tier, "decline");
  assert.deepEqual(far.blockers, ["distance"]);
  const baby = E.scoreLead({ kids: ["3 months"] }, P);
  assert.deepEqual(baby.blockers, ["age"]);
  const many = E.scoreLead({ kids: ["2", "4", "6", "8"] }, P);
  assert.ok(many.blockers.includes("kids"));
});

test("faith-based activities only ever add to a score, and beliefs are not an input", () => {
  const base = { kids: ["4"], schedule: "Fri 18-21" };
  const a = E.scoreLead(base, P).score;
  const b = E.scoreLead({ ...base, faithActivities: true }, P).score;
  const c = E.scoreLead({ ...base, faithActivities: false, religion: "none" }, P).score;
  assert.ok(b > a);
  assert.equal(c, a);
});

test("quote: minimum hours, extra child, late hours, holiday and last-minute", () => {
  const r = P.rates;
  const short = E.quote({ start: "18:00", end: "19:00", kids: 1 }, r, []);
  assert.equal(short.hours, 3);
  assert.equal(short.total, 60);
  const q = E.quote({ date: "2026-12-31", start: "19:00", end: "01:00", kids: 2, bookedOn: "2026-12-31" }, r, P.holidays);
  // 6 h × $23 = 138, 2 h late × $5 = 10, holiday 0.5 × 148 = 74, last-minute 15
  assert.equal(q.total, 237);
  assert.equal(q.lines.length, 4);
});

test("cancellation fee applies only inside the window", () => {
  const sit = { date: "2026-11-10", start: "18:00", end: "22:00", kids: 1 };
  assert.equal(E.cancellationFee(sit, "2026-11-08T12:00:00Z"), 0);
  assert.equal(E.cancellationFee(sit, "2026-11-10T09:00:00Z"), 40);
});

test("conflicts finds overlaps and tight travel gaps but not back-to-back sits for one family", () => {
  const b = [
    { id: "a", familyId: "f1", date: "2026-11-06", start: "15:00", end: "18:00" },
    { id: "b", familyId: "f2", date: "2026-11-06", start: "17:30", end: "20:00" },
    { id: "c", familyId: "f3", date: "2026-11-06", start: "20:10", end: "22:00" },
    { id: "d", familyId: "f3", date: "2026-11-06", start: "22:00", end: "23:00" },
  ];
  const c = E.conflicts(b, 30);
  assert.deepEqual(c.map((x) => [x.a.id, x.b.id, x.kind]), [["a", "b", "overlap"], ["b", "c", "tight"]]);
});

test("weekly repeats expand and appear in conflicts and the calendar", () => {
  const desk = E.emptyDesk();
  desk.families = [{ id: "f", name: "Test family", kids: [{ name: "Kid", allergies: "nuts" }] }];
  desk.bookings = [{ id: "r", familyId: "f", date: "2026-11-02", start: "15:00", end: "18:00", repeatWeeks: 3 }];
  assert.deepEqual(E.expandBookings(desk.bookings).map((x) => x.date), ["2026-11-02", "2026-11-09", "2026-11-16"]);
  const ics = E.toICS(desk);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 3);
  assert.match(ics, /allergies: nuts/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
  assert.equal(E.toICS(desk, { privateNotes: false }).includes("nuts"), false);
});

test("canTake checks availability and existing sits", () => {
  const desk = E.emptyDesk();
  desk.bookings = [{ id: "x", familyId: "f", date: "2026-11-02", start: "16:00", end: "19:00" }];
  assert.equal(E.canTake(desk, { date: "2026-11-03", start: "16:00", end: "19:00" }).ok, true);
  assert.equal(E.canTake(desk, { date: "2026-11-02", start: "18:00", end: "20:00" }).ok, false);
  assert.match(E.canTake(desk, { date: "2026-11-01", start: "10:00", end: "12:00" }).why[0], /outside your Sun availability/);
});

test("taxSummary: SE tax, set-aside, quarters, mileage and household-employee flag", () => {
  const desk = E.emptyDesk();
  desk.families = [{ id: "f", name: "Big family" }];
  desk.bookings = [
    { id: "1", familyId: "f", date: "2026-02-10", start: "08:00", end: "18:00", payments: [{ amount: 2000, date: "2026-02-28", method: "Venmo" }], miles: 100 },
    { id: "2", familyId: "f", date: "2026-07-10", start: "08:00", end: "18:00", payments: [{ amount: 8000, date: "2026-07-31", method: "cash" }], miles: 100 },
  ];
  desk.expenses = [{ date: "2026-03-01", amount: 100, category: "training" }];
  const t = E.taxSummary(desk, 2026, "2026-08-01");
  assert.equal(t.income, 10000);
  assert.equal(t.mileage, 148.5); // 100 × 0.725 + 100 × 0.76
  assert.equal(t.net, 9751.5);
  assert.equal(t.seTax, Math.round(9751.5 * 0.9235 * 0.153 * 100) / 100);
  assert.deepEqual(t.quarters.map((q) => q.income), [2000, 0, 8000, 0]);
  assert.deepEqual(t.quarters.map((q) => q.due), ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  assert.ok(t.flags.some((f) => /household employee/.test(f)));
  assert.ok(t.flags.some((f) => /1099-K/.test(f)));
});

test("SE tax caps the Social Security part at the wage base and is zero under $400", () => {
  const desk = E.emptyDesk();
  desk.bookings = [{ id: "1", date: "2026-05-01", start: "08:00", end: "09:00", payments: [{ amount: 300000, date: "2026-05-01" }] }];
  const t = E.taxSummary(desk, 2026);
  const base = 300000 * 0.9235;
  assert.equal(t.seTax, Math.round((184500 * 0.124 + base * 0.029) * 100) / 100);
  desk.bookings[0].payments[0].amount = 350;
  assert.equal(E.taxSummary(desk, 2026).seTax, 0);
});

test("quarterly due dates move off weekends", () => {
  assert.deepEqual(E.quarterlyDueDates(2028), ["2028-04-17", "2028-06-15", "2028-09-15", "2029-01-15"]);
});

test("unpaid applies payments to the oldest occurrence of a weekly booking", () => {
  const desk = E.emptyDesk();
  desk.bookings = [{ id: "w", date: "2026-11-02", start: "15:00", end: "18:00", repeatWeeks: 4, payments: [{ amount: 60, date: "2026-11-02" }] }];
  const u = E.unpaid(desk, "2026-11-12");
  assert.equal(u.length, 1);
  assert.equal(u[0].owed, 60);
  assert.equal(u[0].booking.date, "2026-11-09");
});

test("familyStatement totals one family's payments for the year", () => {
  const d = E.exampleDesk("2026-11-02");
  const s = E.familyStatement(d, "fam_a", 2026);
  assert.equal(s.total, 129);
  assert.match(s.text, /Total paid for care in 2026: \$129\.00/);
});

test("only consented testimonials reach the website, by first name and initial", () => {
  const d = E.exampleDesk();
  d.references.push({ id: "r3", name: "Pat Private", quote: "Do not publish me", consentPublic: false });
  d.references.push({ id: "r4", name: "Unasked Person", quote: "Not asked yet" });
  const html = E.buildSite(d);
  assert.match(html, /Ana R\./);
  assert.doesNotMatch(html, /Do not publish me|Not asked yet|Rivera/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(ld["@type"], "ChildCare");
});

test("buildSite escapes profile text and shows the faith section only when chosen", () => {
  const d = E.emptyDesk();
  d.profile.bio = "<script>alert(1)</script>";
  d.profile.faithStatement = "I follow Jesus.";
  assert.doesNotMatch(E.buildSite(d), /<script>alert/);
  assert.doesNotMatch(E.buildSite(d), /I follow Jesus/);
  d.profile.showFaith = true;
  assert.match(E.buildSite(d), /I follow Jesus/);
  assert.match(E.buildSite(d, { formAction: "/inquiry" }), /action="\/inquiry"/);
});

test("todayQueue puts hot leads and overdue money first and stops follow-ups after the sequence", () => {
  const d = E.exampleDesk("2026-11-02");
  const q = E.todayQueue(d, "2026-11-02");
  assert.match(q[0].title, /Hannah Brooks \(hot/);
  assert.ok(q.some((i) => i.kind === "unpaid"));
  assert.ok(q.some((i) => i.kind === "rebook" && /Chen/.test(i.title)));
  assert.ok(!q.some((i) => /Tom Ellis/.test(i.title)), "a declined lead gets one kind no, not a chase");
  d.leads[0].followUps = 3;
  assert.ok(!E.todayQueue(d, "2026-11-02").some((i) => /Hannah/.test(i.title)));
});

test("todayQueue warns two weeks before an estimated tax due date", () => {
  const d = E.emptyDesk();
  assert.ok(E.todayQueue(d, "2026-09-05").some((i) => i.kind === "tax" && /Q3 2026/.test(i.title)));
  assert.ok(E.todayQueue(d, "2027-01-10").some((i) => i.kind === "tax" && /Q4 2026/.test(i.title)));
});

test("leadFromForm trims, splits ages and notices faith requests", () => {
  const l = E.leadFromForm({ name: "A B", contact: "a@b.co", kids: "2, 5 and 18 months", notes: "bedtime prayers please" }, "2026-11-01", "id1");
  assert.deepEqual(l.kids, ["2", "5", "18 months"]);
  assert.equal(l.faithActivities, true);
  assert.equal(E.parseAgeMonths("18 months"), 18);
  assert.equal(E.parseAgeMonths("2"), 24);
});

test("contentCalendar gives a dated, seasonal, non-repeating plan", () => {
  const c = E.contentCalendar("2026-11-02", 8, { ...P, showFaith: true });
  assert.equal(c.length, 8);
  assert.equal(new Set(c.slice(0, 3).map((x) => x.topic)).size, 3);
  assert.match(c[6].topic, /Christmas|Advent/);
});

test("normalizeDesk repairs junk input", () => {
  const d = E.normalizeDesk({ leads: "nope", profile: { rates: { hourly: 25 } } });
  assert.deepEqual(d.leads, []);
  assert.equal(d.profile.rates.hourly, 25);
  assert.equal(d.profile.rates.extraChild, P.rates.extraChild);
});

test("familyStatement counts what the family paid: packages when bought, not credits when used", () => {
  const d = E.emptyDesk();
  d.families = [{ id: "f", name: "Pat family" }];
  d.packages = { plans: [], sold: [{ id: "s1", familyId: "f", name: "Date nights x4", price: 300, soldOn: "2026-02-01", method: "Venmo", redemptions: [] }], gifts: [], events: [] };
  d.bookings = [
    { id: "b1", familyId: "f", date: "2026-02-14", start: "18:00", end: "22:00", payments: [{ amount: 75, date: "2026-02-14", method: "package", credit: true }] },
    { id: "b2", familyId: "f", date: "2026-03-01", start: "18:00", end: "21:00", payments: [{ amount: 60, date: "2026-03-01", method: "cash" }, { amount: 80, date: "2026-03-01", method: "gift certificate", credit: true }] },
  ];
  const s = E.familyStatement(d, "f", 2026);
  assert.equal(s.total, 360);
  assert.equal(s.rows.length, 2);
  assert.doesNotMatch(s.text, /gift certificate/);
});

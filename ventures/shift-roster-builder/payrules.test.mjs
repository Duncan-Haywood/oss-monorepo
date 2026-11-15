import { test } from "node:test";
import assert from "node:assert/strict";
import { payWeek, readPayEnv, payForTimesheet } from "./payrules.mjs";
import { punch, timesheet, timesheetCsv } from "./timeclock.mjs";
import { handler, emptyState } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

// Week minutes: day d at hh:mm.
const t = (d, h, m = 0) => d * 1440 + h * 60 + m;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test("federal: five 9-hour days are 40 regular and 5 at 1.5x", () => {
  const r = payWeek([0, 1, 2, 3, 4].map((d) => ({ a: t(d, 8), b: t(d, 17) })), { rules: "federal", wage: 20 });
  near(r.regularH, 40, "regular"); near(r.overtimeH, 5, "ot"); near(r.doubleH, 0, "dt");
  near(r.gross, 45 * 20 + 0.5 * 20 * 5, "gross");
  assert.deepEqual(r.flags, []); // no meal-period duty under the FLSA
});

test("california: daily overtime with a lunch break, and the same week with no breaks", () => {
  const withLunch = [0, 1, 2, 3, 4].flatMap((d) => [{ a: t(d, 9), b: t(d, 13) }, { a: t(d, 13, 30), b: t(d, 18, 30) }]);
  const r = payWeek(withLunch, { rules: "california", wage: 20 });
  near(r.overtimeH, 5, "1 h a day over 8"); near(r.regularH, 40, "regular"); assert.equal(r.mealPremiumDays, 0);
  near(r.gross, 900 + 50, "gross");
  const noBreak = payWeek([0, 1, 2, 3, 4].map((d) => ({ a: t(d, 9), b: t(d, 18) })), { rules: "california", wage: 20 });
  assert.equal(noBreak.mealPremiumDays, 5);
  near(noBreak.gross, 900 + 50 + 5 * 20, "one extra hour a day");
  assert.match(noBreak.flags[0], /^Mon: no 30-min meal break by the end of the 5th hour/);
});

test("california: a 13-hour day is 8 regular, 4 at 1.5x and 1 at 2x, with one meal premium for two missed breaks", () => {
  const r = payWeek([{ a: t(0, 6), b: t(0, 12) }, { a: t(0, 12, 30), b: t(0, 19, 30) }], { rules: "california", wage: 20 });
  near(r.regularH, 8, "regular"); near(r.overtimeH, 4, "ot"); near(r.doubleH, 1, "dt");
  assert.equal(r.flags.length, 2); // first break came after 6 h, no second break
  assert.equal(r.mealPremiumDays, 1); // Labor Code 226.7 caps it at one hour per workday
  near(r.gross, 13 * 20 + 0.5 * 20 * 4 + 20 * 1 + 20, "gross");
});

test("california: the seventh consecutive day, and weekly overtime on regular hours only", () => {
  const six = [0, 1, 2, 3, 4, 5].map((d) => ({ a: t(d, 9), b: t(d, 15) }));
  const r = payWeek([...six, { a: t(6, 8), b: t(6, 18) }], { rules: "california", wage: 20 });
  near(r.overtimeH, 8, "first 8 of day 7"); near(r.doubleH, 2, "after 8 on day 7"); near(r.regularH, 36, "regular");
  assert.ok(r.notes.some((n) => /seven days/.test(n)));
  // Six-hour periods with no break may be waived: a flag, not a premium. Sunday's 10 h is a premium.
  assert.equal(r.mealPremiumDays, 1);
  assert.equal(r.flags.filter((f) => /waiver/.test(f)).length, 6);
  // Six 8-hour days Mon-Sat with a 30-min break each: no daily overtime, 8 weekly.
  const w = payWeek([0, 1, 2, 3, 4, 5].flatMap((d) => [{ a: t(d, 8), b: t(d, 12) }, { a: t(d, 12, 30), b: t(d, 16, 30) }]), { rules: "california" });
  near(w.overtimeH, 8, "weekly"); near(w.doubleH, 0, "dt"); assert.equal(w.gross, null); // no wage, no estimate
});

test("alaska and colorado: four 10-hour days, a 14-hour day and an overnight 13 hours", () => {
  const four = [0, 1, 2, 3].map((d) => ({ a: t(d, 7), b: t(d, 17) }));
  near(payWeek(four, { rules: "alaska" }).overtimeH, 8, "alaska daily");
  near(payWeek(four, { rules: "federal" }).overtimeH, 0, "federal");
  near(payWeek(four, { rules: "colorado" }).overtimeH, 0, "colorado");
  near(payWeek([{ a: t(2, 6), b: t(2, 20) }], { rules: "colorado" }).overtimeH, 2, "colorado over 12 a day");
  // Friday 18:00 to Saturday 07:00: 6 h + 7 h by calendar day, but 13 consecutive hours.
  near(payWeek([{ a: t(4, 18), b: t(5, 7) }], { rules: "colorado" }).overtimeH, 1, "12 in a row");
  // Alaska: a heavy week takes whichever is greater, never both. Five 10 h days: daily 10, weekly 10.
  near(payWeek([0, 1, 2, 3, 4].map((d) => ({ a: t(d, 7), b: t(d, 17) })), { rules: "alaska" }).overtimeH, 10, "no pyramiding");
});

test("rounding: nearest quarter hour federally, with the net shown; never under the California rules", () => {
  const r = payWeek([{ a: t(0, 8, 53), b: t(0, 17, 7) }, { a: t(1, 9, 8), b: t(1, 16, 52) }], { rules: "federal", roundMin: 15, wage: 10 });
  near(r.hours, 8 + 7.5, "8:53 to 9:00, 17:07 to 17:00; 9:08 to 9:15, 16:52 to 16:45");
  near(r.roundNetMin, -14 - 14, "both punches pairs lost 14 min");
  const ca = payWeek([{ a: t(0, 8, 53), b: t(0, 17, 7) }], { rules: "california", roundMin: 15 });
  assert.equal(ca.roundMin, 0); near(ca.hours, 8 + 14 / 60, "unrounded");
  const env = readPayEnv({ PAY_RULES: "California", PUNCH_ROUND_MIN: "15" });
  assert.equal(env.rules, "california"); assert.equal(env.roundMin, 0); assert.match(env.notes[0], /Donohue/);
  const bad = readPayEnv({ PAY_RULES: "texas", PUNCH_ROUND_MIN: "7" });
  assert.equal(bad.rules, "federal"); assert.equal(bad.roundMin, 0); assert.equal(bad.notes.length, 2);
});

test("two rates: overtime at the weighted-average regular rate (29 CFR 778.115)", () => {
  const spans = [0, 1, 2].map((d) => ({ a: t(d, 6), b: t(d, 16), rate: 10 })).concat([3, 4].map((d) => ({ a: t(d, 6), b: t(d, 16), rate: 20 })));
  const r = payWeek(spans, { rules: "federal" });
  near(r.straightPay, 700, "straight"); near(r.regularRate, 14, "blend"); near(r.overtimeH, 10, "ot");
  near(r.gross, 700 + 0.5 * 14 * 10, "gross");
});

const WEEK = {
  weekStart: "2026-11-16", people: [{ name: "Ana", hours: 40 }],
  assignments: [0, 1, 2, 3, 4].map((d) => ({ person: "Ana", slot: { day: d, startMin: 540, endMin: 1080, label: "", role: "" } })),
};

test("timesheet to pay: CSV carries the pay block, the hub page shows the estimate under the rules set", async () => {
  const s = {};
  for (let d = 16; d <= 20; d++) { punch(s, "Ana", "in", Date.parse(`2026-11-${d}T09:00:00Z`)); punch(s, "Ana", "out", Date.parse(`2026-11-${d}T18:00:00Z`)); }
  const ts = timesheet(s.punches, WEEK, { nowMs: Date.parse("2026-11-21T12:00:00Z") });
  const pay = payForTimesheet(ts, new Map([["Ana", 18]]), { rules: "california" });
  near(pay[0].overtimeH, 5, "ot"); assert.equal(pay[0].mealPremiumDays, 5);
  const csv = timesheetCsv(ts, pay);
  assert.match(csv, /\nperson,pay_rules,regular_hours/);
  assert.match(csv, /Ana,california,40\.00,5\.00,0\.00,5,18\.00,945\.00,,/); // 45 x 18 + 0.5 x 18 x 5 + 5 x 18
  const state = emptyState();
  state.weekStart = "2026-11-16"; state.punches = s.punches; state.punchSeq = s.punchSeq;
  state.published = { ...structuredClone(WEEK), at: "2026-11-15T12:00:00.000Z", unfilled: 0, staffText: "name, wage, max hours\nAna, 18, 50", shiftsText: "" };
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", PAY_RULES: "california" }, () => Date.parse("2026-11-21T12:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/timesheet?key=adm"))).text();
  assert.match(page, /Pay estimate: California/);
  assert.match(page, /\$945\.00/);
  const text = await (await serve(hub, new Request("https://hub.example/admin/timesheet.csv?key=adm&week=2026-11-16"))).text();
  assert.match(text, /Ana,california,40\.00,5\.00/);
  // The staff page still shows no wages.
  assert.doesNotMatch(await (await serve(hub, new Request("https://hub.example/team?t=tm"))).text(), /945\.00|wage/i);
});

// ---- Nevada (NRS 608.018, 608.0126, 608.019) and the DOL-table meal-period states (2026-11-15 later) ----

test("nevada: daily overtime under 1.5x the minimum wage, weekly only at or above it", () => {
  // Four 10-hour days and a 4-hour Friday: 44 h. Daily overtime 4 x 2 = 8; regular 36 so no weekly on top.
  const week = [0, 1, 2, 3].map((d) => ({ a: t(d, 9), b: t(d, 19) })).concat([{ a: t(4, 9), b: t(4, 13) }]);
  const lo = payWeek(week, { rules: "nevada", wage: 15 });
  near(lo.overtimeH, 8, "daily"); near(lo.regularH, 36, "regular");
  near(lo.gross, 44 * 15 + 0.5 * 15 * 8, "gross 720");
  // $20 is at least 1.5 x $12 = $18: weekly only, 44 - 40 = 4.
  const hi = payWeek(week, { rules: "nevada", wage: 20 });
  near(hi.overtimeH, 4, "weekly"); assert.ok(hi.notes.some((n) => /weekly overtime only/.test(n)));
  // The same week federally is 4 h too; the daily rule is what Nevada adds.
  near(payWeek(week, { rules: "federal", wage: 15 }).overtimeH, 4, "federal");
  // An agreed four 10s: no daily overtime.
  const tens = payWeek([0, 1, 2, 3].map((d) => ({ a: t(d, 7), b: t(d, 17) })), { rules: "nevada", wage: 15, fourTens: true });
  near(tens.overtimeH, 0, "four tens"); assert.ok(tens.notes.some((n) => /NV_FOUR_TENS/.test(n)));
  // A lower minimum moves the line: at $10 the line is $15, so $15 is weekly only.
  near(payWeek(week, { rules: "nevada", wage: 15, minWage: 10 }).overtimeH, 4, "line at $15");
  // No wage: counted as if under the line, and said so.
  const none = payWeek(week, { rules: "nevada" });
  near(none.overtimeH, 8, "no wage"); assert.equal(none.gross, null); assert.ok(none.notes.some((n) => /no wage, so daily/.test(n)));
});

test("nevada: the workday is 24 hours from the start of work, not the calendar day", () => {
  // Mon 14:00-22:00 then Tue 06:00-14:00: 8 h on each calendar day, but 16 h inside the workday that began Mon 14:00.
  const r = payWeek([{ a: t(0, 14), b: t(0, 22) }, { a: t(1, 6), b: t(1, 14) }], { rules: "nevada", wage: 15 });
  near(r.overtimeH, 8, "8 over 8 in one workday");
  near(payWeek([{ a: t(0, 14), b: t(0, 22) }, { a: t(1, 6), b: t(1, 14) }], { rules: "alaska" }).overtimeH, 0, "alaska by calendar day");
  // Tue 06:00-15:00 instead: the last hour falls in a new workday starting Tue 14:00, so still 8 over (16 in the first).
  near(payWeek([{ a: t(0, 14), b: t(0, 22) }, { a: t(1, 6), b: t(1, 15) }], { rules: "nevada", wage: 15 }).overtimeH, 8, "boundary");
});

test("nevada: a 30-min meal period in 8 continuous hours; a shorter break does not interrupt", () => {
  const straight = payWeek([{ a: t(0, 9), b: t(0, 17) }], { rules: "nevada", wage: 15 });
  assert.equal(straight.flags.length, 1); assert.match(straight.flags[0], /^Mon: 8 continuous hours/);
  assert.equal(straight.mealPremiumDays, 0); // a flag, no premium
  assert.ok(straight.notes.some((n) => /rest periods/.test(n)));
  const short = payWeek([{ a: t(0, 9), b: t(0, 13) }, { a: t(0, 13, 20), b: t(0, 17, 20) }], { rules: "nevada", wage: 15 });
  assert.equal(short.flags.length, 1, "a 20-min break joins the run");
  const ok = payWeek([{ a: t(0, 9), b: t(0, 13) }, { a: t(0, 13, 30), b: t(0, 17, 30) }], { rules: "nevada", wage: 15 });
  assert.deepEqual(ok.flags, []);
  assert.deepEqual(payWeek([{ a: t(0, 9), b: t(0, 16, 59) }], { rules: "nevada" }).flags, [], "under 8 h");
});

test("meal-period states: Washington's 2-to-5-hour window, Connecticut's first and last 2 hours, Illinois's 5 hours", () => {
  const two = (h1, m1, h2, m2, endH, endM = 0) => [{ a: t(2, 9), b: t(2, h1, m1) }, { a: t(2, h2, m2), b: t(2, endH, endM) }];
  assert.deepEqual(payWeek(two(12, 0, 12, 30, 17, 30), { rules: "washington" }).flags, []); // break at 3 h
  assert.match(payWeek(two(14, 30, 15, 0, 17, 30), { rules: "washington" }).flags[0], /^Wed: no 30-min meal break between 2 and 5 h/); // at 5.5 h
  assert.deepEqual(payWeek([{ a: t(2, 9), b: t(2, 14) }], { rules: "washington" }).flags, [], "exactly 5 h is not over 5");
  assert.equal(payWeek([{ a: t(2, 9), b: t(2, 14, 1) }], { rules: "washington" }).flags.length, 1);
  // Connecticut, 8 h worked from 09:00 to 17:30: a break at 09:30 is inside the first 2 h, one ending 16:00 inside the last 2.
  assert.equal(payWeek(two(9, 30, 10, 0, 17, 30), { rules: "connecticut" }).flags.length, 1);
  assert.deepEqual(payWeek(two(12, 0, 12, 30, 17, 30), { rules: "ct" }).flags, []);
  assert.equal(payWeek(two(15, 30, 16, 0, 17, 30), { rules: "delaware" }).flags.length, 1, "ends 90 min before the end");
  assert.deepEqual(payWeek([{ a: t(2, 9), b: t(2, 16, 29) }], { rules: "connecticut" }).flags, [], "under 7.5 h");
  // Illinois: 20 min starting within 5 h of the start, on 7.5 h or more.
  assert.equal(payWeek(two(14, 15, 14, 35, 17, 15), { rules: "illinois" }).flags.length, 1); // starts at 5 h 15
  assert.deepEqual(payWeek(two(13, 0, 13, 20, 17, 0), { rules: "illinois" }).flags, []);
  assert.deepEqual(payWeek([{ a: t(2, 9), b: t(2, 16) }], { rules: "illinois" }).flags, [], "7 h");
  // None of these states adds overtime or a premium: five 9 h days are 5 h of weekly overtime as federally.
  const r = payWeek([0, 1, 2, 3, 4].map((d) => ({ a: t(d, 8), b: t(d, 17) })), { rules: "washington", wage: 20 });
  near(r.overtimeH, 5, "weekly"); assert.equal(r.mealPremiumDays, 0); near(r.gross, 950, "no premium");
  assert.equal(r.flags.length, 5); assert.ok(r.notes.some((n) => /^Washington: a second 30 min/.test(n)));
});

test("meal-period states: Oregon's two windows, Rhode Island's two lengths, Massachusetts and Minnesota runs", () => {
  // Oregon, 6.5 h with no break: the 6-7 h window applies.
  assert.match(payWeek([{ a: t(0, 9), b: t(0, 15, 30) }], { rules: "oregon" }).flags[0], /2nd to 5th hour/);
  // Oregon, 8 h worked: break at 3 h 20 is inside the 3rd-6th hour window; at 1 h 30 it is not.
  const or = (h, m) => [{ a: t(0, 9), b: t(0, h, m) }, { a: t(0, h, m + 30), b: t(0, 17, 30) }];
  assert.deepEqual(payWeek(or(12, 20), { rules: "oregon" }).flags, []);
  assert.match(payWeek(or(10, 30), { rules: "oregon" }).flags[0], /3rd to 6th hour/);
  assert.deepEqual(payWeek([{ a: t(0, 9), b: t(0, 14, 59) }], { rules: "oregon" }).flags, [], "under 6 h");
  // Rhode Island: 6 h needs 20 min; 8 h needs 30.
  assert.match(payWeek([{ a: t(0, 9), b: t(0, 15) }], { rules: "rhode island" }).flags[0], /20-min mealtime in a 6 h shift/);
  const ri20 = [{ a: t(0, 9), b: t(0, 13) }, { a: t(0, 13, 20), b: t(0, 17, 20) }];
  assert.deepEqual(payWeek(ri20.map((s) => ({ a: s.a, b: Math.min(s.b, t(0, 15, 20)) })), { rules: "rhode-island" }).flags, [], "6 h with 20 min");
  assert.match(payWeek(ri20, { rules: "RI" }).flags[0], /30-min mealtime in an 8 h shift/);
  // Massachusetts: over 6 h with no 30-min break; a 20-min break joins the run.
  assert.equal(payWeek([{ a: t(0, 9), b: t(0, 12) }, { a: t(0, 12, 20), b: t(0, 15, 50) }], { rules: "massachusetts" }).flags.length, 1);
  assert.deepEqual(payWeek([{ a: t(0, 9), b: t(0, 12) }, { a: t(0, 12, 30), b: t(0, 16) }], { rules: "ma" }).flags, []);
  // Minnesota: 8 h straight is flagged; any clock-out to eat clears it.
  assert.equal(payWeek([{ a: t(0, 9), b: t(0, 17) }], { rules: "minnesota" }).flags.length, 1);
  assert.deepEqual(payWeek([{ a: t(0, 9), b: t(0, 13) }, { a: t(0, 13, 15), b: t(0, 17) }], { rules: "minnesota" }).flags, []);
  // Tennessee: a break during the first hour does not count.
  assert.equal(payWeek([{ a: t(0, 9), b: t(0, 9, 30) }, { a: t(0, 10), b: t(0, 16) }], { rules: "tennessee" }).flags.length, 1);
  assert.deepEqual(payWeek([{ a: t(0, 9), b: t(0, 12) }, { a: t(0, 12, 30), b: t(0, 15, 30) }], { rules: "tn" }).flags, []);
});

test("kentucky: the seventh day at 1.5x when all seven are worked and the week passes 40", () => {
  // Six 7 h days and an 8 h Sunday: 50 h. Sunday's 8 at 1.5x, then 42 regular: 2 more. Federally 10 either way.
  const week = [0, 1, 2, 3, 4, 5].map((d) => ({ a: t(d, 9), b: t(d, 16) })).concat([{ a: t(6, 9), b: t(6, 17) }]);
  near(payWeek(week, { rules: "kentucky", wage: 10 }).overtimeH, 10, "8 + 2");
  // Six 6 h days and a 6 h Sunday: 42 h. Sunday's 6, then 36 regular: 6 in all, against 2 federally.
  const k = payWeek([0, 1, 2, 3, 4, 5, 6].map((d) => ({ a: t(d, 9), b: t(d, 15) })), { rules: "ky", wage: 10 });
  near(k.overtimeH, 6, "seventh day"); near(k.gross, 420 + 0.5 * 10 * 6, "gross 450"); assert.ok(k.notes.some((n) => /seven days/.test(n)));
  near(payWeek([0, 1, 2, 3, 4, 5, 6].map((d) => ({ a: t(d, 9), b: t(d, 15) })), { rules: "federal" }).overtimeH, 2, "federal");
  // Seven 5 h days: 35 h, not over 40, so no seventh-day overtime.
  near(payWeek([0, 1, 2, 3, 4, 5, 6].map((d) => ({ a: t(d, 9), b: t(d, 14) })), { rules: "kentucky" }).overtimeH, 0, "35 h");
  // The premium-pay notes from the DOL table ride along for the states that have one.
  assert.ok(payWeek([{ a: t(0, 9), b: t(0, 13) }], { rules: "minnesota" }).notes.some((n) => /48 h/.test(n)));
});

test("PAY_RULES names, codes and the Nevada settings; the hub page under Nevada rules", async () => {
  assert.equal(readPayEnv({ PAY_RULES: "WA" }).rules, "washington");
  assert.equal(readPayEnv({ PAY_RULES: "New Hampshire" }).rules, "new-hampshire");
  assert.equal(readPayEnv({ PAY_RULES: "west_virginia" }).rules, "west-virginia");
  assert.equal(readPayEnv({ PAY_RULES: "fed" }).notes.length, 0);
  const nv = readPayEnv({ PAY_RULES: "nv", MIN_WAGE: "10.5", NV_FOUR_TENS: "yes" });
  assert.equal(nv.rules, "nevada"); assert.equal(nv.minWage, 10.5); assert.equal(nv.fourTens, true);
  const bad = readPayEnv({ PAY_RULES: "nevada", MIN_WAGE: "twelve" });
  assert.equal(bad.minWage, 12); assert.match(bad.notes[0], /MIN_WAGE/);
  assert.equal(readPayEnv({ PAY_RULES: "texas" }).rules, "federal");
  // End to end: Ana works five 9 h days with no break at $15 in Nevada. Daily 1 h each = 5 h, gross 45 x 15 + 0.5 x 15 x 5.
  const s = {};
  for (let d = 16; d <= 20; d++) { punch(s, "Ana", "in", Date.parse(`2026-11-${d}T09:00:00Z`)); punch(s, "Ana", "out", Date.parse(`2026-11-${d}T18:00:00Z`)); }
  const state = emptyState();
  state.weekStart = "2026-11-16"; state.punches = s.punches; state.punchSeq = s.punchSeq;
  state.published = { ...structuredClone(WEEK), at: "2026-11-15T12:00:00.000Z", unfilled: 0, staffText: "name, wage, max hours\nAna, 15, 50", shiftsText: "" };
  const hub = handler(state, () => {}, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", PAY_RULES: "nevada" }, () => Date.parse("2026-11-21T12:00:00Z"), null);
  const page = await (await serve(hub, new Request("https://hub.example/admin/timesheet?key=adm"))).text();
  assert.match(page, /Pay estimate: Nevada/);
  assert.match(page, /\$712\.50/);
  assert.match(page, /8 continuous hours with no 30-min meal period/);
  assert.match(page, /MIN_WAGE \(now \$12\.00\)/);
  const csv = await (await serve(hub, new Request("https://hub.example/admin/timesheet.csv?key=adm&week=2026-11-16"))).text();
  assert.match(csv, /Ana,nevada,40\.00,5\.00,0\.00,0,15\.00,712\.50,/);
});

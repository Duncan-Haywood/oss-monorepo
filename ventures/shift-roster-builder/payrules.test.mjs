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

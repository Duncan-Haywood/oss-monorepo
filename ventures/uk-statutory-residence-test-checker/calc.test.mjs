import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay, dayIso, parseStays, ukDays, taxYearBounds, taxYearOf, taxYearLabel, tieBand, TIE_TABLE, verdictForDays, makeContext, assess, summaryText, SAMPLE } from "./calc.mjs";

const base = (o = {}) => makeContext({ priorResident: "no", ...o });
const stays = (...pairs) => pairs.map(([a, b]) => ({ from: toDay(...a), to: toDay(...b) }));

test("tax years run 6 April to 5 April", () => {
  assert.equal(dayIso(taxYearBounds(2026).start), "2026-04-06");
  assert.equal(dayIso(taxYearBounds(2026).end), "2027-04-05");
  assert.equal(taxYearOf(toDay(2027, 4, 5)), 2026);
  assert.equal(taxYearOf(toDay(2027, 4, 6)), 2027);
  assert.equal(taxYearLabel(2026), "2026/27");
});

test("days are midnights: arrive the 10th, leave the 15th is 5 days; same-day transit is 0", () => {
  assert.equal(ukDays(stays([[2026, 5, 10], [2026, 5, 15]]), 2026), 5);
  assert.equal(ukDays(stays([[2026, 5, 10], [2026, 5, 10]]), 2026), 0);
});

test("overlapping stays are not double counted and stays are clipped to the tax year", () => {
  assert.equal(ukDays(stays([[2026, 5, 1], [2026, 5, 11]], [[2026, 5, 6], [2026, 5, 16]]), 2026), 15);
  // 1 Apr to 10 Apr 2026: only midnights from 6 April count (6,7,8,9)
  assert.equal(ukDays(stays([[2026, 4, 1], [2026, 4, 10]]), 2026), 4);
  // the 5 April midnight belongs to the previous year
  assert.equal(ukDays(stays([[2026, 4, 1], [2026, 4, 10]]), 2025), 5);
});

test("the stay parser reports bad lines and ignores comments", () => {
  const ok = parseStays("2026-05-01 2026-05-10 # trip\n\n2026-06-01, 2026-06-03");
  assert.equal(ok.stays.length, 2);
  assert.equal(ok.errors.length, 0);
  const bad = parseStays("2026-05-10 2026-05-01\nhello\n2026-02-30 2026-03-02");
  assert.equal(bad.errors.length, 3);
});

test("the ties table matches HMRC's published thresholds", () => {
  const needed = (kind, d) => tieBand(kind, d).needed;
  assert.deepEqual([16, 45, 46, 90, 91, 120, 121, 182, 183].map((d) => needed("leaver", d)), [4, 4, 3, 3, 2, 2, 1, 1, 0]);
  assert.deepEqual([46, 90, 91, 120, 121, 182, 183].map((d) => needed("arriver", d)), [4, 4, 3, 3, 2, 2, 0]);
  assert.equal(needed("leaver", 15), null);
  assert.equal(needed("arriver", 45), null);
  // bands are contiguous
  for (const kind of Object.keys(TIE_TABLE)) TIE_TABLE[kind].slice(1).forEach((b, i) => assert.equal(b.min, TIE_TABLE[kind][i].max + 1));
});

test("automatic overseas tests: leaver under 16, arriver under 46", () => {
  const leaver = base({ priorResident: "yes", family: "yes", accommodation: "yes", ukWorkDays: 50, prev1: 100, mostElsewhere: 0 });
  assert.equal(verdictForDays(15, leaver).resident, false);
  assert.equal(verdictForDays(15, leaver).basis, "automatic-overseas");
  assert.equal(verdictForDays(16, leaver).resident, true); // 5 ties at 16 days
  const arriver = base({ family: "yes", accommodation: "yes", ukWorkDays: 50, prev1: 100 });
  assert.equal(verdictForDays(45, arriver).resident, false);
  assert.equal(verdictForDays(46, arriver).resident, true); // all four ties
});

test("an arriver needs all four ties at 46-90 days", () => {
  const three = base({ family: "yes", accommodation: "yes", ukWorkDays: 50 });
  assert.equal(verdictForDays(60, three).resident, false);
  assert.equal(verdictForDays(60, { ...three, prev1: 90 }).resident, true);
  assert.equal(verdictForDays(100, three).resident, true); // 3 ties at 91-120
});

test("the country tie only counts for leavers and needs strictly more UK days than any other country", () => {
  const ctx = base({ priorResident: "yes", mostElsewhere: 100 });
  assert.equal(verdictForDays(100, ctx).ties.list.find((t) => t.id === "country").present, false);
  assert.equal(verdictForDays(101, ctx).ties.list.find((t) => t.id === "country").present, true);
  assert.equal(verdictForDays(60, base({ mostElsewhere: 0 })).ties.list.some((t) => t.id === "country"), false);
});

test("automatic UK tests: 183 days, the home test, full-time UK work", () => {
  assert.equal(verdictForDays(183, base()).basis, "automatic-uk");
  assert.equal(verdictForDays(182, base()).resident, false);
  const home = base({ priorResident: "yes", ukHome: "yes", ukHomeDays: 30, overseasHome: "no" });
  assert.equal(verdictForDays(40, home).basis, "automatic-uk");
  assert.notEqual(verdictForDays(40, { ...home, ukHomeDays: 29 }).basis, "automatic-uk");
  // an overseas home used 30+ days switches the home test off
  assert.notEqual(verdictForDays(40, { ...home, overseasHome: true, overseasHomeDays: 30 }).basis, "automatic-uk");
  assert.equal(verdictForDays(40, { ...home, overseasHome: true, overseasHomeDays: 29 }).basis, "automatic-uk");
  assert.equal(verdictForDays(40, base({ priorResident: "yes", ukFullTimeWork: "yes" })).resident, true);
});

test("automatic overseas test 3 needs full-time work abroad, under 91 UK days and under 31 UK working days", () => {
  const ctx = base({ priorResident: "yes", fullTimeAbroad: "yes", ukWorkDays: 30, family: "yes", accommodation: "yes", prev1: 100 });
  assert.equal(verdictForDays(90, ctx).resident, false);
  assert.equal(verdictForDays(91, ctx).resident, true);
  assert.equal(verdictForDays(90, { ...ctx, ukWorkDays: 31 }).resident, true);
});

test("overseas tests win over UK tests when both would fire", () => {
  const ctx = base({ priorResident: "yes", ukFullTimeWork: "yes" });
  assert.equal(verdictForDays(10, ctx).resident, false);
});

test("assess finds the headroom and the reduction that flip the answer", () => {
  const r = assess({ ...SAMPLE });
  assert.equal(r.counted, 101);
  assert.equal(r.verdict.resident, true);
  // leaver, 2 ties (family, accommodation): resident at 91+ ... 2 ties needed at 91-120, 3 needed at 46-90
  assert.equal(r.reduceTo, 90);
  assert.equal(r.reduceBy, 11);
  const fewer = assess({ ...SAMPLE, stays: "2026-05-01 2026-06-15" });
  assert.equal(fewer.days, 45);
  assert.equal(fewer.verdict.resident, false);
  assert.equal(fewer.headroom, 0 + (fewer.firstResident - 1 - 45));
  assert.equal(verdictForDays(fewer.firstResident, fewer.ctx).resident, true);
  assert.equal(verdictForDays(fewer.firstResident - 1, fewer.ctx).resident, false);
});

test("assess matches an independent day-by-day recount", () => {
  const r = assess({ ...SAMPLE });
  const set = new Set();
  for (const s of r.stays) for (let d = s.from; d < s.to; d += 1) if (d >= toDay(2026, 4, 6) && d <= toDay(2027, 4, 5)) set.add(d);
  assert.equal(set.size, r.counted);
});

test("earlier-year days default to the stays but typed values win", () => {
  const input = { ...SAMPLE, stays: "2025-05-01 2025-09-01\n2026-05-01 2026-05-11", prev1: "", prev2: "" };
  assert.equal(assess(input).ctx.prev1, 123);
  assert.equal(assess({ ...input, prev1: "5" }).ctx.prev1, 5);
});

test("exceptional-circumstances days are capped at 60", () => {
  const r = assess({ ...SAMPLE, exceptional: "80" });
  assert.equal(r.exceptional, 60);
  assert.equal(r.days, 41);
  assert.ok(r.notices.some((n) => /capped at 60/.test(n)));
});

test("bad input returns errors, not a verdict", () => {
  assert.ok(assess({ ...SAMPLE, taxYear: "abc" }).errors.length);
  assert.ok(assess({ ...SAMPLE, stays: "nonsense" }).errors.length);
});

test("the summary names the test that decided, the disclaimer and HMRC's guidance", () => {
  const t = summaryText(assess({ ...SAMPLE }));
  assert.match(t, /sufficient ties test/);
  assert.match(t, /not tax advice/);
  assert.match(t, /RDR3/);
});

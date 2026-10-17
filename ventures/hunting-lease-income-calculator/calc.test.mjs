import { test } from "node:test";
import assert from "node:assert/strict";
import { netIncome, breakEvenPerAcre, compare, fillSensitivity, sampleInputs, money, money2, toCsv, validate } from "./calc.mjs";

const base = sampleInputs();

test("club lease nets acres x rate less all costs", () => {
  const r = netIncome("club", base);
  assert.equal(r.gross, 2400);
  assert.equal(r.costs, 1170);
  assert.equal(r.net, 1230);
  assert.equal(r.netPerAcre, 6.15);
});

test("per-hunter income scales with fill rate and day hunts with days sold", () => {
  assert.equal(netIncome("perHunter", base).gross, 2880);
  assert.equal(netIncome("perHunter", { ...base, fillPct: 50 }).gross, 1800);
  assert.equal(netIncome("dayHunt", base).gross, 2100);
});

test("platform fee comes off the gross and tax savings add back", () => {
  const r = netIncome("club", { ...base, platformFeePct: 10, taxSavings: 100 });
  assert.equal(r.costs, 1170 + 240);
  assert.equal(r.net, 2400 + 100 - 1410);
});

test("break-even price covers costs exactly", () => {
  const be = breakEvenPerAcre(base);
  assert.equal(be, 5.85);
  assert.ok(Math.abs(netIncome("club", { ...base, ratePerAcre: be }).net) <= 1);
  assert.equal(breakEvenPerAcre({ ...base, platformFeePct: 100 }), null);
  assert.equal(breakEvenPerAcre({ ...base, acres: 0 }), null);
});

test("compare picks the best arrangement, flags crowding and missing insurance", () => {
  const c = compare(base);
  assert.equal(c.best, "perHunter");
  assert.equal(c.clubVsHunters, 1230 - (2880 - 1170));
  const crowded = compare({ ...base, acres: 100, hunters: 5, insuranceCost: 0 });
  assert.match(crowded.advice.join(" "), /acres per hunter is crowded/);
  assert.match(crowded.advice.join(" "), /Insurance cost is \$0/);
});

test("losing arrangements are called out and nothing profitable says so", () => {
  const c = compare({ ...base, ratePerAcre: 1, perHunterFee: 10, dayRate: 1, insuranceCost: 5000 });
  assert.match(c.advice.join(" "), /No arrangement covers its costs/);
});

test("fill sensitivity is monotone", () => {
  const s = fillSensitivity(base);
  assert.ok(s[0].net < s[1].net && s[1].net < s[2].net);
});

test("validation and formatting", () => {
  assert.match(validate({ ...base, acres: 0 }), /acres/);
  assert.match(compare({ ...base, insuranceCost: -1 }).error, /insuranceCost/);
  assert.match(compare({ ...base, platformFeePct: 100 }).error, /Platform/);
  assert.throws(() => netIncome("nope", base), /unknown model/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5.85), "$5.85");
  assert.match(toCsv(compare(base)), /Individual seasonal leases/);
});

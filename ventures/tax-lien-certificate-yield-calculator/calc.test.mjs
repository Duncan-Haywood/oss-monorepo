import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULTS, interestPct, redeemedAt, unredeemed, num } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const base = { ...DEFAULTS, subsequentTaxes: 0, purchaseFee: 0, redemptionFee: 0, premium: 0 };

// Hand-worked: $4,000 face at 16% a year, redeemed at month 6 -> 8% of 4,000 = $320.
test("simple annual rate accrues pro rata by month", () => {
  close(interestPct({ mode: "simple", rate: 16 }, 6), 8);
  close(redeemedAt(base, 6).faceInterest, 320);
  close(redeemedAt(base, 6).net, 320);
  close(redeemedAt(base, 6).annualSimple, 0.16);
});
test("monthly and penalty rules charge every started period", () => {
  close(interestPct({ mode: "monthly", rate: 2 }, 3.2), 8); // 4 started months
  close(interestPct({ mode: "penalty", rate: 3, periodMonths: 6 }, 7), 6); // 2 started periods
  close(interestPct({ mode: "penalty", rate: 3, periodMonths: 6 }, 6), 3);
});
test("cap and floor apply to the face interest", () => {
  close(interestPct({ mode: "simple", rate: 18, capPct: 10 }, 12), 10);
  close(interestPct({ mode: "simple", rate: 18, minPct: 5 }, 2), 5);
  close(interestPct({ mode: "simple", rate: 18, minPct: 5 }, 2, false), 3);
});
test("fees, subsequent taxes and an unrefunded premium change the net", () => {
  const o = { ...DEFAULTS, face: 1000, premium: 200, rate: 12, purchaseFee: 40, redemptionFee: 10,
    subsequentTaxes: 500, subsequentMonth: 6, premiumRefunded: "yes" };
  const r = redeemedAt(o, 12);
  close(r.invested, 1000 + 200 + 40 + 500);
  close(r.faceInterest, 120); // 12% for 12 months
  close(r.subInterest, 30); // 500 x 12% x 6/12
  close(r.net, 120 + 30 - 40 - 10);
  const lost = redeemedAt({ ...o, premiumRefunded: "no" }, 12);
  close(lost.net, r.net - 200);
});
test("subsequent taxes paid after redemption are not counted", () => {
  const r = redeemedAt({ ...base, subsequentTaxes: 1000, subsequentMonth: 20 }, 12);
  assert.equal(r.subPaid, 0);
});
test("unredeemed: break-even property value and net", () => {
  const o = { ...base, subsequentTaxes: 1000, purchaseFee: 100, foreclosureCosts: 3000, propertyValue: 20000 };
  const f = unredeemed(o);
  close(f.invested, 4000 + 1000 + 100);
  close(f.breakEvenValue, 5100 + 3000);
  close(f.net, 20000 - 3000 - 5100);
});
test("analyze weights redeem and no-redeem by the chance typed", () => {
  const a = analyze({ ...DEFAULTS, redeemChance: 100 });
  close(a.expectedNet, a.chosen.net);
  const b = analyze({ ...DEFAULTS, redeemChance: 0 });
  close(b.expectedNet, b.fail.net);
  assert.ok(a.table.some((r) => r.months === 14));
});
test("garbage input falls back instead of producing NaN dollars", () => {
  const a = analyze({ ...DEFAULTS, face: "abc", rate: "", redeemMonth: "x" });
  assert.ok(Number.isFinite(a.chosen.net));
  assert.equal(num("$1,200"), 1200);
});

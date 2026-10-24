import test from "node:test";
import assert from "node:assert/strict";
import { comparePlatforms, FIVERR_FEE_PERCENT } from "./calc.mjs";

test("Fiverr's fee defaults to the current 20% flat commission", () => {
  const result = comparePlatforms({ jobPrice: 100 });
  assert.equal(FIVERR_FEE_PERCENT, 20);
  assert.equal(result.fiverr.platformFee, 20);
  assert.equal(result.fiverr.afterPlatformFee, 80);
});

test("Fiverr's commission applies with no tiers at any price", () => {
  const small = comparePlatforms({ jobPrice: 10 });
  const large = comparePlatforms({ jobPrice: 10000 });
  assert.equal(small.fiverr.effectiveTakeHomePercent, 80);
  assert.equal(large.fiverr.effectiveTakeHomePercent, 80);
});

test("Upwork's fee is the caller's own quoted percentage, not computed", () => {
  const result = comparePlatforms({ jobPrice: 100, upworkFeePercent: 5 });
  assert.equal(result.upwork.platformFee, 5);
  assert.equal(result.upwork.afterPlatformFee, 95);
});

test("Upwork's fee defaults to a documented illustrative 10%, not 0", () => {
  const result = comparePlatforms({ jobPrice: 100 });
  assert.equal(result.upworkFeePercent, 10);
});

test("a flat withdrawal fee comes out after the platform cut", () => {
  const result = comparePlatforms({ jobPrice: 100, upworkFeePercent: 10, upworkWithdrawalFee: 2 });
  assert.equal(result.upwork.afterPlatformFee, 90);
  assert.equal(result.upwork.afterWithdrawal, 88);
});

test("a withdrawal fee larger than the after-fee proceeds floors at zero, not negative", () => {
  const result = comparePlatforms({ jobPrice: 10, upworkFeePercent: 15, upworkWithdrawalFee: 50 });
  assert.equal(result.upwork.afterWithdrawal, 0);
  assert.equal(result.upwork.takeHome, 0);
});

test("a losing or break-even job reserves no tax", () => {
  const result = comparePlatforms({ jobPrice: 10, upworkFeePercent: 15, upworkWithdrawalFee: 50, taxReservePercent: 25 });
  assert.equal(result.upwork.taxReserve, 0);
});

test("the tax reserve comes out of proceeds after both the platform fee and the withdrawal fee", () => {
  const result = comparePlatforms({
    jobPrice: 1000,
    upworkFeePercent: 10,
    upworkWithdrawalFee: 0,
    taxReservePercent: 25,
  });
  // 1000 - 10% = 900 after platform fee; 25% of 900 = 225 reserved.
  assert.equal(result.upwork.afterPlatformFee, 900);
  assert.equal(result.upwork.taxReserve, 225);
  assert.equal(result.upwork.takeHome, 675);
});

test("comparison names whichever platform actually nets more for the same job price", () => {
  const upworkWins = comparePlatforms({ jobPrice: 1000, upworkFeePercent: 5 });
  assert.equal(upworkWins.comparison.betterPlatform, "upwork");
  assert.ok(upworkWins.comparison.gap > 0);

  const fiverrWins = comparePlatforms({ jobPrice: 1000, upworkFeePercent: 15, upworkWithdrawalFee: 60 });
  assert.equal(fiverrWins.comparison.betterPlatform, "fiverr");
  assert.ok(fiverrWins.comparison.gap < 0);
});

test("an equal net payout reports neither platform as better", () => {
  // Same fee, same withdrawal fee, same reserve on both sides -> a tie.
  const result = comparePlatforms({ jobPrice: 500, upworkFeePercent: 20, fiverrFeePercent: 20 });
  assert.equal(result.comparison.gap, 0);
  assert.equal(result.comparison.betterPlatform, null);
});

test("target take-home solves the price that would net it back, on the chosen platform", () => {
  const result = comparePlatforms({
    jobPrice: 0,
    upworkFeePercent: 10,
    targetPlatform: "upwork",
    targetTakeHome: 900,
  });
  assert.ok(Math.abs(result.target.priceNeeded - 1000) < 1e-9);
  // Feeding the solved price back in reproduces the target.
  const check = comparePlatforms({ jobPrice: result.target.priceNeeded, upworkFeePercent: 10 });
  assert.ok(Math.abs(check.upwork.takeHome - 900) < 1e-6);
});

test("target take-home accounts for a withdrawal fee and a tax reserve when solving", () => {
  const result = comparePlatforms({
    jobPrice: 0,
    fiverrFeePercent: 20,
    fiverrWithdrawalFee: 2,
    taxReservePercent: 25,
    targetPlatform: "fiverr",
    targetTakeHome: 300,
  });
  const check = comparePlatforms({
    jobPrice: result.target.priceNeeded,
    fiverrFeePercent: 20,
    fiverrWithdrawalFee: 2,
    taxReservePercent: 25,
  });
  assert.ok(Math.abs(check.fiverr.takeHome - 300) < 1e-6);
});

test("target defaults to solving for Upwork unless Fiverr is named", () => {
  const result = comparePlatforms({ jobPrice: 0, targetTakeHome: 100 });
  assert.equal(result.target.targetPlatform, "upwork");
});

test("omitting target take-home leaves target null", () => {
  const result = comparePlatforms({ jobPrice: 100 });
  assert.equal(result.target, null);
});

test("rejects a non-numeric job price", () => {
  assert.throws(() => comparePlatforms({ jobPrice: "not a number" }), /Job price must be a number/);
});

test("rejects a negative job price", () => {
  assert.throws(() => comparePlatforms({ jobPrice: -5 }), /Job price must be at least 0/);
});

test("rejects an Upwork fee over 100%", () => {
  assert.throws(() => comparePlatforms({ jobPrice: 100, upworkFeePercent: 150 }), /Upwork service fee must be at most 100/);
});

test("rejects a tax reserve of 100% or more", () => {
  assert.throws(() => comparePlatforms({ jobPrice: 100, taxReservePercent: 100 }), /Tax reserve must be at most 99\.9/);
});

test("a zero job price nets zero on both platforms without dividing by zero", () => {
  const result = comparePlatforms({ jobPrice: 0 });
  assert.equal(result.upwork.takeHome, 0);
  assert.equal(result.fiverr.takeHome, 0);
  assert.equal(result.upwork.effectiveTakeHomePercent, null);
  assert.equal(result.fiverr.effectiveTakeHomePercent, null);
});

test("break-even Upwork fee equals Fiverr's rate when withdrawal fees match", () => {
  const result = comparePlatforms({ jobPrice: 500, taxReservePercent: 25 });
  assert.equal(result.comparison.breakEvenUpworkFeePercent, 20);
});

test("break-even Upwork fee is the quote at which the two take-homes tie", () => {
  const base = { jobPrice: 400, upworkWithdrawalFee: 5, fiverrWithdrawalFee: 1, taxReservePercent: 20 };
  const { comparison } = comparePlatforms(base);
  // 20% + (1 - 5) / 400 = 19%
  assert.ok(Math.abs(comparison.breakEvenUpworkFeePercent - 19) < 1e-9);
  const tied = comparePlatforms({ ...base, upworkFeePercent: comparison.breakEvenUpworkFeePercent });
  assert.ok(Math.abs(tied.comparison.gap) < 1e-9);
});

test("break-even Upwork fee is null at a zero price or when no fee can tie", () => {
  assert.equal(comparePlatforms({ jobPrice: 0 }).comparison.breakEvenUpworkFeePercent, null);
  assert.equal(
    comparePlatforms({ jobPrice: 10, upworkWithdrawalFee: 50 }).comparison.breakEvenUpworkFeePercent,
    null,
  );
});

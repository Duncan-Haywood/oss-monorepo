// Upwork vs. Fiverr net-payout arithmetic. No network, no state.
//
// Both platforms quote the client the same job price and then take a cut
// before the freelancer ever sees it, but the two cuts are built differently
// and neither platform puts them side by side:
//
// - Fiverr charges every seller a flat 20% commission on every order, no
//   tiers, no volume discount, applied to tips too. That figure is public and
//   has not changed in years, so it is a constant here, not an input.
// - Upwork does NOT publish a fixed formula any more. Since May 1 2025 it
//   replaced its old 20%/10%/5% lifetime-billing tiers with a variable
//   freelancer service fee between 0% and 15% per contract, set by Upwork's
//   own pricing system per client relationship and shown to the freelancer
//   only at proposal time. There is no public rule this file could encode
//   without guessing, so the Upwork fee is always the freelancer's own
//   quoted percentage, typed in rather than computed.
//
// What this page adds beyond either platform's own dashboard is the
// side-by-side: the same job price run through both cuts, plus an optional
// withdrawal fee and self-employment tax reserve, so a freelancer deciding
// where to post a job -- or pricing one already posted -- sees what actually
// lands in the bank from each, not just the headline percentage.

function number(value, name, { min = 0, max = null, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function optionalNumber(value, name, opts) {
  if (value === null || value === undefined || value === "") return null;
  return number(value, name, opts);
}

/** Fiverr's mandatory seller commission. Flat, no tiers, applies to tips too. */
export const FIVERR_FEE_PERCENT = 20;

/**
 * Net a job price down through one platform's cut, an optional flat
 * withdrawal fee, and an optional tax reserve.
 */
function payout({ price, feePercent, withdrawalFee, taxReservePercent }) {
  const platformFee = price * (feePercent / 100);
  const afterPlatformFee = price - platformFee;
  const afterWithdrawal = Math.max(0, afterPlatformFee - withdrawalFee);
  // A losing or break-even job reserves nothing -- there is no profit to
  // reserve a share of, and a negative reserve would read as a refund this
  // page is in no position to promise.
  const taxReserve = afterWithdrawal * (taxReservePercent / 100);
  const takeHome = afterWithdrawal - taxReserve;
  const effectiveTakeHomePercent = price === 0 ? null : (takeHome / price) * 100;
  return { platformFee, afterPlatformFee, afterWithdrawal, taxReserve, takeHome, effectiveTakeHomePercent };
}

/**
 * Solve backwards: what job price, on this platform, nets a target take-home
 * after the platform fee, the withdrawal fee, and the tax reserve.
 */
function priceForTarget({ targetTakeHome, feePercent, withdrawalFee, taxReservePercent }) {
  const neededAfterWithdrawal = targetTakeHome / (1 - taxReservePercent / 100);
  const neededAfterPlatformFee = neededAfterWithdrawal + withdrawalFee;
  const neededPrice = neededAfterPlatformFee / (1 - feePercent / 100);
  return Math.max(0, neededPrice);
}

/**
 * @param {object} input
 * @param {number} input.jobPrice            What the client pays for the job or gig, before either platform's cut.
 * @param {number} input.upworkFeePercent     Upwork's own quoted freelancer service fee for this contract (0-15) -- see module comment on why this cannot be computed from a formula.
 * @param {number} input.fiverrFeePercent     Fiverr's seller commission. Defaults to the current 20% if omitted; exposed as an input only so the page still works the day Fiverr changes it.
 * @param {number} input.upworkWithdrawalFee  Flat $ cost of this withdrawal method on Upwork (many are free; wire transfers and some cards are not).
 * @param {number} input.fiverrWithdrawalFee  Flat $ cost of this withdrawal method on Fiverr.
 * @param {number} input.taxReservePercent    Share of after-fee proceeds set aside for self-employment and income tax. Their number, not ours.
 * @param {"upwork"|"fiverr"} input.targetPlatform  Which platform's price-needed figure to solve for.
 * @param {number|null} input.targetTakeHome  Optional: solve for the job price needed on `targetPlatform` to net this much take-home.
 */
export function comparePlatforms(input) {
  const jobPrice = number(input.jobPrice ?? 0, "Job price");
  const upworkFeePercent = number(input.upworkFeePercent ?? 10, "Upwork service fee", { max: 100 });
  const fiverrFeePercent = number(input.fiverrFeePercent ?? FIVERR_FEE_PERCENT, "Fiverr service fee", { max: 100 });
  const upworkWithdrawalFee = number(input.upworkWithdrawalFee ?? 0, "Upwork withdrawal fee");
  const fiverrWithdrawalFee = number(input.fiverrWithdrawalFee ?? 0, "Fiverr withdrawal fee");
  const taxReservePercent = number(input.taxReservePercent ?? 0, "Tax reserve", { max: 99.9 });
  const targetTakeHome = optionalNumber(input.targetTakeHome, "Target take-home");
  const targetPlatform = input.targetPlatform === "fiverr" ? "fiverr" : "upwork";

  const upwork = payout({
    price: jobPrice,
    feePercent: upworkFeePercent,
    withdrawalFee: upworkWithdrawalFee,
    taxReservePercent,
  });
  const fiverr = payout({
    price: jobPrice,
    feePercent: fiverrFeePercent,
    withdrawalFee: fiverrWithdrawalFee,
    taxReservePercent,
  });

  const gap = upwork.takeHome - fiverr.takeHome;
  const comparison = {
    // Positive: Upwork nets more for this job price. Negative: Fiverr does.
    gap,
    betterPlatform: gap === 0 ? null : gap > 0 ? "upwork" : "fiverr",
  };

  let target = null;
  if (targetTakeHome !== null) {
    const feePercent = targetPlatform === "fiverr" ? fiverrFeePercent : upworkFeePercent;
    const withdrawalFee = targetPlatform === "fiverr" ? fiverrWithdrawalFee : upworkWithdrawalFee;
    target = {
      targetPlatform,
      targetTakeHome,
      priceNeeded: priceForTarget({ targetTakeHome, feePercent, withdrawalFee, taxReservePercent }),
    };
  }

  return {
    jobPrice,
    upworkFeePercent,
    fiverrFeePercent,
    taxReservePercent,
    upwork,
    fiverr,
    comparison,
    target,
  };
}

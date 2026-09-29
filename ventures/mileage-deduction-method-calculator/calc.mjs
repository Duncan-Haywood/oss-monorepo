// Core arithmetic for choosing between the IRS standard mileage rate and the
// actual-expense method for a business vehicle in 2026. No network calls: this
// applies published IRS rates to the numbers the user supplies. It is NOT tax
// advice -- see README "What this does not cover".
//
// Verified 2026-09-29 via WebSearch and WebFetch against IRS.gov's own
// "Standard mileage rates" page, IRS Topic no. 510 (Business use of car),
// IRS Publication 463, Littler's summary of Announcement 2026-11, and the
// Journal of Accountancy's report of it, cross-checked against each other:
//
//   - Jan 1 - Jun 30, 2026 business rate: 72.5 cents/mile (Notice 2026-10).
//   - Jul 1 - Dec 31, 2026 business rate: 76 cents/mile (Announcement
//     2026-11, issued July 13, 2026; first mid-year change since 2022).
//     Miles driven before July 1 stay at 72.5 cents. A calculator that
//     multiplies a whole year of miles by one rate is wrong for 2026.
//   - Parking fees and tolls for business trips are deductible IN ADDITION
//     to the standard rate, and are also deductible under actual expenses.
//   - The standard rate must be elected in the first year an owned car is
//     available for business use. If you start with actual expenses on a
//     car you cannot later use the standard rate for it. You may go from
//     standard to actual in a later year.
//   - The standard rate is not available if you operate five or more cars
//     at once, or have claimed MACRS or Section 179 depreciation on the car.
//   - Actual expenses are deducted in proportion to business use of the
//     car (business miles / total miles).
//
// Simplification: the tax-savings estimate multiplies the deduction by the
// user's marginal income tax rate plus, optionally, the self-employment tax
// rate on 92.35% of the deduction (15.3% x 0.9235). It ignores the Social
// Security wage base cap and the deduction for half of SE tax, and says so.

export const RATES_2026 = {
  businessFirstHalf: 0.725,
  businessSecondHalf: 0.76,
};

export const SE_TAX_EFFECTIVE_RATE = 0.153 * 0.9235;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function standardDeduction(milesFirstHalf, milesSecondHalf) {
  return num(milesFirstHalf) * RATES_2026.businessFirstHalf + num(milesSecondHalf) * RATES_2026.businessSecondHalf;
}

export function mileageMethodOutcome({
  milesFirstHalf = 0,
  milesSecondHalf = 0,
  totalMiles = 0,
  fuel = 0,
  insurance = 0,
  repairs = 0,
  registration = 0,
  depreciationOrLease = 0,
  otherActual = 0,
  parkingTolls = 0,
  incomeTaxRatePct = 0,
  seTaxApplies = true,
  standardBlocked = false,
} = {}) {
  const h1 = num(milesFirstHalf);
  const h2 = num(milesSecondHalf);
  const businessMiles = h1 + h2;
  const total = num(totalMiles);
  const parking = num(parkingTolls);

  const standard = standardDeduction(h1, h2);
  const standardTotal = standard + parking;

  const actualCostsAll = num(fuel) + num(insurance) + num(repairs) + num(registration) + num(depreciationOrLease) + num(otherActual);
  const businessUse = total > 0 ? Math.min(1, businessMiles / total) : 0;
  const actual = actualCostsAll * businessUse;
  const actualTotal = actual + parking;

  const taxRate = Math.min(100, num(incomeTaxRatePct)) / 100 + (seTaxApplies ? SE_TAX_EFFECTIVE_RATE : 0);

  let best = "actual";
  if (!standardBlocked && standardTotal >= actualTotal) best = "standard";
  const bestTotal = best === "standard" ? standardTotal : actualTotal;
  const gap = Math.abs(standardTotal - actualTotal);
  const breakEvenActualCostPerBusinessMile = businessMiles > 0 ? standard / businessMiles : 0;
  const effectiveActualPerBusinessMile = businessMiles > 0 && total > 0 ? actual / businessMiles : 0;
  const flatFirstHalfRate = businessMiles * RATES_2026.businessFirstHalf;
  const midYearGain = standard - flatFirstHalfRate;

  const findings = [];

  if (businessMiles <= 0) {
    findings.push({ severity: "high", title: "No business miles entered", detail: "Enter the business miles you drove in each half of 2026. Commuting between home and a regular workplace is not business mileage." });
  }
  if (total > 0 && businessMiles > total) {
    findings.push({ severity: "high", title: "Business miles exceed total miles", detail: "Business use is capped at 100% of the car's total miles for the actual-expense method, so the business-use share was limited to 100%. Check both mileage figures." });
  }
  if (standardBlocked) {
    findings.push({ severity: "high", title: "The standard mileage rate is not available to you", detail: "You said you operate five or more cars at once, or have already used actual expenses, MACRS or Section 179 depreciation on this car. In that case the actual-expense method is the only one of the two you can use for it; the standard-rate figure is shown for reference only." });
  } else {
    findings.push({ severity: "medium", title: "Choosing actual expenses first can lock you out of the standard rate", detail: "For a car you own, the standard mileage rate must be chosen in the first year the car is available for business use. If you start with actual expenses on a car you cannot use the standard rate for that car later. Going from the standard rate to actual expenses in a later year is allowed." });
  }
  if (h2 > 0 && h1 >= 0) {
    findings.push({ severity: "info", title: "Two 2026 rates apply to your miles", detail: `Miles driven January 1 to June 30 are deducted at 72.5 cents and miles driven July 1 to December 31 at 76 cents (IRS Announcement 2026-11). Your ${h2.toLocaleString()} second-half miles add ${money(midYearGain)} compared with valuing every mile at the first-half rate.` });
  }
  if (parking > 0) {
    findings.push({ severity: "info", title: "Parking and tolls are added on top of either method", detail: `Business parking fees and tolls (${money(parking)}) are deductible in addition to the standard rate and are also deductible under actual expenses, so they are included in both totals and do not change which method wins.` });
  }
  if (best === "standard" && !standardBlocked && actualCostsAll > 0) {
    findings.push({ severity: "info", title: "The standard rate also builds in depreciation", detail: "Each standard-rate mile carries an IRS-set depreciation portion that reduces the car's tax basis, which matters if you later sell the car or switch to actual expenses (straight-line depreciation is required after a switch)." });
  }
  findings.push({ severity: "info", title: "Keep a mileage log", detail: "Either method needs adequate records: date, destination, business purpose and miles for each trip, plus receipts for actual expenses. Neither method deducts commuting miles." });
  findings.push({ severity: "info", title: "Self-employed vehicle expenses only", detail: "This is for a sole proprietor or single-member LLC deducting car costs on Schedule C. It does not model an employee's unreimbursed expenses, a leased car's inclusion amount, luxury-car depreciation caps, or Section 179 elections." });

  return {
    businessMiles, totalMiles: total, businessUse, standard, standardTotal, actualCostsAll, actual, actualTotal,
    parking, best, bestTotal, gap, taxRate, taxSavingsBest: bestTotal * taxRate, taxSavingsGap: gap * taxRate,
    breakEvenActualCostPerBusinessMile, effectiveActualPerBusinessMile, midYearGain, standardBlocked, findings,
  };
}

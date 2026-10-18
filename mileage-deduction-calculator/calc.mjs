// Core arithmetic for the 2026 business vehicle deduction for a self-employed
// filer (Schedule C, line 9 / Form 4562 Part V): standard mileage rate versus
// actual expenses. No network calls: this applies published IRS figures to
// the numbers the user supplies. It is NOT tax advice -- see the page's
// "What this does not cover".
//
// Verified 2026-09-29 via WebSearch and WebFetch against IRS.gov's own
// "Standard mileage rates" page and the IRS newsroom release for Notice
// 2026-10, cross-checked against the Journal of Accountancy's report on
// Announcement 2026-11 (the mid-year change):
//
//   - Business standard mileage rate: 72.5 cents/mile for miles driven
//     January 1 - June 30, 2026; 76 cents/mile for July 1 - December 31,
//     2026 (Announcement 2026-11 modified Notice 2026-10 for the second
//     half of the year only). A filer must split miles across the two
//     periods -- this is the gotcha most single-rate calculators miss.
//   - Medical / military-moving rate: 20.5 cents H1, 23.5 cents H2. Not
//     used here (a self-employed business deduction is the scope); listed
//     in the page's coverage note only.
//   - Charitable rate: 14 cents (statutory, IRC 170(i)). Same: out of scope.
//   - The standard rate cannot be used for a leased car unless it is used
//     for the whole lease term, when operating five or more vehicles at
//     once (fleet), when depreciation was claimed under MACRS or a Section
//     179 election was made on the vehicle, or when the standard method was
//     not chosen in the vehicle's first year of business use.
//   - Parking fees and tolls for business trips are deductible IN ADDITION
//     to the standard mileage rate (they are not part of the rate).
//
// The depreciation component embedded in the standard rate (which reduces
// the vehicle's tax basis) is deliberately not modelled: this run could not
// verify the 2026 figure against the Notice itself.

export const RATES_2026 = {
  businessH1: 0.725,
  businessH2: 0.76,
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const cents = (n) => Math.round(n * 100) / 100;

/** Standard-method deduction: miles x the rate for the period they were driven, plus parking and tolls. */
export function standardDeduction({ milesH1 = 0, milesH2 = 0, parkingTolls = 0 } = {}) {
  const mileage = cents(num(milesH1) * RATES_2026.businessH1 + num(milesH2) * RATES_2026.businessH2);
  const extras = cents(num(parkingTolls));
  return { mileage, parkingTolls: extras, total: cents(mileage + extras) };
}

/**
 * Actual-expense deduction: total vehicle running costs x business-use share
 * (business miles / total miles), plus parking and tolls. Depreciation or a
 * lease payment, if any, goes in the expense total.
 */
export function actualDeduction({ totalMiles = 0, businessMiles = 0, vehicleExpenses = 0, parkingTolls = 0 } = {}) {
  const total = num(totalMiles);
  const business = Math.min(num(businessMiles), total || num(businessMiles));
  const share = total > 0 ? Math.min(business / total, 1) : 0;
  const allocated = cents(num(vehicleExpenses) * share);
  const extras = cents(num(parkingTolls));
  return { businessShare: share, allocated, parkingTolls: extras, total: cents(allocated + extras) };
}

export function mileageDeductionOutcome(input = {}) {
  const milesH1 = num(input.milesH1);
  const milesH2 = num(input.milesH2);
  const businessMiles = milesH1 + milesH2;
  const totalMiles = num(input.totalMiles);
  const parkingTolls = num(input.parkingTolls);
  const vehicleExpenses = num(input.vehicleExpenses);

  const standard = standardDeduction({ milesH1, milesH2, parkingTolls });
  const actual = actualDeduction({ totalMiles, businessMiles, vehicleExpenses, parkingTolls });
  const haveActualInputs = totalMiles > 0 && vehicleExpenses > 0;
  const difference = cents(standard.total - actual.total);
  const better = !haveActualInputs ? "standard" : difference >= 0 ? "standard" : "actual";

  const findings = [];
  if (totalMiles > 0 && businessMiles > totalMiles) {
    findings.push({
      severity: "high",
      title: "Business miles exceed total miles",
      detail: "Your business miles are higher than the vehicle's total miles for the year. Check both numbers; the actual-expense share is capped at 100%.",
    });
  }
  if (milesH1 + milesH2 === 0) {
    findings.push({
      severity: "medium",
      title: "No business miles entered",
      detail: "Enter the business miles driven January 1 - June 30 and July 1 - December 31. The rate changed on July 1, so they are priced separately.",
    });
  }
  findings.push({
    severity: "high",
    title: "The two methods are not always both open to you",
    detail: "The standard rate must be chosen in the first year the car is used for business, and it cannot be used if you already claimed MACRS depreciation or a Section 179 election on the vehicle, for a leased car unless it applies for the whole lease, or when you operate five or more vehicles at once. If any of that applies, only the actual-expense figure is available to you.",
  });
  findings.push({
    severity: "medium",
    title: "Commuting is not business mileage",
    detail: "Driving from home to a regular workplace is a personal commute. A trip between your home office (if it is your principal place of business) and a client or job site generally counts; confirm with the IRS's vehicle-expense guidance or a tax professional.",
  });
  findings.push({
    severity: "info",
    title: "Keep a contemporaneous log",
    detail: "Either method needs records: the date, destination, business purpose and miles of each trip, and for actual expenses the receipts and the year's total miles. An odometer reading at the start and end of the year covers total miles.",
  });
  if (haveActualInputs) {
    findings.push({
      severity: "info",
      title: better === "standard" ? "Standard mileage comes out ahead" : "Actual expenses come out ahead",
      detail: `On the numbers you entered the ${better} method is larger by ${money(Math.abs(difference))}. Switching methods later has limits, so compare over the life of the vehicle, not one year.`,
    });
  }

  return { milesH1, milesH2, businessMiles, totalMiles, standard, actual, haveActualInputs, difference, better, findings };
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

// Deterministic pricing arithmetic for independent dog walkers and pet
// sitters running their own recurring client book (not a marketplace app
// that sets the rate for them). Two distinct calculations:
//
//   calculate(input)            — price ONE visit (walk, drop-in, or
//                                  overnight) from labor time, drive time,
//                                  vehicle mileage, extra-pet surcharges,
//                                  overnight on-call time, allocated
//                                  overhead, a target margin, an optional
//                                  holiday/last-minute surcharge, and an
//                                  optional payment-processing gross-up.
//   computeRouteRevenue(clients) — roll a list of recurring clients (each
//                                  with a price and a visits-per-week
//                                  frequency) up into monthly route revenue.
//   incomeGap(...)               — compare that route revenue to a target
//                                  monthly income and say how many more
//                                  visits, at the same average price, close
//                                  the gap.

export const DEFAULTS = {
  visitMinutes: 30,
  driveMinutes: 10,
  mileage: 4,
  mileageRate: 0.67,
  targetHourlyRate: 24,
  petCount: 1,
  additionalPetFee: 6,
  specialNeedsFee: 0,
  overnightNights: 0,
  overnightActiveMinutes: 45,
  overnightOnCallHours: 2,
  holidaySurchargePct: 0,
  paymentProcessingFeePct: 0,
  monthlyOverhead: 45,
  expectedVisitsPerMonth: 60,
  targetMarginPct: 15,
};

function number(value, label, { min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  return parsed;
}

/**
 * Price a single visit.
 *
 * @param {object} input
 * @param {number} input.visitMinutes On-site active minutes for a walk or
 *   drop-in visit. Ignored when `overnightNights` is greater than zero.
 * @param {number} input.driveMinutes Round-trip drive minutes to reach and
 *   leave this client from the previous stop or home base. Charged once per
 *   visit (and once per overnight stay, not once per night).
 * @param {number} input.mileage Round-trip vehicle miles for the same trip.
 * @param {number} input.mileageRate Reimbursement rate per mile for fuel and
 *   vehicle wear (a standard mileage rate is a reasonable default).
 * @param {number} input.targetHourlyRate The hourly rate you want to earn
 *   for on-site time, drive time, and (for overnights) on-call time.
 * @param {number} input.petCount Number of pets at this household for this
 *   visit. Must be at least 1.
 * @param {number} input.additionalPetFee Flat fee per pet beyond the first
 *   at the same household and visit.
 * @param {number} input.specialNeedsFee Flat add-on for medication, senior,
 *   or puppy care that takes extra attention beyond ordinary walk time.
 * @param {number} input.overnightNights Number of nights for an overnight
 *   stay. Zero means this is a walk or drop-in visit, not an overnight.
 * @param {number} input.overnightActiveMinutes Active minutes per night for
 *   an overnight (arrival, evening/morning walks, departure) — not the same
 *   as being asleep in the home the rest of the night.
 * @param {number} input.overnightOnCallHours Hours per night billed at
 *   `targetHourlyRate` for being on call overnight even while not actively
 *   working — this is what makes an overnight rate higher than an
 *   equivalent number of daytime walks.
 * @param {number} input.holidaySurchargePct Percentage added on top of the
 *   margin for holiday or last-minute bookings. Zero for ordinary bookings.
 * @param {number} input.paymentProcessingFeePct Percentage taken by a
 *   payment app or card processor. The price is grossed up so the operator
 *   still nets the pre-fee total after the processor's cut. Must be below
 *   100.
 * @param {number} input.monthlyOverhead Monthly cost of insurance, bonding,
 *   a scheduling/payment app, and supplies (bags, leashes, treats).
 * @param {number} input.expectedVisitsPerMonth Visits you expect to run in a
 *   typical month, used only to allocate `monthlyOverhead` per visit.
 * @param {number} input.targetMarginPct Profit margin on top of true cost
 *   (labor + mileage + pet/special fees + allocated overhead). Must be
 *   below 100.
 */
export function calculate(input) {
  const isOvernight = number(input.overnightNights ?? 0, 'Overnight nights') > 0;
  const nights = isOvernight ? number(input.overnightNights, 'Overnight nights') : 0;

  const visitMinutes = number(input.visitMinutes, 'Visit minutes');
  const driveMinutes = number(input.driveMinutes, 'Drive minutes');
  const mileage = number(input.mileage, 'Mileage');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const petCount = number(input.petCount, 'Number of pets', { min: 1 });
  const additionalPetFee = number(input.additionalPetFee, 'Additional pet fee');
  const specialNeedsFee = number(input.specialNeedsFee, 'Special needs fee');
  const overnightActiveMinutes = number(input.overnightActiveMinutes, 'Overnight active minutes');
  const overnightOnCallHours = number(input.overnightOnCallHours, 'Overnight on-call hours');
  const holidaySurchargePct = number(input.holidaySurchargePct, 'Holiday/last-minute surcharge');
  const paymentProcessingFeePct = number(input.paymentProcessingFeePct, 'Payment processing fee');
  const monthlyOverhead = number(input.monthlyOverhead, 'Monthly overhead');
  const expectedVisitsPerMonth = number(input.expectedVisitsPerMonth, 'Expected visits per month');
  const targetMarginPct = number(input.targetMarginPct, 'Target margin');

  if (paymentProcessingFeePct >= 100) throw new Error('Payment processing fee must be below 100%.');
  if (targetMarginPct >= 100) throw new Error('Target margin must be below 100%.');

  const activeMinutes = isOvernight ? overnightActiveMinutes * nights : visitMinutes;
  const onCallMinutes = isOvernight ? overnightOnCallHours * 60 * nights : 0;
  // Drive time is charged once for the whole stop/stay, not once per night —
  // an overnight is one drop-off and one pick-up trip, not a nightly commute.
  const billableMinutes = activeMinutes + onCallMinutes + driveMinutes;
  const hoursBilled = billableMinutes / 60;

  const laborCost = hoursBilled * targetHourlyRate;
  const mileageCost = mileage * mileageRate;
  const extraPets = Math.max(0, petCount - 1);
  const petSurcharge = extraPets * additionalPetFee;
  const overheadPerVisit = expectedVisitsPerMonth > 0 ? monthlyOverhead / expectedVisitsPerMonth : 0;

  const baseCost = laborCost + mileageCost + petSurcharge + specialNeedsFee + overheadPerVisit;
  const marginAmount = baseCost * (targetMarginPct / 100);
  const preHoliday = baseCost + marginAmount;
  const holidayAmount = preHoliday * (holidaySurchargePct / 100);
  const preProcessing = preHoliday + holidayAmount;
  const finalPrice = preProcessing / (1 - paymentProcessingFeePct / 100);
  const processingFeeAmount = finalPrice - preProcessing;
  const effectiveHourlyRate = hoursBilled > 0 ? finalPrice / hoursBilled : null;

  return {
    isOvernight, nights, activeMinutes, onCallMinutes, driveMinutes, billableMinutes, hoursBilled,
    laborCost, mileageCost, extraPets, petSurcharge, specialNeedsFee, overheadPerVisit, baseCost,
    marginAmount, holidayAmount, processingFeeAmount, finalPrice, effectiveHourlyRate,
    targetMarginPct, holidaySurchargePct, paymentProcessingFeePct,
  };
}

/**
 * Roll a list of recurring clients up into monthly route revenue.
 * @param {{price: number, visitsPerWeek: number}[]} clients
 * @param {number} [weeksPerMonth] Average weeks per month; default is the
 *   calendar average (52 / 12), not a flat 4, so a monthly total is not
 *   quietly understated by about 8%.
 */
export function computeRouteRevenue(clients, weeksPerMonth = 52 / 12) {
  const weeks = number(weeksPerMonth, 'Weeks per month', { min: 0.1 });
  let totalVisitsPerMonth = 0;
  let monthlyRevenue = 0;
  for (const [i, client] of clients.entries()) {
    const price = number(client.price, `Client ${i + 1} price`);
    const visitsPerWeek = number(client.visitsPerWeek, `Client ${i + 1} visits per week`);
    const visitsPerMonth = visitsPerWeek * weeks;
    totalVisitsPerMonth += visitsPerMonth;
    monthlyRevenue += price * visitsPerMonth;
  }
  const averagePrice = totalVisitsPerMonth > 0 ? monthlyRevenue / totalVisitsPerMonth : 0;
  return { monthlyRevenue, totalVisitsPerMonth, averagePrice, clientCount: clients.length };
}

/**
 * Compare route revenue to a target monthly income and say how many more
 * visits, at the same average price, close the gap.
 */
export function incomeGap(targetMonthlyIncome, monthlyRevenue, averagePrice) {
  const target = number(targetMonthlyIncome, 'Target monthly income');
  const revenue = number(monthlyRevenue, 'Monthly revenue');
  const avg = number(averagePrice, 'Average price per visit');
  const gap = Math.max(0, target - revenue);
  const additionalVisitsNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalVisitsNeeded, meetsTarget: revenue >= target };
}

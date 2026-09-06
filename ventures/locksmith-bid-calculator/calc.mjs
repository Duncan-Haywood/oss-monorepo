// Deterministic pricing arithmetic for an independent or small-shop mobile
// locksmith pricing a single service call (a lockout, a rekey, a lock or
// cylinder install/replacement, key-fob or transponder programming, or a
// small commercial access-control job) -- not a security consultancy, not a
// safe-cracking specialist quoting forensic work, and not a franchise
// dispatch board.
//
// Two mechanics are specific to this trade and are the reason a generic
// service-call calculator undercharges it:
//
//   1. EMERGENCY / AFTER-HOURS PREMIUM. A locked-out customer at 2am is not
//      the same job as a scheduled rekey at 10am, even when the labor and
//      parts are identical -- the premium compensates for being available
//      outside normal hours, not for extra difficulty. Applied to billed
//      time only (not parts), because parts cost the same at any hour.
//   2. MINIMUM SERVICE CHARGE. Nearly every mobile trade with a short median
//      job (a five-minute car-door unlock, a single cut key) enforces a
//      floor so the trip itself is never a loss -- the calculated price is
//      compared against it and the higher of the two wins.
//
// Two exported functions, the same two-layer shape as this portfolio's other
// per-job trade calculators (`appliance-repair-quote-calculator`,
// `notary-trip-quote`):
//
//   calculateQuote(input) -- the price for ONE service call, from labor and
//                             travel time, the after-hours premium, parts
//                             cost and markup, a callback/warranty reserve,
//                             overhead, target margin, and the minimum
//                             service charge floor.
//   dailyIncomeGap(...)   -- compare a day's worth of calls at that average
//                             profit against a target daily income and say
//                             how many more calls close the gap.

export const DEFAULTS = {
  laborMinutes: 30,
  travelMinutes: 20,
  hourlyRate: 90,
  emergencyCall: false,
  emergencyPct: 50,
  tripFee: 35,
  partsCost: 40,
  partsMarkupPct: 40,
  callbackReservePct: 4,
  overheadRate: 15,
  targetMargin: 30,
  minimumServiceCharge: 89,
};

function number(value, label, { min = 0, max = null, exclusiveMax = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * Price for a single locksmith service call.
 *
 * @param {object} input
 * @param {number} input.laborMinutes Minutes actually working on-site
 *   (diagnosing the lock, rekeying, installing hardware, programming a fob).
 * @param {number} input.travelMinutes Round-trip drive minutes to and from
 *   the call.
 * @param {number} input.hourlyRate Target billing rate for labor and travel
 *   time, before any after-hours premium.
 * @param {boolean} input.emergencyCall Whether this is an after-hours or
 *   emergency dispatch (a lockout at night, a weekend call) rather than a
 *   scheduled appointment.
 * @param {number} input.emergencyPct Percentage premium applied to billed
 *   time (labor + travel) when `emergencyCall` is true. Never applied to
 *   parts -- a cylinder costs the same at 2am as at 2pm.
 * @param {number} input.tripFee Flat trip/service charge covering the
 *   vehicle, fuel, and dispatch overhead of showing up at all.
 * @param {number} input.partsCost Cost of hardware used on the job --
 *   cylinders, deadbolts, key blanks, fobs, or a full lockset.
 * @param {number} input.partsMarkupPct Markup applied to parts cost.
 * @param {number} input.callbackReservePct Percentage reserve, on top of
 *   labor, travel, trip fee, and parts, for warranty callbacks -- a rekey or
 *   install that needs a free return visit.
 * @param {number} input.overheadRate Percentage overhead on direct costs
 *   -- liability insurance, bonding, tools, licensing, and vehicle costs
 *   that apply whether or not this specific call happens.
 * @param {number} input.targetMargin Target profit margin on the final
 *   price.
 * @param {number} input.minimumServiceCharge The floor price for any call,
 *   regardless of how little labor and travel time it took -- the price
 *   compared against the calculated target, with the higher of the two used.
 */
export function calculateQuote(input) {
  const laborMinutes = number(input.laborMinutes, 'Labor minutes');
  const travelMinutes = number(input.travelMinutes, 'Travel minutes');
  const hourlyRate = number(input.hourlyRate, 'Hourly rate');
  const emergencyCall = Boolean(input.emergencyCall);
  const emergencyPct = number(input.emergencyPct, 'Emergency premium', { max: 500 });
  const tripFee = number(input.tripFee, 'Trip fee');
  const partsCost = number(input.partsCost, 'Parts cost');
  const partsMarkupPct = number(input.partsMarkupPct, 'Parts markup');
  const callbackReservePct = number(input.callbackReservePct, 'Callback reserve', { max: 100 });
  const overheadRate = number(input.overheadRate, 'Overhead rate', { max: 100 });
  const targetMargin = number(input.targetMargin, 'Target margin');
  const minimumServiceCharge = number(input.minimumServiceCharge, 'Minimum service charge');

  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%.');

  const laborHours = laborMinutes / 60;
  const travelHours = travelMinutes / 60;
  const billedHours = laborHours + travelHours;
  const timeCost = billedHours * hourlyRate;
  const emergencySurcharge = emergencyCall ? timeCost * (emergencyPct / 100) : 0;
  const billedTime = timeCost + emergencySurcharge;

  const parts = partsCost * (1 + partsMarkupPct / 100);
  const subtotal = billedTime + tripFee + parts;
  const callbackReserve = subtotal * (callbackReservePct / 100);
  const direct = subtotal + callbackReserve;
  const overhead = direct * (overheadRate / 100);
  const cost = direct + overhead;

  const target = cost / (1 - targetMargin / 100);
  const finalPrice = Math.max(target, minimumServiceCharge);
  const minimumApplied = minimumServiceCharge > target;

  const profit = finalPrice - cost;
  const profitMarginPct = finalPrice > 0 ? (profit / finalPrice) * 100 : null;
  const effectiveHourlyRate = billedHours > 0 ? profit / billedHours : null;

  return {
    laborHours,
    travelHours,
    billedHours,
    timeCost,
    emergencySurcharge,
    billedTime,
    parts,
    tripFee,
    callbackReserve,
    overhead,
    cost,
    target,
    finalPrice,
    minimumApplied,
    profit,
    profitMarginPct,
    effectiveHourlyRate,
  };
}

/**
 * Compare a day's worth of calls, at a given average profit per call,
 * against a target daily income and say how many more calls close the gap.
 */
export function dailyIncomeGap(targetDailyIncome, profitPerCall, callsPerDay) {
  const target = number(targetDailyIncome, 'Target daily income');
  const perCall = number(profitPerCall, 'Profit per call', { min: -Infinity });
  const calls = number(callsPerDay, 'Calls per day');
  const totalDailyProfit = perCall * calls;
  const gap = Math.max(0, target - totalDailyProfit);
  const additionalCallsNeeded = gap === 0 ? 0 : (perCall > 0 ? Math.ceil(gap / perCall) : null);
  return { totalDailyProfit, gap, additionalCallsNeeded, meetsTarget: totalDailyProfit >= target };
}

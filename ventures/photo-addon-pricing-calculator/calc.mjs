// Deterministic profitability arithmetic for an independent wedding/event
// photographer or videographer pricing ONE package add-on -- an extra hour of
// coverage, a second shooter, an album or print upgrade, an engagement-session
// add-on -- and comparing 2-3 such add-ons by what they actually pay per hour
// of the photographer's own time, not their headline price.
//
// Photographers commonly quote a round number for an add-on -- "$300 for a
// second shooter" or "$150 for an extra hour" -- without netting out their own
// time. That time is easy to undercount because most of it is invisible on the
// wedding day itself: culling and editing an extra hour of coverage, or a
// second shooter's entire take, routinely runs to one to two times the shoot
// hours that produced it. Add gear depreciation and wear (a second body and
// lens taking a full day of shooting, an extra flash cycle count) and any cash
// paid out (a subcontracted second shooter, an album or print vendor's bill),
// and a "profitable-looking" add-on price can be losing money once every real
// cost is counted -- or, just as often, priced well below what the
// photographer's own target hourly rate says it is worth.
//
// Same two-layer shape as this portfolio's other route/deployment-pricing
// calculators (`cat-adjuster-fee-calculator`, `process-server-fee-calculator`):
// a single add-on, then a roll-up that compares several add-on options.
//
//   calculate(input)     -- net profit for ONE add-on: the price charged, less
//                            the photographer's own shoot/cull/edit time valued
//                            at their target hourly rate, gear depreciation and
//                            wear, any second-shooter/subcontractor payout, and
//                            any physical-goods cost (album, prints). Also
//                            reports the effective hourly rate the add-on pays
//                            *above* that target rate, profit margin, and the
//                            break-even price.
//   rankAddOns(options) -- rank several named add-on options (each produced by
//                            running calculate() once per option) by effective
//                            hourly rate, so a photographer can see which
//                            add-on is actually worth offering or prioritizing,
//                            not just which has the highest headline price.
//
// This does not do tax or business-formation planning, and it is not legal or
// contract advice -- it only prices the add-on's own economics from numbers
// the photographer supplies.

export const DEFAULTS = {
  targetHourlyRate: 75,
  shootHours: 1,
  cullHours: 0.5,
  editHours: 1.5,
  secondShooterCost: 0,
  albumPrintCost: 0,
  gearWearAllowance: 5,
  price: 300,
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
 * Net profit for one photography package add-on.
 *
 * @param {object} input
 * @param {number} input.targetHourlyRate What the photographer's own time is
 *   worth -- the rate their shoot, culling and editing hours are valued at
 *   before anything else is counted as cost.
 * @param {number} input.shootHours Extra hours actually spent shooting this
 *   add-on (0 for an add-on, like a second shooter, that adds no extra hours
 *   to the primary photographer's own shoot time).
 * @param {number} input.cullHours Hours spent culling the extra images this
 *   add-on generates.
 * @param {number} input.editHours Hours spent editing the extra images this
 *   add-on generates -- routinely the largest single time cost, and the one
 *   most often left out of a round headline price.
 * @param {number} input.secondShooterCost Cash paid out to a second shooter
 *   or other subcontractor for this add-on, if any.
 * @param {number} input.albumPrintCost Cost of physical goods this add-on
 *   requires -- an album, prints, a USB or box -- if any.
 * @param {number} input.gearWearAllowance A per-add-on allowance for gear
 *   depreciation and wear (an extra body/lens/flash cycle count, batteries,
 *   memory cards) -- real cost that does not show up on a receipt the way a
 *   subcontractor invoice does.
 * @param {number} input.price The price being considered for this add-on.
 */
export function calculate(input) {
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const shootHours = number(input.shootHours, 'Shoot hours');
  const cullHours = number(input.cullHours, 'Cull hours');
  const editHours = number(input.editHours, 'Edit hours');
  const secondShooterCost = number(input.secondShooterCost, 'Second shooter cost');
  const albumPrintCost = number(input.albumPrintCost, 'Album/print cost');
  const gearWearAllowance = number(input.gearWearAllowance, 'Gear wear allowance');
  const price = number(input.price, 'Price');

  const totalHours = shootHours + cullHours + editHours;
  const laborCost = totalHours * targetHourlyRate;

  const grossRevenue = price;
  const totalCost = laborCost + secondShooterCost + albumPrintCost + gearWearAllowance;
  const netProfit = grossRevenue - totalCost;

  // Profit *above* the target hourly rate, per hour of the photographer's own
  // time -- because that time is already paid for once, inside laborCost. A
  // positive number means the add-on beats the target rate; a negative one
  // means it does not, even though laborCost was already counted as a cost.
  const effectiveHourlyRate = totalHours > 0 ? netProfit / totalHours : null;
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : null;

  // The price at which this add-on would break exactly even against the
  // target hourly rate -- the number to compare a headline add-on price
  // against before quoting it.
  const breakEvenPrice = totalCost;

  return {
    totalHours, laborCost, secondShooterCost, albumPrintCost, gearWearAllowance,
    grossRevenue, totalCost, netProfit, effectiveHourlyRate, profitMarginPct, breakEvenPrice,
  };
}

/**
 * Rank several named add-on options by effective hourly rate, each computed
 * by running calculate() once per option.
 * @param {{name: string, netProfit: number, effectiveHourlyRate: number}[]} options
 */
export function rankAddOns(options) {
  const validated = options.map((option, i) => ({
    name: String(option.name || `Add-on ${i + 1}`),
    netProfit: number(option.netProfit, `Add-on ${i + 1} net profit`, { min: -Infinity }),
    effectiveHourlyRate: number(option.effectiveHourlyRate, `Add-on ${i + 1} effective hourly rate`, { min: -Infinity }),
  }));
  const ranked = [...validated].sort(
    (a, b) => b.effectiveHourlyRate - a.effectiveHourlyRate || b.netProfit - a.netProfit,
  );
  const best = ranked.length ? ranked[0] : null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;
  const spread = best && worst ? best.effectiveHourlyRate - worst.effectiveHourlyRate : 0;
  return { ranked, best, worst, spread, optionCount: ranked.length };
}

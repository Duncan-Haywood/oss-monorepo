// Deterministic profitability arithmetic for an independent 1099 catastrophe
// (CAT) claims adjuster deciding whether a storm deployment offered by an
// independent-adjusting (IA) firm is actually worth taking. CAT adjusters are
// paid a flat fee per claim closed, not a wage, and a deployment runs for
// weeks away from home with real daily costs (lodging, per diem, estimating
// software, vehicle, mileage) that keep accruing on the unpaid travel days
// spent driving into and out of the disaster zone, before the first claim is
// ever closed. A fee schedule that reads well per claim can still lose money
// once those costs and a realistic claims-per-day pace are netted out.
//
// Same two-layer shape as this portfolio's other route/deployment-pricing
// calculators (`fire-extinguisher-inspection-route-margin`,
// `medical-courier-route-margin`): a single scenario, then a roll-up that
// compares several of them.
//
//   calculate(input)      — net profit for ONE deployment under one IA firm's
//                            fee schedule, from claims-per-day pace, the
//                            blended per-claim fee (base fee plus a large-loss
//                            share paid a bonus), estimating-software,
//                            lodging, per diem, vehicle and mileage cost
//                            while in the field, the same daily costs on
//                            unpaid travel days getting to and from the zone,
//                            and a small per-deployment share of fixed costs
//                            (E&O insurance, license and dues renewal).
//   rankOffers(offers)    — rank several named fee-schedule scenarios (run
//                            through calculate() one at a time) by net profit,
//                            so an adjuster can compare what two or three IA
//                            firms are actually offering, not just their
//                            headline per-claim rate.
//
// This does not determine an adjuster's licensing, appointment, or authority
// to handle a claim in any state, and it does not evaluate an IA firm's
// reputation, timeliness of payment, or claim-volume promises — it only
// prices the deployment's own economics from numbers the adjuster supplies.

export const DEFAULTS = {
  deploymentDays: 21,
  travelDaysUnpaid: 2,
  claimsPerDay: 1.5,
  feePerClaim: 550,
  largeLossPct: 10,
  largeLossBonusPerClaim: 400,
  estimatingSoftwareDailyCost: 12,
  lodgingPerNight: 95,
  perDiemFood: 45,
  vehicleDailyCost: 35,
  mileagePerDay: 80,
  mileageRate: 0.67,
  workHoursPerDay: 10,
  fixedDeploymentCost: 150,
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
 * Net profit for one CAT deployment under one IA firm's fee schedule.
 *
 * @param {object} input
 * @param {number} input.deploymentDays Working days in the field, once
 *   claims start closing.
 * @param {number} input.travelDaysUnpaid Additional days spent driving to
 *   and from the disaster zone — no claims close on these, but lodging,
 *   food, vehicle, and software costs keep accruing.
 * @param {number} input.claimsPerDay Average claims closed per working day
 *   — the deployment's pace.
 * @param {number} input.feePerClaim Base fee paid per claim closed.
 * @param {number} input.largeLossPct Percentage of claims that are a large
 *   loss (a bigger, more complex claim the firm pays a bonus for).
 * @param {number} input.largeLossBonusPerClaim Extra fee paid on top of
 *   feePerClaim for each large-loss claim.
 * @param {number} input.estimatingSoftwareDailyCost Daily share of your
 *   Xactimate/Symbility license or subscription — running whether you are
 *   working a claim or driving.
 * @param {number} input.lodgingPerNight Hotel or short-term-rental cost per
 *   night in the field.
 * @param {number} input.perDiemFood Daily food and incidentals.
 * @param {number} input.vehicleDailyCost Daily rental, fuel, or wear-and-tear
 *   allowance for the vehicle you work out of.
 * @param {number} input.mileagePerDay Miles driven per working day within
 *   the disaster zone, moving between claims.
 * @param {number} input.mileageRate Cost per mile for fuel and vehicle wear.
 * @param {number} input.workHoursPerDay Hours worked per working day — used
 *   only to report an effective hourly rate for the days you are actually
 *   closing claims.
 * @param {number} input.fixedDeploymentCost This deployment's share of fixed
 *   costs that do not vary with claims or days — E&O insurance, adjuster
 *   license, and association dues, amortized across your deployments this
 *   year.
 */
export function calculate(input) {
  const deploymentDays = number(input.deploymentDays, 'Deployment days');
  const travelDaysUnpaid = number(input.travelDaysUnpaid, 'Unpaid travel days');
  const claimsPerDay = number(input.claimsPerDay, 'Claims per day');
  const feePerClaim = number(input.feePerClaim, 'Fee per claim');
  const largeLossPct = number(input.largeLossPct, 'Large-loss percentage', { max: 100 });
  const largeLossBonusPerClaim = number(input.largeLossBonusPerClaim, 'Large-loss bonus per claim');
  const estimatingSoftwareDailyCost = number(input.estimatingSoftwareDailyCost, 'Estimating software daily cost');
  const lodgingPerNight = number(input.lodgingPerNight, 'Lodging per night');
  const perDiemFood = number(input.perDiemFood, 'Per diem food');
  const vehicleDailyCost = number(input.vehicleDailyCost, 'Vehicle daily cost');
  const mileagePerDay = number(input.mileagePerDay, 'Mileage per day');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const workHoursPerDay = number(input.workHoursPerDay, 'Work hours per day');
  const fixedDeploymentCost = number(input.fixedDeploymentCost, 'Fixed deployment cost');

  const totalClaims = claimsPerDay * deploymentDays;
  const largeLossClaims = totalClaims * (largeLossPct / 100);
  const normalClaims = totalClaims - largeLossClaims;
  const blendedFeePerClaim = feePerClaim + (largeLossPct / 100) * largeLossBonusPerClaim;
  const grossRevenue = normalClaims * feePerClaim + largeLossClaims * (feePerClaim + largeLossBonusPerClaim);

  const inZoneDailyCost = estimatingSoftwareDailyCost + lodgingPerNight + perDiemFood
    + vehicleDailyCost + mileagePerDay * mileageRate;
  const inZoneCost = inZoneDailyCost * deploymentDays;

  const travelDailyCost = estimatingSoftwareDailyCost + lodgingPerNight + perDiemFood + vehicleDailyCost;
  const travelCost = travelDailyCost * travelDaysUnpaid;

  const totalCost = inZoneCost + travelCost + fixedDeploymentCost;
  const netProfit = grossRevenue - totalCost;

  const totalDays = deploymentDays + travelDaysUnpaid;
  const workHours = workHoursPerDay * deploymentDays;
  const effectiveHourlyRate = workHours > 0 ? netProfit / workHours : null;
  const effectiveDailyRate = totalDays > 0 ? netProfit / totalDays : null;
  const profitPerClaim = totalClaims > 0 ? netProfit / totalClaims : null;
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : null;
  const breakEvenClaimsPerDay = (deploymentDays > 0 && blendedFeePerClaim > 0)
    ? totalCost / (deploymentDays * blendedFeePerClaim)
    : null;

  return {
    totalClaims, largeLossClaims, normalClaims, blendedFeePerClaim, grossRevenue,
    inZoneCost, travelCost, fixedDeploymentCost, totalCost, netProfit,
    totalDays, workHours, effectiveHourlyRate, effectiveDailyRate,
    profitPerClaim, profitMarginPct, breakEvenClaimsPerDay,
  };
}

/**
 * Rank several named fee-schedule scenarios by net profit.
 * @param {{name: string, netProfit: number}[]} offers
 */
export function rankOffers(offers) {
  const validated = offers.map((offer, i) => ({
    name: String(offer.name || `Offer ${i + 1}`),
    netProfit: number(offer.netProfit, `Offer ${i + 1} net profit`, { min: -Infinity }),
  }));
  const ranked = [...validated].sort((a, b) => b.netProfit - a.netProfit);
  const best = ranked.length ? ranked[0] : null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;
  const spread = best && worst ? best.netProfit - worst.netProfit : 0;
  return { ranked, best, worst, spread, offerCount: ranked.length };
}

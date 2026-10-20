// Deterministic profitability arithmetic for an independent fire-extinguisher
// and life-safety-equipment inspection route operator (a certified technician
// or small company visiting customer sites to perform the annual maintenance,
// tagging, recharge, hydrostatic testing, and replacement that NFPA 10 and
// most fire-code authorities require — not the customer's own monthly visual
// self-inspection, and not a fire-alarm or sprinkler contractor). Same
// two-layer shape as this portfolio's other route-pricing calculators
// (`pool-route-pricing`, `dog-walking-route-pricing`, `vending-machine-route-margin`,
// `atm-route-margin`, `custom-farm-rate-calculator`):
//
//   calculate(input)         — monthly profit for ONE customer site, from its
//                               extinguisher count, how many certified visits
//                               it gets a year, the per-unit inspection/tag
//                               fee, the share of units needing a recharge,
//                               hydrostatic test, or full replacement this
//                               visit, materials cost for each, on-site and
//                               drive time, and a small monthly recordkeeping/
//                               compliance-software cost.
//   computeRouteProfit(sites) — roll a list of sites' monthly profit up into
//                               total route profit.
//   incomeGap(...)            — compare that route profit to a target monthly
//                               income and say how many more sites, at the
//                               same average profit, close the gap.
//
// This does not determine, certify, or record whether an extinguisher or a
// site passes inspection or meets NFPA 10 (or any other) fire-code
// requirement — it only prices the technician's own labor, materials, and
// route economics from numbers the technician supplies.

export const DEFAULTS = {
  extinguisherCount: 18,
  visitsPerYear: 1,
  inspectionFeePerUnit: 9,
  tagFeePerUnit: 2.5,
  tagCostPerUnit: 0.4,
  rechargePct: 20,
  rechargeFeePerUnit: 38,
  rechargeCostPerUnit: 14,
  hydroTestPct: 8,
  hydroTestFeePerUnit: 58,
  hydroTestCostPerUnit: 22,
  replacementPct: 4,
  replacementFeePerUnit: 95,
  replacementCostPerUnit: 58,
  inspectionMinutesPerUnit: 4,
  driveMinutes: 24,
  mileage: 9,
  mileageRate: 0.67,
  targetHourlyRate: 32,
  recordkeepingMonthlyCost: 8,
  // Not read by calculate() itself -- it feeds incomeGap() below, against the
  // route-wide "Your route this month" summary. It lives here anyway because
  // DEFAULTS is also the one source share.mjs and index.html derive their
  // persisted/shareable field list from, and this is an ordinary numeric
  // assumption (not one of the per-site rows), so a shared or restored link
  // should carry it too -- see vending-machine-route-margin/calc.mjs and
  // CLAUDE.md's "168 became 169" note on the cost of a copied field list
  // going stale instead of being imported.
  targetMonthlyIncome: 600,
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
 * Monthly profit for a single customer site.
 *
 * @param {object} input
 * @param {number} input.extinguisherCount Extinguishers serviced at this
 *   site on a certified visit.
 * @param {number} input.visitsPerYear Certified maintenance visits you make
 *   to this site in a typical year — almost always 1 under NFPA 10's annual
 *   maintenance requirement, occasionally 2 for a harsher environment.
 * @param {number} input.inspectionFeePerUnit Fee charged per extinguisher
 *   for the certified annual inspection and maintenance itself.
 * @param {number} input.tagFeePerUnit Fee charged per extinguisher for the
 *   dated compliance tag placed on every visit.
 * @param {number} input.tagCostPerUnit Your cost for the tag itself.
 * @param {number} input.rechargePct Percentage of units at this site that
 *   need a recharge (discharged, or due on schedule) on a typical visit.
 * @param {number} input.rechargeFeePerUnit Fee charged per unit recharged.
 * @param {number} input.rechargeCostPerUnit Your cost per unit recharged —
 *   agent, cylinder inspection, and your recharge-station time.
 * @param {number} input.hydroTestPct Percentage of units due for
 *   hydrostatic testing this visit (typically due every 5 or 12 years
 *   depending on extinguisher type).
 * @param {number} input.hydroTestFeePerUnit Fee charged per unit
 *   hydrostatically tested.
 * @param {number} input.hydroTestCostPerUnit Your cost per unit tested —
 *   your own hydro-test service or the shop that runs it for you.
 * @param {number} input.replacementPct Percentage of units this visit that
 *   fail and are replaced outright rather than serviced.
 * @param {number} input.replacementFeePerUnit Fee charged per unit replaced,
 *   including the new extinguisher and its install.
 * @param {number} input.replacementCostPerUnit Your cost per replacement
 *   unit.
 * @param {number} input.inspectionMinutesPerUnit Minutes on-site per
 *   extinguisher for the inspection itself.
 * @param {number} input.driveMinutes Round-trip drive minutes to this site
 *   from the previous stop or home base.
 * @param {number} input.mileage Round-trip vehicle miles to this site.
 * @param {number} input.mileageRate Reimbursement rate per mile for fuel and
 *   vehicle wear.
 * @param {number} input.targetHourlyRate The hourly rate you want to earn
 *   for your own on-site and drive time.
 * @param {number} input.recordkeepingMonthlyCost Monthly share of the
 *   compliance-recordkeeping software or paper-tag system you keep this
 *   customer's inspection history in.
 */
export function calculate(input) {
  const extinguisherCount = number(input.extinguisherCount, 'Extinguisher count');
  const visitsPerYear = number(input.visitsPerYear, 'Visits per year');
  const inspectionFeePerUnit = number(input.inspectionFeePerUnit, 'Inspection fee per unit');
  const tagFeePerUnit = number(input.tagFeePerUnit, 'Tag fee per unit');
  const tagCostPerUnit = number(input.tagCostPerUnit, 'Tag cost per unit');
  const rechargePct = number(input.rechargePct, 'Recharge percentage', { max: 100 });
  const rechargeFeePerUnit = number(input.rechargeFeePerUnit, 'Recharge fee per unit');
  const rechargeCostPerUnit = number(input.rechargeCostPerUnit, 'Recharge cost per unit');
  const hydroTestPct = number(input.hydroTestPct, 'Hydro test percentage', { max: 100 });
  const hydroTestFeePerUnit = number(input.hydroTestFeePerUnit, 'Hydro test fee per unit');
  const hydroTestCostPerUnit = number(input.hydroTestCostPerUnit, 'Hydro test cost per unit');
  const replacementPct = number(input.replacementPct, 'Replacement percentage', { max: 100 });
  const replacementFeePerUnit = number(input.replacementFeePerUnit, 'Replacement fee per unit');
  const replacementCostPerUnit = number(input.replacementCostPerUnit, 'Replacement cost per unit');
  const inspectionMinutesPerUnit = number(input.inspectionMinutesPerUnit, 'Inspection minutes per unit');
  const driveMinutes = number(input.driveMinutes, 'Drive minutes');
  const mileage = number(input.mileage, 'Mileage');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const recordkeepingMonthlyCost = number(input.recordkeepingMonthlyCost, 'Recordkeeping monthly cost');

  const inspectionRevenue = extinguisherCount * inspectionFeePerUnit;
  const tagRevenue = extinguisherCount * tagFeePerUnit;
  const tagCost = extinguisherCount * tagCostPerUnit;
  const rechargeUnits = extinguisherCount * (rechargePct / 100);
  const rechargeRevenue = rechargeUnits * rechargeFeePerUnit;
  const rechargeCost = rechargeUnits * rechargeCostPerUnit;
  const hydroUnits = extinguisherCount * (hydroTestPct / 100);
  const hydroRevenue = hydroUnits * hydroTestFeePerUnit;
  const hydroCost = hydroUnits * hydroTestCostPerUnit;
  const replaceUnits = extinguisherCount * (replacementPct / 100);
  const replaceRevenue = replaceUnits * replacementFeePerUnit;
  const replaceCost = replaceUnits * replacementCostPerUnit;

  const visitRevenue = inspectionRevenue + tagRevenue + rechargeRevenue + hydroRevenue + replaceRevenue;
  const materialsCost = tagCost + rechargeCost + hydroCost + replaceCost;
  const mileageCost = mileage * mileageRate;
  const laborMinutes = extinguisherCount * inspectionMinutesPerUnit + driveMinutes;
  const laborHours = laborMinutes / 60;
  const laborCost = laborHours * targetHourlyRate;
  const visitProfit = visitRevenue - materialsCost - mileageCost - laborCost;

  const monthlyVisits = visitsPerYear / 12;
  const monthlyRevenue = visitRevenue * monthlyVisits;
  const monthlyLaborHours = laborHours * monthlyVisits;
  const netProfit = visitProfit * monthlyVisits - recordkeepingMonthlyCost;
  const profitMarginPct = monthlyRevenue > 0 ? (netProfit / monthlyRevenue) * 100 : null;
  const effectiveHourlyRate = monthlyLaborHours > 0 ? netProfit / monthlyLaborHours : null;
  const perUnitProfit = extinguisherCount > 0 ? visitProfit / extinguisherCount : null;

  return {
    inspectionRevenue, tagRevenue, tagCost, rechargeRevenue, rechargeCost,
    hydroRevenue, hydroCost, replaceRevenue, replaceCost,
    visitRevenue, materialsCost, mileageCost, laborHours, laborCost, visitProfit,
    monthlyRevenue, monthlyLaborHours, recordkeepingCost: recordkeepingMonthlyCost,
    netProfit, profitMarginPct, effectiveHourlyRate, perUnitProfit,
    monthlyProfit: netProfit,
  };
}

/**
 * Roll a list of sites' monthly profit up into total route profit.
 * @param {{monthlyProfit: number}[]} sites
 */
export function computeRouteProfit(sites) {
  let totalMonthlyProfit = 0;
  for (const [i, site] of sites.entries()) {
    totalMonthlyProfit += number(site.monthlyProfit, `Site ${i + 1} monthly profit`, { min: -Infinity });
  }
  const siteCount = sites.length;
  const averageProfitPerSite = siteCount > 0 ? totalMonthlyProfit / siteCount : 0;
  return { totalMonthlyProfit, siteCount, averageProfitPerSite };
}

/**
 * Compare route profit to a target monthly income and say how many more
 * sites, at the same average profit, close the gap.
 */
export function incomeGap(targetMonthlyIncome, totalMonthlyProfit, averageProfitPerSite) {
  const target = number(targetMonthlyIncome, 'Target monthly income');
  const profit = number(totalMonthlyProfit, 'Total monthly profit', { min: -Infinity });
  const avg = number(averageProfitPerSite, 'Average profit per site', { min: -Infinity });
  const gap = Math.max(0, target - profit);
  const additionalSitesNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalSitesNeeded, meetsTarget: profit >= target };
}

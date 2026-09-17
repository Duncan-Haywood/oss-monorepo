// Deterministic profitability arithmetic for an independent propane (LP gas)
// delivery route operator — a small bulk plant or bobtail-truck dealer
// filling residential and small-commercial tanks on a keep-full or will-call
// schedule, not a national retailer and not a tank manufacturer or installer
// (see `standby-generator-bid-calculator` for sizing/installing the
// appliance side of a propane system; this venture never touches that).
// Same two-layer shape as this portfolio's other route-pricing calculators
// (`atm-route-margin`, `vending-machine-route-margin`,
// `fire-extinguisher-inspection-route-margin`, `dog-walking-route-pricing`):
//
//   calculate(input)          — monthly profit for ONE customer, from their
//                                typical annual gallon usage, the retail/
//                                wholesale price spread, the average fill
//                                size (which decides whether a small-fill
//                                minimum-delivery fee applies), drive time
//                                and mileage per stop, and the monthly tank
//                                rental and hazmat-compliance cost carried
//                                per account.
//   computeRouteProfit(custs) — roll a list of customers' monthly profit up
//                                into total route profit.
//   incomeGap(...)            — compare that route profit to a target
//                                monthly income and say how many more
//                                customers, at the same average profit,
//                                close the gap.
//
// The one thing this deliberately does not do: it never computes how many
// gallons a tank needs, when a customer will run out, or a safe fill
// percentage. Those are propane-supply and safety questions for the
// customer's own licensed propane provider — this tool only prices the
// route economics of a delivery you have already scheduled, from numbers
// you supply. No price, rate, or fee below is a published fact; every one
// is a placeholder you replace with your own numbers.

export const DEFAULTS = {
  annualGallons: 850,
  avgGallonsPerFill: 150,
  retailPricePerGallon: 2.49,
  wholesaleCostPerGallon: 1.55,
  minimumDeliveryGallons: 100,
  minimumDeliveryFee: 45,
  milesPerDelivery: 18,
  truckCostPerMile: 0.95,
  stopMinutes: 20,
  driveMinutesPerDelivery: 22,
  driverHourlyRate: 28,
  tankRentalMonthlyCost: 5,
  hazmatComplianceMonthlyCost: 3.5,
  // Not read by calculate() itself -- it feeds incomeGap() below, against the
  // route-wide "Your route this month" summary. It lives here anyway because
  // DEFAULTS is also the one source share.mjs and index.html derive their
  // persisted/shareable field list from, and this is an ordinary numeric
  // assumption (not one of the per-customer rows), so a shared or restored
  // link should carry it too -- see CLAUDE.md's "168 became 169" note on the
  // cost of a copied field list going stale instead of being imported.
  targetMonthlyIncome: 3000,
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
 * Monthly profit for a single delivery customer.
 *
 * @param {object} input
 * @param {number} input.annualGallons Gallons this customer takes across a
 *   typical year (read off last year's delivery tickets).
 * @param {number} input.avgGallonsPerFill Gallons delivered on an average
 *   stop at this customer — decides how many stops a year's volume takes,
 *   and whether the fill is small enough to trigger a minimum-delivery fee.
 * @param {number} input.retailPricePerGallon Price you charge this customer
 *   per gallon delivered.
 * @param {number} input.wholesaleCostPerGallon Your cost per gallon —
 *   terminal/rack price plus trucking to your own bulk plant.
 * @param {number} input.minimumDeliveryGallons Threshold below which a fill
 *   is small enough that dispatching a truck for it costs more than the
 *   fuel margin alone covers.
 * @param {number} input.minimumDeliveryFee Flat fee added to a delivery
 *   whose average fill is under the minimum-delivery threshold. 0 if you do
 *   not charge one.
 * @param {number} input.milesPerDelivery Round-trip miles from your bulk
 *   plant or the previous stop to this customer.
 * @param {number} input.truckCostPerMile Fuel and maintenance cost per mile
 *   for the bobtail delivery truck — typically well above a car's mileage
 *   rate.
 * @param {number} input.stopMinutes Minutes on-site to gauge the tank,
 *   connect the hose, fill, and complete the delivery ticket and safety
 *   check.
 * @param {number} input.driveMinutesPerDelivery Round-trip drive minutes for
 *   this stop.
 * @param {number} input.driverHourlyRate The hourly rate you want to earn
 *   for your own driving and on-site time.
 * @param {number} input.tankRentalMonthlyCost Monthly cost to lease or own
 *   the tank at the customer's property. 0 if the customer owns their own
 *   tank.
 * @param {number} input.hazmatComplianceMonthlyCost Monthly share of DOT
 *   hazmat-endorsement, vehicle, and cargo-insurance compliance cost you
 *   allocate across your customer base.
 */
export function calculate(input) {
  const annualGallons = number(input.annualGallons, 'Annual gallons');
  const avgGallonsPerFill = number(input.avgGallonsPerFill, 'Average gallons per fill');
  if (avgGallonsPerFill === 0) throw new Error('Average gallons per fill must be greater than zero.');
  const retailPricePerGallon = number(input.retailPricePerGallon, 'Retail price per gallon');
  const wholesaleCostPerGallon = number(input.wholesaleCostPerGallon, 'Wholesale cost per gallon');
  const minimumDeliveryGallons = number(input.minimumDeliveryGallons, 'Minimum delivery gallons');
  const minimumDeliveryFee = number(input.minimumDeliveryFee, 'Minimum delivery fee');
  const milesPerDelivery = number(input.milesPerDelivery, 'Miles per delivery');
  const truckCostPerMile = number(input.truckCostPerMile, 'Truck cost per mile');
  const stopMinutes = number(input.stopMinutes, 'Stop minutes');
  const driveMinutesPerDelivery = number(input.driveMinutesPerDelivery, 'Drive minutes per delivery');
  const driverHourlyRate = number(input.driverHourlyRate, 'Driver hourly rate');
  const tankRentalMonthlyCost = number(input.tankRentalMonthlyCost, 'Tank rental monthly cost');
  const hazmatComplianceMonthlyCost = number(input.hazmatComplianceMonthlyCost, 'Hazmat compliance monthly cost');

  const deliveriesPerYear = annualGallons / avgGallonsPerFill;
  const marginPerGallon = retailPricePerGallon - wholesaleCostPerGallon;
  const fuelMarginRevenue = annualGallons * marginPerGallon;
  const minimumFeeApplies = avgGallonsPerFill < minimumDeliveryGallons;
  const minimumFeeRevenue = minimumFeeApplies ? minimumDeliveryFee * deliveriesPerYear : 0;
  const annualRevenue = fuelMarginRevenue + minimumFeeRevenue;

  const mileageCost = milesPerDelivery * truckCostPerMile * deliveriesPerYear;
  const laborMinutes = (stopMinutes + driveMinutesPerDelivery) * deliveriesPerYear;
  const laborHours = laborMinutes / 60;
  const laborCost = laborHours * driverHourlyRate;
  const tankCost = tankRentalMonthlyCost * 12;
  const hazmatCost = hazmatComplianceMonthlyCost * 12;
  const annualCost = mileageCost + laborCost + tankCost + hazmatCost;

  const netProfitAnnual = annualRevenue - annualCost;
  const netProfit = netProfitAnnual / 12;
  const profitMarginPct = annualRevenue > 0 ? (netProfitAnnual / annualRevenue) * 100 : null;
  const profitPerGallon = annualGallons > 0 ? netProfitAnnual / annualGallons : null;
  const effectiveHourlyRate = laborHours > 0 ? netProfitAnnual / laborHours : null;

  return {
    deliveriesPerYear, marginPerGallon, fuelMarginRevenue, minimumFeeApplies, minimumFeeRevenue,
    annualRevenue, mileageCost, laborHours, laborCost, tankCost, hazmatCost, annualCost,
    netProfitAnnual, netProfit, profitMarginPct, profitPerGallon, effectiveHourlyRate,
    monthlyProfit: netProfit,
  };
}

/**
 * Roll a list of customers' monthly profit up into total route profit.
 * @param {{monthlyProfit: number}[]} customers
 */
export function computeRouteProfit(customers) {
  let totalMonthlyProfit = 0;
  for (const [i, cust] of customers.entries()) {
    totalMonthlyProfit += number(cust.monthlyProfit, `Customer ${i + 1} monthly profit`, { min: -Infinity });
  }
  const customerCount = customers.length;
  const averageProfitPerCustomer = customerCount > 0 ? totalMonthlyProfit / customerCount : 0;
  return { totalMonthlyProfit, customerCount, averageProfitPerCustomer };
}

/**
 * Compare route profit to a target monthly income and say how many more
 * customers, at the same average profit, close the gap.
 */
export function incomeGap(targetMonthlyIncome, totalMonthlyProfit, averageProfitPerCustomer) {
  const target = number(targetMonthlyIncome, 'Target monthly income');
  const profit = number(totalMonthlyProfit, 'Total monthly profit', { min: -Infinity });
  const avg = number(averageProfitPerCustomer, 'Average profit per customer', { min: -Infinity });
  const gap = Math.max(0, target - profit);
  const additionalCustomersNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalCustomersNeeded, meetsTarget: profit >= target };
}

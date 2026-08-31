export const DEFAULTS = {
  accounts: 40, visits: 4, serviceMinutes: 35, driveMinutes: 12,
  laborRate: 28, chemicalCost: 18, overhead: 12, targetMargin: 35
};

const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
};

/**
 * @param {number} [input.currentPrice] What you actually charge per account
 *   per month today. Optional — omit or leave blank to get only the minimum
 *   price. When given, the result includes `current`: your real margin and
 *   route profit at that price, so an operator checking an existing route
 *   (not just pricing a new one) can see the gap to the target, not just the
 *   floor.
 */
export function calculate(input) {
  const accounts = number(input.accounts, 'Accounts');
  const visits = number(input.visits, 'Visits per account');
  const serviceMinutes = number(input.serviceMinutes, 'Service minutes');
  const driveMinutes = number(input.driveMinutes, 'Drive minutes');
  const laborRate = number(input.laborRate, 'Labor rate');
  const chemicalCost = number(input.chemicalCost, 'Chemical cost');
  const overhead = number(input.overhead, 'Overhead per account');
  const targetMargin = number(input.targetMargin, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%.');
  const monthlyHours = accounts * visits * (serviceMinutes + driveMinutes) / 60;
  const labor = monthlyHours * laborRate;
  const variableCost = accounts * visits * chemicalCost;
  const overheadCost = accounts * overhead;
  const totalCost = labor + variableCost + overheadCost;
  const minimumRouteRevenue = totalCost / (1 - targetMargin / 100);
  const minimumMonthlyPrice = accounts ? minimumRouteRevenue / accounts : 0;

  const hasCurrentPrice =
    input.currentPrice !== null && input.currentPrice !== undefined && input.currentPrice !== '';
  const currentPrice = hasCurrentPrice ? number(input.currentPrice, 'Price you currently charge') : null;

  // What an existing route actually clears today, priced the same way as
  // the minimum above — a share of route revenue, not a markup on cost —
  // so "am I hitting my target margin?" and "what's the floor?" answer
  // from the same arithmetic instead of two different formulas.
  const current = currentPrice === null ? null : (() => {
    const routeRevenue = currentPrice * accounts;
    const profit = routeRevenue - totalCost;
    const margin = routeRevenue === 0 ? 0 : (profit / routeRevenue) * 100;
    return {
      price: currentPrice,
      routeRevenue,
      profit,
      margin,
      meetsTarget: margin >= targetMargin - 1e-9,
      belowBreakEven: profit < 0,
      gapToMinimum: minimumMonthlyPrice - currentPrice,
    };
  })();

  return {
    accounts, visits, monthlyHours, labor, variableCost, overheadCost, totalCost,
    minimumRouteRevenue, minimumMonthlyPrice, targetMargin, current,
  };
}

export const DEFAULTS = {
  accounts: 40, visits: 4, serviceMinutes: 35, driveMinutes: 12,
  laborRate: 28, chemicalCost: 18, overhead: 12, targetMargin: 35
};

const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
};

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
  return { accounts, visits, monthlyHours, labor, variableCost, overheadCost, totalCost, minimumRouteRevenue, minimumMonthlyPrice, targetMargin };
}

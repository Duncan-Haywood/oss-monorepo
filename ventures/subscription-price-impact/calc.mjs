const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
};

export function calculateImpact(input) {
  const customers = finite(input.customers, 'Customers');
  const currentPrice = finite(input.currentPrice, 'Current price');
  const proposedPrice = finite(input.proposedPrice, 'Proposed price');
  const monthlyCosts = finite(input.monthlyCosts, 'Monthly costs');
  const currentRevenue = customers * currentPrice;
  const proposedRevenue = customers * proposedPrice;
  const currentContribution = currentRevenue - monthlyCosts;
  const proposedContribution = proposedRevenue - monthlyCosts;
  const revenueChange = proposedRevenue - currentRevenue;
  const breakEvenCustomers = proposedPrice === 0 ? Infinity : (currentRevenue / proposedPrice);
  const maxLostCustomers = Math.max(0, customers - breakEvenCustomers);
  const maxChurnRate = customers === 0 ? 0 : (maxLostCustomers / customers) * 100;
  const scenarios = [0, 5, 10, 15, 20].map(churn => {
    const retained = customers * (1 - churn / 100);
    return { churn, customers: retained, revenue: retained * proposedPrice, contribution: retained * proposedPrice - monthlyCosts };
  });
  return { customers, currentPrice, proposedPrice, monthlyCosts, currentRevenue, proposedRevenue, currentContribution, proposedContribution, revenueChange, breakEvenCustomers, maxLostCustomers, maxChurnRate, scenarios };
}

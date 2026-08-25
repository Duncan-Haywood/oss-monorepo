function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
}

export function scenarioCost(input) {
  const storageGb = nonNegative(input.storageGb, 'Storage');
  const requestsMillion = nonNegative(input.requestsMillion ?? 0, 'Requests');
  const egressGb = nonNegative(input.egressGb ?? 0, 'Egress');
  const storageRate = nonNegative(input.storageRate ?? 0, 'Storage rate');
  const requestRate = nonNegative(input.requestRate ?? 0, 'Request rate');
  const egressRate = nonNegative(input.egressRate ?? 0, 'Egress rate');
  const storage = storageGb * storageRate;
  const requests = requestsMillion * requestRate;
  const egress = egressGb * egressRate;
  return { storage, requests, egress, total: storage + requests + egress };
}

export function compareScenarios(input) {
  const first = scenarioCost(input.first);
  const second = scenarioCost(input.second);
  const difference = first.total - second.total;
  const expensiveTotal = Math.max(first.total, second.total);
  return {
    first,
    second,
    difference,
    cheaper: difference > 0 ? 'second' : difference < 0 ? 'first' : 'tie',
    savings: Math.abs(difference),
    annualSavings: Math.abs(difference) * 12,
    savingsPercentage: expensiveTotal === 0 ? 0 : (Math.abs(difference) / expensiveTotal) * 100,
  };
}

export function reviewRecord(input) {
  const workload = {
    storageGb: input.storageGb,
    requestsMillion: input.requestsMillion ?? 0,
    egressGb: input.egressGb ?? 0,
  };
  const comparison = compareScenarios({
    first: { ...workload, ...input.first },
    second: { ...workload, ...input.second },
  });
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    workload: {
      storageGb: Number(workload.storageGb),
      requestsMillion: Number(workload.requestsMillion),
      egressGb: Number(workload.egressGb),
    },
    options: [
      { name: input.first.name || 'Option A', ...comparison.first },
      { name: input.second.name || 'Option B', ...comparison.second },
    ],
    cheaper: comparison.cheaper,
    savings: comparison.savings,
  };
}

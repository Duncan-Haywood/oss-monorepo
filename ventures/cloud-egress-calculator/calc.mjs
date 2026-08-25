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
  return {
    first,
    second,
    difference,
    cheaper: difference > 0 ? 'second' : difference < 0 ? 'first' : 'tie',
    savings: Math.abs(difference),
  };
}

export function decisionSummary(input) {
  const result = compareScenarios(input);
  const firstName = input.first.name || 'Option A';
  const secondName = input.second.name || 'Option B';
  const cheaperName = result.cheaper === 'first' ? firstName : result.cheaper === 'second' ? secondName : null;
  const lines = [
    'Cloud egress cost comparison',
    `${firstName}: $${result.first.total.toFixed(2)}/month`,
    `${secondName}: $${result.second.total.toFixed(2)}/month`,
  ];
  if (cheaperName) lines.push(`${cheaperName} is cheaper by $${result.savings.toFixed(2)}/month.`);
  else lines.push('Both options have the same monthly cost.');
  lines.push('Review current provider price sheets before relying on this estimate.');
  return lines.join('\n');
}

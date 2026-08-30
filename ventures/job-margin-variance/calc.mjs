export function calculate(input) {
  const fields = ['estimatedHours', 'actualHours', 'estimatedMaterials', 'actualMaterials', 'estimatedOther', 'actualOther'];
  const values = Object.fromEntries(fields.map(field => [field, Number(input[field])]));
  if (fields.some(field => !Number.isFinite(values[field]) || values[field] < 0)) {
    throw new Error('Enter a non-negative number in every field.');
  }
  const rows = [
    ['Labor hours', values.estimatedHours, values.actualHours, 'hours'],
    ['Materials', values.estimatedMaterials, values.actualMaterials, 'money'],
    ['Other costs', values.estimatedOther, values.actualOther, 'money']
  ].map(([label, estimate, actual, unit]) => ({ label, estimate, actual, variance: actual - estimate, unit }));
  const estimatedCost = values.estimatedMaterials + values.estimatedOther;
  const actualCost = values.actualMaterials + values.actualOther;
  const laborVariance = values.actualHours - values.estimatedHours;
  const costVariance = actualCost - estimatedCost;
  const largest = [...rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))[0];
  return { rows, estimatedCost, actualCost, laborVariance, costVariance, largest };
}

export function reportText(result) {
  const lines = ['JOB MARGIN VARIANCE REVIEW', '', `Estimated materials and other costs: ${money(result.estimatedCost)}`, `Actual materials and other costs: ${money(result.actualCost)}`, `Cost variance: ${signedMoney(result.costVariance)}`, `Labor-hour variance: ${signed(result.laborVariance)} hours`, '', 'DETAILS'];
  result.rows.forEach(row => lines.push(`${row.label}: estimate ${row.unit === 'money' ? money(row.estimate) : row.estimate + ' hours'}, actual ${row.unit === 'money' ? money(row.actual) : row.actual + ' hours'}, variance ${row.unit === 'money' ? signedMoney(row.variance) : signed(row.variance) + ' hours'}`));
  lines.push('', `Largest movement to review: ${result.largest.label}.`, 'This is an arithmetic comparison, not a profitability determination.');
  return lines.join('\n');
}
const money = (value) => {
  const format = (value) => `$${value.toFixed(2)}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const signedMoney = value => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

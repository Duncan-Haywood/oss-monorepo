export function calculate(input) {
  const fields = ['estimatedHours', 'actualHours', 'estimatedMaterials', 'actualMaterials', 'estimatedOther', 'actualOther'];
  const values = Object.fromEntries(fields.map(field => [field, Number(input[field])]));
  if (fields.some(field => !Number.isFinite(values[field]) || values[field] < 0)) {
    throw new Error('Enter a non-negative number in every field.');
  }

  // Optional: a labor rate turns the hours row into the same currency as
  // materials and other costs. Without a rate, "largest movement" below ranks
  // a raw hours count against raw dollars -- comparing "4" to "45" as if they
  // were the same unit, which can name a small dollar line the biggest mover
  // even when a much bigger labor overrun is sitting in the same report. Both
  // new fields default to "not provided" so a worksheet with only the
  // original six fields keeps computing exactly as it always has.
  const hasHourlyRate = input.hourlyRate !== undefined && input.hourlyRate !== null && String(input.hourlyRate).trim() !== '';
  const hourlyRate = hasHourlyRate ? Number(input.hourlyRate) : null;
  if (hasHourlyRate && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    throw new Error('Enter a non-negative number for the labor rate, or leave it blank.');
  }

  // Optional: a job/bid price turns cost variance into the margin swing the
  // product is named for -- not "costs ran $60 over" but "margin fell from
  // 35% to 28%". It needs the labor rate too, since margin is measured
  // against the full job cost (labor plus materials plus other), not
  // materials and other costs alone.
  const hasBidPrice = input.bidPrice !== undefined && input.bidPrice !== null && String(input.bidPrice).trim() !== '';
  const bidPrice = hasBidPrice ? Number(input.bidPrice) : null;
  if (hasBidPrice && (!Number.isFinite(bidPrice) || bidPrice <= 0)) {
    throw new Error('Enter a job price greater than zero, or leave it blank.');
  }
  if (hasBidPrice && !hasHourlyRate) {
    throw new Error('A labor rate is needed to fold labor hours into the job price before margin can be compared.');
  }

  const laborCostVariance = hasHourlyRate ? (values.actualHours - values.estimatedHours) * hourlyRate : null;

  const rows = [
    ['Labor hours', values.estimatedHours, values.actualHours, 'hours', laborCostVariance],
    ['Materials', values.estimatedMaterials, values.actualMaterials, 'money', null],
    ['Other costs', values.estimatedOther, values.actualOther, 'money', null],
  ].map(([label, estimate, actual, unit, rankingOverride]) => {
    const variance = actual - estimate;
    // rankingVariance is what "largest movement" sorts on: the dollar
    // equivalent when one exists, the row's own unit otherwise. `variance`
    // and `unit` stay in the row's native unit for display.
    return { label, estimate, actual, variance, unit, rankingVariance: rankingOverride ?? variance };
  });
  const estimatedCost = values.estimatedMaterials + values.estimatedOther;
  const actualCost = values.actualMaterials + values.actualOther;
  const laborVariance = values.actualHours - values.estimatedHours;
  const costVariance = actualCost - estimatedCost;
  const largest = [...rows].sort((a, b) => Math.abs(b.rankingVariance) - Math.abs(a.rankingVariance))[0];

  const result = {
    rows, estimatedCost, actualCost, laborVariance, costVariance, largest,
    hourlyRate, laborCostVariance, bidPrice, margin: null,
  };

  if (hasHourlyRate) {
    const estimatedLaborCost = values.estimatedHours * hourlyRate;
    const actualLaborCost = values.actualHours * hourlyRate;
    const totalEstimatedCost = estimatedLaborCost + estimatedCost;
    const totalActualCost = actualLaborCost + actualCost;
    result.estimatedLaborCost = estimatedLaborCost;
    result.actualLaborCost = actualLaborCost;
    result.totalEstimatedCost = totalEstimatedCost;
    result.totalActualCost = totalActualCost;
    result.totalCostVariance = totalActualCost - totalEstimatedCost;

    if (hasBidPrice) {
      const estimatedProfit = bidPrice - totalEstimatedCost;
      const actualProfit = bidPrice - totalActualCost;
      const estimatedMarginPct = (estimatedProfit / bidPrice) * 100;
      const actualMarginPct = (actualProfit / bidPrice) * 100;
      result.margin = {
        bidPrice,
        estimatedProfit,
        actualProfit,
        profitVariance: actualProfit - estimatedProfit,
        estimatedMarginPct,
        actualMarginPct,
        marginPointsVariance: actualMarginPct - estimatedMarginPct,
      };
    }
  }

  return result;
}

export function reportText(result) {
  const lines = ['JOB MARGIN VARIANCE REVIEW', '', `Estimated materials and other costs: ${money(result.estimatedCost)}`, `Actual materials and other costs: ${money(result.actualCost)}`, `Cost variance: ${signedMoney(result.costVariance)}`, `Labor-hour variance: ${signed(result.laborVariance)} hours`];
  if (result.hourlyRate != null) {
    lines.push(`Labor-cost variance at $${result.hourlyRate.toFixed(2)}/hr: ${signedMoney(result.laborCostVariance)}`);
    lines.push(`Total estimated cost (labor + materials + other): ${money(result.totalEstimatedCost)}`);
    lines.push(`Total actual cost (labor + materials + other): ${money(result.totalActualCost)}`);
    lines.push(`Total cost variance: ${signedMoney(result.totalCostVariance)}`);
  }
  if (result.margin) {
    const m = result.margin;
    lines.push('', 'MARGIN');
    lines.push(`Job price: ${money(m.bidPrice)}`);
    lines.push(`Estimated margin: ${m.estimatedMarginPct.toFixed(1)}% (${money(m.estimatedProfit)} profit)`);
    lines.push(`Actual margin: ${m.actualMarginPct.toFixed(1)}% (${money(m.actualProfit)} profit)`);
    lines.push(`Margin change: ${signed(m.marginPointsVariance)} points, ${signedMoney(m.profitVariance)} profit`);
  }
  lines.push('', 'DETAILS');
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

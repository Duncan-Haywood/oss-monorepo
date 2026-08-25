export function parseInputs(raw) {
  const errors = [];
  const number = (key, label, min = 0, max = Infinity) => {
    const value = raw[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`${label} is required.`);
      return 0;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      errors.push(`${label} must be between ${min} and ${max === Infinity ? 'infinity' : max}.`);
      return 0;
    }
    return parsed;
  };
  const contractValue = number('contractValue', 'Contract value');
  const retainagePct = number('retainagePct', 'Retainage percentage', 0, 100);
  const paidToDate = number('paidToDate', 'Paid to date');
  const daysOutstanding = number('daysOutstanding', 'Days outstanding');
  const annualCarryingRatePct = number('annualCarryingRatePct', 'Annual carrying-cost assumption', 0, 100);
  let typicalHoldDays = 90;
  if (raw.typicalHoldDays !== undefined && raw.typicalHoldDays !== null && String(raw.typicalHoldDays).trim() !== '') {
    typicalHoldDays = number('typicalHoldDays', 'Typical retainage hold (days)');
  }
  if (paidToDate > contractValue) errors.push('Paid to date cannot exceed contract value.');
  return errors.length
    ? { ok: false, errors }
    : { ok: true, values: { contractValue, retainagePct, paidToDate, daysOutstanding, annualCarryingRatePct, typicalHoldDays } };
}

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeAll(values) {
  const retainageWithheld = round2(values.contractValue * values.retainagePct / 100);
  const earnedUnpaid = round2(Math.max(0, values.contractValue - values.paidToDate));
  const retainageStillUnpaid = round2(Math.min(retainageWithheld, earnedUnpaid));
  const carryingCost = round2(earnedUnpaid * values.annualCarryingRatePct / 100 * values.daysOutstanding / 365);
  return { retainageWithheld, retainageStillUnpaid, earnedUnpaid, carryingCost, totalCashOutstanding: round2(earnedUnpaid + carryingCost) };
}

/**
 * Side-by-side retainage rates for a bid not yet signed.
 * `contractValue` is treated as the price the contractor would accept with
 * 0% retainage. The cash-now column answers "what bid keeps the same
 * progress-payment cash"; the economic column only marks up the modeled
 * carrying cost of the hold. Most contractors price the cash-now gap.
 */
export function compareRetainageRates(values, percents = [0, 5, 10]) {
  if (!values || !Number.isFinite(values.contractValue) || values.contractValue < 0) {
    throw new Error('Contract value is required to compare retainage rates.');
  }
  if (!Number.isFinite(values.annualCarryingRatePct) || values.annualCarryingRatePct < 0) {
    throw new Error('Annual carrying-cost assumption is required to compare retainage rates.');
  }
  const holdDays = Number.isFinite(values.typicalHoldDays) ? values.typicalHoldDays : 90;
  if (holdDays < 0) throw new Error('Typical retainage hold (days) must be at least 0.');

  const listed = Array.isArray(percents) ? [...percents] : [0, 5, 10];
  if (Number.isFinite(values.retainagePct)) listed.push(values.retainagePct);
  const unique = [...new Set(listed.map((pct) => Number(pct)))]
    .filter((pct) => Number.isFinite(pct) && pct >= 0 && pct <= 100)
    .sort((a, b) => a - b);

  return unique.map((pct) => {
    const withheld = round2(values.contractValue * pct / 100);
    const carryingCost = round2(withheld * values.annualCarryingRatePct / 100 * holdDays / 365);
    const progressCash = round2(values.contractValue - withheld);
    const economicNet = round2(values.contractValue - carryingCost);
    const progressDenom = 1 - pct / 100;
    const carryFactor = (pct / 100) * (values.annualCarryingRatePct / 100) * (holdDays / 365);
    const bidToKeepProgress = progressDenom > 0 ? round2(values.contractValue / progressDenom) : null;
    const extraToKeepProgress = bidToKeepProgress == null ? null : round2(bidToKeepProgress - values.contractValue);
    const bidToKeepEconomic = carryFactor < 1 ? round2(values.contractValue / (1 - carryFactor)) : null;
    const extraToKeepEconomic = bidToKeepEconomic == null ? null : round2(bidToKeepEconomic - values.contractValue);
    return {
      retainagePct: pct,
      current: pct === values.retainagePct,
      withheld,
      progressCash,
      carryingCost,
      economicNet,
      bidToKeepProgress,
      extraToKeepProgress,
      bidToKeepEconomic,
      extraToKeepEconomic,
      holdDays,
    };
  });
}

export function rateComparisonNote(rows, currency = '$') {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const current = rows.find((row) => row.current) || rows[rows.length - 1];
  const money = (value) => (value == null ? 'not modelable at 100% retainage' : `${currency}${value.toFixed(2)}`);
  return `At ${current.retainagePct.toFixed(1)}% retainage, keeping the same progress-payment cash as a no-retainage job means bidding ${money(current.bidToKeepProgress)} — ${money(current.extraToKeepProgress)} more. The modeled carrying cost of a ${current.holdDays}-day hold is ${money(current.carryingCost)}; matching that economic net only needs ${money(current.extraToKeepEconomic)} extra. Most contractors price the cash-now gap, not the interest. This is a planning model, not a contract reading.`;
}

export function delayScenarios(values, additionalDays = [30, 60, 90]) {
  const base = computeAll(values);
  return additionalDays.map(days => {
    const future = computeAll({ ...values, daysOutstanding: values.daysOutstanding + days });
    return {
      days,
      totalCashOutstanding: future.totalCashOutstanding,
      additionalCarryingCost: round2(future.carryingCost - base.carryingCost),
    };
  });
}

export function followUpDraft({ projectName, payerName, invoiceReference, dueDate, result, currency = '$' }) {
  const project = projectName?.trim() || '[project name]';
  const payer = payerName?.trim() || '[payer / GC name]';
  const invoice = invoiceReference?.trim() || '[invoice or pay application reference]';
  const due = dueDate?.trim() || '[due date]';
  const retainage = result.retainageStillUnpaid ?? result.retainageWithheld;
  return [`Subject: Payment status request — ${project}`, '', `Hello ${payer},`, '', `I am checking the payment status for ${invoice}, due ${due}. My records show ${currency}${result.earnedUnpaid.toFixed(2)} remains unpaid, including approximately ${currency}${retainage.toFixed(2)} in retainage based on the figures in my worksheet.`, '', 'Please confirm the expected payment date and let me know if any documentation is still needed from me. This is a factual account-record request, not a waiver of any rights or a demand for a particular legal remedy.', '', 'Thank you,', '[your name]', '', 'Review the figures, contract, payment terms, and local requirements before sending. This draft is not legal advice.'].join('\n');
}

export function worksheetSummary({ projectName, payerName, invoiceReference, dueDate, values, result, scenarios = [], rateRows = [] }) {
  const field = (label, value) => `${label}: ${String(value || '').trim() || '[not provided]'}`;
  return [
    'Construction retainage cash-flow worksheet',
    '============================================',
    field('Project', projectName),
    field('Payer / GC', payerName),
    field('Invoice / pay application', invoiceReference),
    field('Due date', dueDate),
    '',
    `Contract value: $${values.contractValue.toFixed(2)}`,
    `Retainage withheld (${values.retainagePct.toFixed(1)}%): $${result.retainageWithheld.toFixed(2)}`,
    `Retainage still unpaid: $${(result.retainageStillUnpaid ?? result.retainageWithheld).toFixed(2)}`,
    `Paid to date: $${values.paidToDate.toFixed(2)}`,
    `Earned but unpaid: $${result.earnedUnpaid.toFixed(2)}`,
    `Days since payment was due: ${values.daysOutstanding}`,
    `Annual carrying-cost assumption: ${values.annualCarryingRatePct.toFixed(1)}%`,
    `Modeled carrying cost: $${result.carryingCost.toFixed(2)}`,
    `Total modeled cash outstanding: $${result.totalCashOutstanding.toFixed(2)}`,
    ...(scenarios.length ? ['', 'Further-delay scenarios (modeled):', ...scenarios.map(s => `+${s.days} days: $${s.totalCashOutstanding.toFixed(2)} outstanding; $${s.additionalCarryingCost.toFixed(2)} added carrying cost`)] : []),
    ...(rateRows.length ? ['', `Retainage rate comparison (modeled on a ${rateRows[0].holdDays}-day hold):`, ...rateRows.map((row) => {
      const bid = row.bidToKeepProgress == null ? 'not modelable' : `$${row.bidToKeepProgress.toFixed(2)}`;
      const extra = row.extraToKeepProgress == null ? 'n/a' : `$${row.extraToKeepProgress.toFixed(2)}`;
      return `${row.retainagePct.toFixed(1)}%${row.current ? ' (this worksheet)' : ''}: withheld $${row.withheld.toFixed(2)}; progress cash $${row.progressCash.toFixed(2)}; bid to keep progress cash ${bid} (${extra} extra)`;
    }), rateComparisonNote(rateRows)] : []),
    '',
    'This is a private worksheet export, not advice or evidence of entitlement. Verify the figures, contract, payment terms, and local requirements before relying on it.'
  ].join('\n');
}

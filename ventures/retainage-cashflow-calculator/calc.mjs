const RELEASE_DEFAULTS = {
  percentComplete: 75,
  reductionAtPct: 50,
  reducedRetainagePct: 5,
};

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
  // Release-schedule fields are optional so existing worksheets and tests keep
  // working. Empty values fall back to the common 10%→5% at 50% complete rule
  // rather than failing a cash-snapshot that already has the required fields.
  const optionalNumber = (key, label, fallback, min = 0, max = 100) => {
    const value = raw[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      errors.push(`${label} must be between ${min} and ${max}.`);
      return fallback;
    }
    return parsed;
  };
  const contractValue = number('contractValue', 'Contract value');
  const retainagePct = number('retainagePct', 'Retainage percentage', 0, 100);
  const paidToDate = number('paidToDate', 'Paid to date');
  const daysOutstanding = number('daysOutstanding', 'Days outstanding');
  const annualCarryingRatePct = number('annualCarryingRatePct', 'Annual carrying-cost assumption', 0, 100);
  const percentComplete = optionalNumber('percentComplete', 'Percent complete', RELEASE_DEFAULTS.percentComplete);
  const reductionAtPct = optionalNumber('reductionAtPct', 'Retainage reduction point', RELEASE_DEFAULTS.reductionAtPct);
  const reducedRetainagePct = optionalNumber('reducedRetainagePct', 'Reduced retainage percentage', RELEASE_DEFAULTS.reducedRetainagePct);
  if (paidToDate > contractValue) errors.push('Paid to date cannot exceed contract value.');
  return errors.length ? { ok: false, errors } : {
    ok: true,
    values: {
      contractValue,
      retainagePct,
      paidToDate,
      daysOutstanding,
      annualCarryingRatePct,
      percentComplete,
      reductionAtPct,
      reducedRetainagePct,
    },
  };
}

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeAll(values) {
  const retainageWithheld = round2(values.contractValue * values.retainagePct / 100);
  const earnedUnpaid = round2(Math.max(0, values.contractValue - values.paidToDate));
  const retainageStillUnpaid = round2(Math.min(retainageWithheld, earnedUnpaid));
  const carryingCost = round2(earnedUnpaid * values.annualCarryingRatePct / 100 * values.daysOutstanding / 365);
  return { retainageWithheld, retainageStillUnpaid, earnedUnpaid, carryingCost, totalCashOutstanding: round2(earnedUnpaid + carryingCost) };
}

// Common AIA-style reduction: withhold the full retainage rate on completed
// work until a stated percent complete, then cap the remaining hold at a
// lower rate of the contract. This is a planning model — the contract wins.
export function releaseSchedule(values) {
  const percentComplete = values.percentComplete ?? RELEASE_DEFAULTS.percentComplete;
  const reductionAtPct = values.reductionAtPct ?? RELEASE_DEFAULTS.reductionAtPct;
  const reducedRetainagePct = values.reducedRetainagePct ?? RELEASE_DEFAULTS.reducedRetainagePct;
  const billed = round2(values.contractValue * percentComplete / 100);
  const progressRetainage = round2(billed * values.retainagePct / 100);
  const reducedHoldOnContract = round2(values.contractValue * reducedRetainagePct / 100);
  const pastReduction = percentComplete >= reductionAtPct;
  const properHold = pastReduction ? round2(Math.min(progressRetainage, reducedHoldOnContract)) : progressRetainage;
  const shouldHaveReleased = pastReduction ? round2(Math.max(0, progressRetainage - properHold)) : 0;
  // Before the reduction point, comparing full-contract retainage to the
  // progress hold would always look "overheld" on a young job. Only flag the
  // gap once the contract would typically have dropped the rate.
  const unpaid = computeAll(values);
  const overheld = pastReduction ? round2(Math.max(0, unpaid.retainageStillUnpaid - properHold)) : 0;
  return {
    percentComplete,
    reductionAtPct,
    reducedRetainagePct,
    billed,
    progressRetainage,
    properHold,
    shouldHaveReleased,
    overheld,
    pastReduction,
  };
}

export function releaseNote(schedule, currency = '$') {
  const money = amount => `${currency}${amount.toFixed(2)}`;
  if (!schedule.pastReduction) {
    return `At ${schedule.percentComplete}% complete, retainage has not yet reached the ${schedule.reductionAtPct}% reduction point. The modeled proper hold is ${money(schedule.properHold)} — the full rate on completed work. This is a planning model, not a contract reading.`;
  }
  if (schedule.shouldHaveReleased > 0) {
    return `At ${schedule.percentComplete}% complete, many contracts have already reduced retainage to ${schedule.reducedRetainagePct}%. About ${money(schedule.shouldHaveReleased)} of the progress retainage is typically already releasable. This is a planning model, not a contract reading.`;
  }
  return `At ${schedule.percentComplete}% complete, the modeled proper hold matches the reduced ${schedule.reducedRetainagePct}% rate. This is a planning model, not a contract reading.`;
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

export function worksheetSummary({ projectName, payerName, invoiceReference, dueDate, values, result, scenarios = [], release = null }) {
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
    ...(release ? [
      '',
      'Retainage reduction (modeled):',
      `Percent complete: ${release.percentComplete}%`,
      `Reduction point: ${release.reductionAtPct}% complete, then ${release.reducedRetainagePct}% retainage`,
      `Proper hold at this percent complete: $${release.properHold.toFixed(2)}`,
      `Typically already releasable: $${release.shouldHaveReleased.toFixed(2)}`,
      `Still held above the reduced rate: $${release.overheld.toFixed(2)}`,
    ] : []),
    '',
    'This is a private worksheet export, not advice or evidence of entitlement. Verify the figures, contract, payment terms, and local requirements before relying on it.'
  ].join('\n');
}

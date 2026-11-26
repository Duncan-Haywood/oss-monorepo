/**
 * Money as the result cards show it: thousands separators, two decimals, the
 * sign before the symbol ("-$4,802.74"), and no "-$0.00" from rounding.
 * Used by every note, draft and download so prose matches the tables.
 */
export function formatMoney(amount, currency = '$') {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const text = rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 && rounded > 0 ? '-' : ''}${currency}${text}`;
}

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
      errors.push(`${label} must be ${max === Infinity ? `${min} or more` : min === -Infinity ? `${max} or less` : `between ${min} and ${max}`}.`);
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
  const typicalHoldDays = optionalNumber('typicalHoldDays', 'Typical retainage hold (days)', 90, 0, Infinity);
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
      typicalHoldDays,
    },
  };
}

export function decodeDraft(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || Array.isArray(draft) || typeof draft !== 'object') return null;
    const values = Object.fromEntries(Object.entries(draft).filter(([, value]) => typeof value === 'string'));
    return parseInputs(values).ok ? values : null;
  } catch {
    return null;
  }
}

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeAll(values) {
  const retainageWithheld = round2(values.contractValue * values.retainagePct / 100);
  const earnedUnpaid = round2(Math.max(0, values.contractValue - values.paidToDate));
  const retainageStillUnpaid = round2(Math.min(retainageWithheld, earnedUnpaid));
  const unroundedDailyCarryingCost = earnedUnpaid * values.annualCarryingRatePct / 100 / 365;
  const dailyCarryingCost = round2(unroundedDailyCarryingCost);
  const thirtyDayDelayCost = round2(unroundedDailyCarryingCost * 30);
  const carryingCost = round2(unroundedDailyCarryingCost * values.daysOutstanding);
  return {
    retainageWithheld,
    retainageStillUnpaid,
    earnedUnpaid,
    dailyCarryingCost,
    thirtyDayDelayCost,
    carryingCost,
    totalCashOutstanding: round2(earnedUnpaid + carryingCost),
  };
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
  // How much retainage the GC is actually still sitting on, from this
  // worksheet's own figures: of the work billed so far, the retainage slice
  // is `progressRetainage`, and `billed - paidToDate` is everything not yet
  // received. Whichever is smaller is the retainage genuinely outstanding —
  // a GC behind on ordinary progress payments is not thereby holding extra
  // retainage, and a GC who has already released some is holding less.
  //
  // This used to read `computeAll(values).retainageStillUnpaid`, which is
  // `min(contractValue * rate, contractValue - paidToDate)` — both terms
  // measured against the *whole* contract, including work not yet performed.
  // On any job where the unbuilt remainder exceeds the full-contract
  // retainage (i.e. most jobs before the final draw) the min pinned to the
  // first term and `overheld` became a constant, completely insensitive to
  // what the customer had actually paid. Worked example on the shipped
  // defaults — $100k contract, 10% retainage, 80% complete, 5% reduced rate:
  // paid $67,500 / $70,000 / $72,000 / $75,000 all reported the same $5,000
  // "still held above the reduced rate", including the $75,000 case where
  // the GC is holding $5,000 against a proper hold of exactly $5,000 and is
  // over-withholding nothing at all. Telling a subcontractor a customer is
  // sitting on $5,000 they are entitled to, when the customer is holding
  // precisely what the modeled rule allows, is the one number in this
  // section it is worst to get wrong.
  const retainageHeldToDate = round2(Math.max(0, Math.min(progressRetainage, billed - values.paidToDate)));
  // Before the reduction point the full rate is the proper hold, so there is
  // nothing to be "above" — the gap only becomes meaningful once the contract
  // would typically have dropped the rate.
  const overheld = pastReduction ? round2(Math.max(0, retainageHeldToDate - properHold)) : 0;
  return {
    percentComplete,
    reductionAtPct,
    reducedRetainagePct,
    billed,
    progressRetainage,
    retainageHeldToDate,
    properHold,
    shouldHaveReleased,
    overheld,
    pastReduction,
  };
}

export function releaseNote(schedule, currency = '$') {
  const money = amount => `${formatMoney(amount, currency)}`;
  if (!schedule.pastReduction) {
    return `At ${schedule.percentComplete}% complete, retainage has not yet reached the ${schedule.reductionAtPct}% reduction point. The modeled proper hold is ${money(schedule.properHold)} — the full rate on completed work. This is a planning model, not a contract reading.`;
  }
  if (schedule.shouldHaveReleased > 0) {
    return `At ${schedule.percentComplete}% complete, many contracts have already reduced retainage to ${schedule.reducedRetainagePct}%. About ${money(schedule.shouldHaveReleased)} of the progress retainage is typically already releasable. This is a planning model, not a contract reading.`;
  }
  return `At ${schedule.percentComplete}% complete, the modeled proper hold matches the reduced ${schedule.reducedRetainagePct}% rate. This is a planning model, not a contract reading.`;
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
  const money = (value) => (value == null ? 'not modelable at 100% retainage' : `${formatMoney(value, currency)}`);
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

function requireNonNegativeNumber(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${label} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function requireNonNegativeInteger(value, label) {
  const parsed = requireNonNegativeNumber(value, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number of days.`);
  }
  return parsed;
}

function carryingOnPrincipal(principal, annualCarryingRatePct, days) {
  return round2(principal * annualCarryingRatePct / 100 * days / 365);
}

/**
 * A GC check today vs waiting for the rest of retainage. Carrying cost is
 * applied only to the retainage still unpaid — the cash in the offer — not
 * to other earned-but-unpaid progress. Delay scenarios still model the
 * whole unpaid balance.
 *
 * Three paths, because the same check can mean two different deals:
 * - waive: take the check and close the rest (lien waiver / discounted payoff)
 * - accelerate: take the check; the remainder still arrives after waitDays
 * - wait: sit the full retainage for waitDays
 */
export function comparePartialReleaseOffer(values, options = {}) {
  const partialOffer = round2(requireNonNegativeNumber(options.partialOffer, 'Partial retainage offer'));
  const waitDays = requireNonNegativeInteger(options.waitDays ?? 60, 'Days until full retainage');
  const fullRelease = computeAll(values).retainageStillUnpaid;
  const remainder = round2(Math.max(0, fullRelease - partialOffer));
  const carryingOnFull = carryingOnPrincipal(fullRelease, values.annualCarryingRatePct, waitDays);
  const carryingOnRemainder = carryingOnPrincipal(remainder, values.annualCarryingRatePct, waitDays);

  const waive = {
    path: 'waive',
    label: 'Take the check, close the rest',
    cash: partialOffer,
    additionalCarrying: 0,
    net: partialOffer,
  };
  const accelerate = {
    path: 'accelerate',
    label: waitDays === 0 ? 'Take the check; rest also due today' : `Take the check, rest in ${waitDays} days`,
    cash: fullRelease,
    additionalCarrying: carryingOnRemainder,
    net: round2(fullRelease - carryingOnRemainder),
  };
  const wait = {
    path: 'wait',
    label: waitDays === 0 ? 'Collect full retainage today' : `Wait ${waitDays} days for full retainage`,
    cash: fullRelease,
    additionalCarrying: carryingOnFull,
    net: round2(fullRelease - carryingOnFull),
  };
  const rows = [waive, accelerate, wait];
  const bestNet = Math.max(...rows.map(row => row.net));
  const leaders = rows.filter(row => Math.abs(row.net - bestNet) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].path : 'tie';

  return {
    partialOffer,
    fullRelease,
    remainder,
    waitDays,
    rows,
    waive,
    accelerate,
    wait,
    winner,
    breakEvenPartialOffer: wait.net,
    accelerateVsWait: round2(accelerate.net - wait.net),
    waiveVsWait: round2(waive.net - wait.net),
  };
}

/**
 * Arithmetic only. Does not tell the contractor to accept, refuse, or sign.
 */
export function partialReleaseNote(comparison) {
  if (!comparison?.waive || !comparison?.accelerate || !comparison?.wait) {
    throw new Error('Partial-release comparison is missing rows');
  }
  const money = (value) => {
    const format = (value) => `${formatMoney(value)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const { partialOffer, fullRelease, remainder, waitDays, waive, accelerate, wait } = comparison;
  const waitPhrase = waitDays === 0
    ? `Full retainage available today is ${money(fullRelease)}.`
    : `Waiting ${waitDays} days for ${money(fullRelease)} models ${money(wait.additionalCarrying)} more carrying cost on that retainage, leaving ${money(wait.net)}.`;
  const waivePhrase = comparison.waiveVsWait >= 0
    ? `A ${money(partialOffer)} check that closes the rest is ${money(Math.abs(comparison.waiveVsWait))} ahead of that wait on these assumptions.`
    : `A ${money(partialOffer)} check that closes the rest is ${money(Math.abs(comparison.waiveVsWait))} behind that wait — the break-even check that matches waiting is ${money(comparison.breakEvenPartialOffer)}.`;
  const acceleratePhrase = remainder <= 0
    ? `The typed check already covers the unpaid retainage, so there is no remainder to wait for.`
    : `If the remaining ${money(remainder)} still arrives in ${waitDays} days, taking the check now leaves ${money(accelerate.net)} after ${money(accelerate.additionalCarrying)} carrying on the remainder — ${money(comparison.accelerateVsWait)} ahead of waiting for the whole balance.`;
  return `${waitPhrase} ${waivePhrase} ${acceleratePhrase} This is modeled carrying cost on the retainage still unpaid, not interest, a lien right, or a reason to sign a waiver.`;
}

export function followUpDraft({ projectName, payerName, invoiceReference, dueDate, result, currency = '$' }) {
  const project = projectName?.trim() || '[project name]';
  const payer = payerName?.trim() || '[payer / GC name]';
  const invoice = invoiceReference?.trim() || '[invoice or pay application reference]';
  const due = dueDate?.trim() || '[due date]';
  const retainage = result.retainageStillUnpaid ?? result.retainageWithheld;
  const delayLine = Number.isFinite(result.dailyCarryingCost) && Number.isFinite(result.thirtyDayDelayCost)
    ? `Using my carrying-cost assumption, each additional day represents approximately ${formatMoney(result.dailyCarryingCost, currency)} in modeled carrying cost; a 30-day delay would model approximately ${formatMoney(result.thirtyDayDelayCost, currency)}.`
    : null;
  return [
    `Subject: Payment status request — ${project}`,
    '',
    `Hello ${payer},`,
    '',
    `I am checking the payment status for ${invoice}, due ${due}. My records show ${formatMoney(result.earnedUnpaid, currency)} remains unpaid, including approximately ${formatMoney(retainage, currency)} in retainage based on the figures in my worksheet.`,
    ...(delayLine ? [delayLine] : []),
    '',
    'Please confirm the expected payment date and let me know if any documentation is still needed from me. This is a factual account-record request, not a waiver of any rights or a demand for a particular legal remedy.',
    '',
    'Thank you,',
    '[your name]',
    '',
    'Review the figures, contract, payment terms, and local requirements before sending. This draft is not legal advice.',
  ].join('\n');
}

export function worksheetSummary({ projectName, payerName, invoiceReference, dueDate, values, result, scenarios = [], release = null, partialRelease = null, rateRows = [] }) {
  const field = (label, value) => `${label}: ${String(value || '').trim() || '[not provided]'}`;
  return [
    'Construction retainage cash-flow worksheet',
    '============================================',
    field('Project', projectName),
    field('Payer / GC', payerName),
    field('Invoice / pay application', invoiceReference),
    field('Due date', dueDate),
    '',
    `Contract value: ${formatMoney(values.contractValue)}`,
    `Retainage withheld (${values.retainagePct.toFixed(1)}%): ${formatMoney(result.retainageWithheld)}`,
    `Retainage still unpaid: ${formatMoney((result.retainageStillUnpaid ?? result.retainageWithheld))}`,
    `Paid to date: ${formatMoney(values.paidToDate)}`,
    `Earned but unpaid: ${formatMoney(result.earnedUnpaid)}`,
    `Days since payment was due: ${values.daysOutstanding}`,
    `Annual carrying-cost assumption: ${values.annualCarryingRatePct.toFixed(1)}%`,
    ...(Number.isFinite(result.dailyCarryingCost) ? [`Modeled cost per additional day: ${formatMoney(result.dailyCarryingCost)}`] : []),
    ...(Number.isFinite(result.thirtyDayDelayCost) ? [`Modeled cost of another 30 days: ${formatMoney(result.thirtyDayDelayCost)}`] : []),
    `Modeled carrying cost: ${formatMoney(result.carryingCost)}`,
    `Total modeled cash outstanding: ${formatMoney(result.totalCashOutstanding)}`,
    ...(scenarios.length ? ['', 'Further-delay scenarios (modeled):', ...scenarios.map(s => `+${s.days} days: ${formatMoney(s.totalCashOutstanding)} outstanding; ${formatMoney(s.additionalCarryingCost)} added carrying cost`)] : []),
    ...(release ? [
      '',
      'Retainage reduction (modeled):',
      `Percent complete: ${release.percentComplete}%`,
      `Reduction point: ${release.reductionAtPct}% complete, then ${release.reducedRetainagePct}% retainage`,
      `Proper hold at this percent complete: ${formatMoney(release.properHold)}`,
      `Retainage withheld to date: ${formatMoney(release.retainageHeldToDate)}`,
      `Typically already releasable: ${formatMoney(release.shouldHaveReleased)}`,
      `Still held above the reduced rate: ${formatMoney(release.overheld)}`,
    ] : []),
    ...(partialRelease ? ['', 'Partial retainage offer (modeled):', `Typed check today: ${formatMoney(partialRelease.partialOffer)}`, `Days until full retainage: ${partialRelease.waitDays}`, ...partialRelease.rows.map(row => `${row.label}: cash ${formatMoney(row.cash)}; added carrying ${formatMoney(row.additionalCarrying)}; net ${formatMoney(row.net)}`), `Break-even check that matches waiting: ${formatMoney(partialRelease.breakEvenPartialOffer)}`, partialReleaseNote(partialRelease)] : []),
    ...(rateRows.length ? ['', `Retainage rate comparison (modeled on a ${rateRows[0].holdDays}-day hold):`, ...rateRows.map((row) => {
      const bid = row.bidToKeepProgress == null ? 'not modelable' : `${formatMoney(row.bidToKeepProgress)}`;
      const extra = row.extraToKeepProgress == null ? 'n/a' : `${formatMoney(row.extraToKeepProgress)}`;
      return `${row.retainagePct.toFixed(1)}%${row.current ? ' (this worksheet)' : ''}: withheld ${formatMoney(row.withheld)}; progress cash ${formatMoney(row.progressCash)}; bid to keep progress cash ${bid} (${extra} extra)`;
    }), rateComparisonNote(rateRows)] : []),
    '',
    'This is a private worksheet export, not advice or evidence of entitlement. Verify the figures, contract, payment terms, and local requirements before relying on it.'
  ].join('\n');
}

export function evidenceSnapshot({ inputs, result, projectName = '', payerName = '', invoiceReference = '', dueDate = '' }) {
  const { inputs: _resultInputs, values: _resultValues, ...modeledResults } = result;
  return {
    exportedAt: new Date().toISOString(),
    product: 'construction-retainage-calculator',
    project: { projectName: projectName.trim(), payerName: payerName.trim(), invoiceReference: invoiceReference.trim(), dueDate: dueDate.trim() },
    inputs,
    modeledResults,
    note: 'User-provided inputs and deterministic modeled results. Review against the contract and records; this is not legal, tax, financial, or engineering advice.'
  };
}

export function paymentScheduleSummary(rows, currency = '$') {
  const validRows = rows.filter(row => String(row.label || '').trim() || row.billed || row.paid);
  if (!validRows.length) return 'No payment milestones provided.';
  const lines = validRows.map((row, index) => {
    const billed = Number(row.billed) || 0;
    const paid = Number(row.paid) || 0;
    const outstanding = Math.max(0, billed - paid);
    return `${index + 1}. ${String(row.label || '').trim() || `Milestone ${index + 1}`} | billed ${formatMoney(billed, currency)} | paid ${formatMoney(paid, currency)} | outstanding ${formatMoney(outstanding, currency)}`;
  });
  return ['Payment milestone schedule', '=========================', ...lines, '', 'Review this schedule against invoices, payment applications, and bank records before relying on it.'].join('\n');
}

export function summaryText({ projectName, result, currency = '$' }) {
  const project = projectName?.trim() || '[project name]';
  const stillUnpaid = result.retainageStillUnpaid ?? result.retainageWithheld;
  return [
    `Retainage cash-flow summary: ${project}`,
    `Retainage withheld: ${formatMoney(result.retainageWithheld, currency)}`,
    `Retainage still unpaid: ${formatMoney(stillUnpaid, currency)}`,
    `Earned but unpaid: ${formatMoney(result.earnedUnpaid, currency)}`,
    `Modeled carrying cost: ${formatMoney(result.carryingCost, currency)}`,
    `Total modeled cash outstanding: ${formatMoney(result.totalCashOutstanding, currency)}`,
    '',
    'Numbers-only snapshot for a bookkeeper. The full worksheet export includes delay scenarios, release math, and the follow-up draft. Scenario only. Review the contract, payment terms, and local requirements. Not legal, tax, financial, or engineering advice.',
  ].join('\n');
}

export function cashFlowRecordText({ projectName, invoiceReference, dueDate, result, currency = '$', generatedDate = new Date().toISOString().slice(0, 10) }) {
  const project = projectName?.trim() || '[project name]';
  const invoice = invoiceReference?.trim() || '[invoice or pay application reference]';
  const due = dueDate?.trim() || '[due date]';
  return [
    'CONSTRUCTION RETAINAGE CASH-FLOW RECORD',
    `Generated: ${generatedDate}`,
    `Project: ${project}`,
    `Invoice / pay application: ${invoice}`,
    `Payment due: ${due}`,
    '',
    `Retainage withheld: ${formatMoney(result.retainageWithheld, currency)}`,
    `Earned but unpaid: ${formatMoney(result.earnedUnpaid, currency)}`,
    `Modeled carrying cost: ${formatMoney(result.carryingCost, currency)}`,
    `Total modeled cash outstanding: ${formatMoney(result.totalCashOutstanding, currency)}`,
    '',
    'This is a user-entered scenario and account-record aid, not a determination of interest, payment deadline, lien right, entitlement, or legal remedy.',
    'Review the figures and supporting records before relying on or sharing this record.'
  ].join('\n');
}

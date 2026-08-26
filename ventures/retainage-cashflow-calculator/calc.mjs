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
  if (paidToDate > contractValue) errors.push('Paid to date cannot exceed contract value.');
  return errors.length ? { ok: false, errors } : { ok: true, values: { contractValue, retainagePct, paidToDate, daysOutstanding, annualCarryingRatePct } };
}

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeAll(values) {
  const retainageWithheld = round2(values.contractValue * values.retainagePct / 100);
  const earnedUnpaid = round2(Math.max(0, values.contractValue - values.paidToDate));
  const retainageStillUnpaid = round2(Math.min(retainageWithheld, earnedUnpaid));
  const carryingCost = round2(earnedUnpaid * values.annualCarryingRatePct / 100 * values.daysOutstanding / 365);
  return { retainageWithheld, retainageStillUnpaid, earnedUnpaid, carryingCost, totalCashOutstanding: round2(earnedUnpaid + carryingCost) };
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
  const money = value => `$${value.toFixed(2)}`;
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
  return [`Subject: Payment status request — ${project}`, '', `Hello ${payer},`, '', `I am checking the payment status for ${invoice}, due ${due}. My records show ${currency}${result.earnedUnpaid.toFixed(2)} remains unpaid, including approximately ${currency}${retainage.toFixed(2)} in retainage based on the figures in my worksheet.`, '', 'Please confirm the expected payment date and let me know if any documentation is still needed from me. This is a factual account-record request, not a waiver of any rights or a demand for a particular legal remedy.', '', 'Thank you,', '[your name]', '', 'Review the figures, contract, payment terms, and local requirements before sending. This draft is not legal advice.'].join('\n');
}

export function worksheetSummary({ projectName, payerName, invoiceReference, dueDate, values, result, scenarios = [], partialRelease = null }) {
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
    ...(partialRelease ? ['', 'Partial retainage offer (modeled):', `Typed check today: $${partialRelease.partialOffer.toFixed(2)}`, `Days until full retainage: ${partialRelease.waitDays}`, ...partialRelease.rows.map(row => `${row.label}: cash $${row.cash.toFixed(2)}; added carrying $${row.additionalCarrying.toFixed(2)}; net $${row.net.toFixed(2)}`), `Break-even check that matches waiting: $${partialRelease.breakEvenPartialOffer.toFixed(2)}`, partialReleaseNote(partialRelease)] : []),
    '',
    'This is a private worksheet export, not advice or evidence of entitlement. Verify the figures, contract, payment terms, and local requirements before relying on it.'
  ].join('\n');
}

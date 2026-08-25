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
  const carryingCost = round2(earnedUnpaid * values.annualCarryingRatePct / 100 * values.daysOutstanding / 365);
  return { retainageWithheld, earnedUnpaid, carryingCost, totalCashOutstanding: round2(earnedUnpaid + carryingCost) };
}

export function followUpDraft({ projectName, payerName, invoiceReference, dueDate, result, currency = '$' }) {
  const project = projectName?.trim() || '[project name]';
  const payer = payerName?.trim() || '[payer / GC name]';
  const invoice = invoiceReference?.trim() || '[invoice or pay application reference]';
  const due = dueDate?.trim() || '[due date]';
  return [`Subject: Payment status request — ${project}`, '', `Hello ${payer},`, '', `I am checking the payment status for ${invoice}, due ${due}. My records show ${currency}${result.earnedUnpaid.toFixed(2)} remains unpaid, including approximately ${currency}${result.retainageWithheld.toFixed(2)} in retainage based on the figures in my worksheet.`, '', 'Please confirm the expected payment date and let me know if any documentation is still needed from me. This is a factual account-record request, not a waiver of any rights or a demand for a particular legal remedy.', '', 'Thank you,', '[your name]', '', 'Review the figures, contract, payment terms, and local requirements before sending. This draft is not legal advice.'].join('\n');
}

export function parseInputs(raw) {
  const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value)]));
  const required = ['annualExpenses', 'rentableArea', 'tenantArea', 'billedAmount', 'credits'];
  const errors = required.filter((key) => !Number.isFinite(values[key]) || values[key] < 0).map((key) => `${key} must be zero or greater.`);
  if (values.rentableArea <= 0) errors.push('rentableArea must be greater than zero.');
  if (values.tenantArea > values.rentableArea) errors.push('tenantArea cannot exceed rentableArea.');
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

export function reconcile({ annualExpenses, rentableArea, tenantArea, billedAmount, credits }) {
  const share = tenantArea / rentableArea;
  const modeledShare = annualExpenses * share;
  const netBilled = billedAmount - credits;
  const variance = modeledShare - netBilled;
  return { share, modeledShare, netBilled, variance, monthlyVariance: variance / 12 };
}

export function reviewItems(result) {
  const items = ['Confirm the expense total uses the lease year and the statement period.', 'Confirm rentable area and tenant area match the lease or current statement.', 'Compare each included expense category with the lease terms and supporting invoices.'];
  if (result.variance > 0.005) items.push('The modeled share is above net billed; review whether a balance is being requested and whether credits were entered correctly.');
  else if (result.variance < -0.005) items.push('Net billed is above the modeled share; review whether estimates, prior payments, or credits were entered correctly.');
  else items.push('The modeled share and net billed amount are approximately equal; retain the inputs and supporting statement for your records.');
  return items;
}

export function summary(result) {
  return [`CAM reconciliation worksheet`, `Tenant area share: ${(result.share * 100).toFixed(2)}%`, `Modeled tenant share: $${result.modeledShare.toFixed(2)}`, `Net billed after credits: $${result.netBilled.toFixed(2)}`, `Variance (modeled less billed): $${result.variance.toFixed(2)}`, `Monthly equivalent: $${result.monthlyVariance.toFixed(2)}`, '', 'Review checklist:', ...reviewItems(result).map((item) => `- ${item}`), '', 'This is a math worksheet, not a lease interpretation or payment demand.'].join('\n');
}

export function reviewRecord(result) {
  return {
    format: 'cam-reconciliation-review',
    version: 1,
    calculations: {
      tenantAreaShare: result.share,
      modeledTenantShare: result.modeledShare,
      netBilledAfterCredits: result.netBilled,
      varianceModeledLessBilled: result.variance,
      monthlyEquivalent: result.monthlyVariance,
    },
    reviewChecklist: reviewItems(result),
    scope: 'Arithmetic worksheet only; not a lease interpretation, payment demand, legal advice, or compliance conclusion.',
  };
}

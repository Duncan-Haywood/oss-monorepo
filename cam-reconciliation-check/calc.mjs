// A blank gross-up field has to mean "not entered", not "zero" -- Number('')
// is 0, and 0% actual occupancy would divide by zero below. Falling back to
// the no-op default here keeps every existing caller (including the
// square-footage table's direct reconcile() calls) producing exactly the
// same figures it always did.
function blankToDefault(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return Number(value);
}

export function parseInputs(raw) {
  const required = ['annualExpenses', 'rentableArea', 'tenantArea', 'billedAmount', 'credits'];
  const values = Object.fromEntries(required.map((key) => [key, Number(raw[key])]));
  const errors = required.filter((key) => !Number.isFinite(values[key]) || values[key] < 0).map((key) => `${key} must be zero or greater.`);
  if (values.rentableArea <= 0) errors.push('rentableArea must be greater than zero.');
  if (values.tenantArea > values.rentableArea) errors.push('tenantArea cannot exceed rentableArea.');

  // Gross-up is opt-in and defaults to a complete no-op (0% variable, both
  // occupancy figures at 100%) so a visitor who never touches these fields
  // sees the same reconciliation this tool has always produced.
  const variablePercent = blankToDefault(raw.variablePercent, 0);
  const actualOccupancyPercent = blankToDefault(raw.actualOccupancyPercent, 100);
  const targetOccupancyPercent = blankToDefault(raw.targetOccupancyPercent, 100);
  if (!Number.isFinite(variablePercent) || variablePercent < 0 || variablePercent > 100) {
    errors.push('variablePercent must be between 0 and 100.');
  }
  if (!Number.isFinite(actualOccupancyPercent) || actualOccupancyPercent <= 0 || actualOccupancyPercent > 100) {
    errors.push('actualOccupancyPercent must be greater than zero and no more than 100.');
  }
  if (!Number.isFinite(targetOccupancyPercent) || targetOccupancyPercent <= 0 || targetOccupancyPercent > 100) {
    errors.push('targetOccupancyPercent must be greater than zero and no more than 100.');
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, values: { ...values, variablePercent, actualOccupancyPercent, targetOccupancyPercent } };
}

/**
 * Most net leases let a landlord "gross up" the occupancy-sensitive share of
 * CAM (utilities, janitorial -- the costs that track how many suites are
 * occupied, not the fixed ones like a management fee or roof reserve) to what
 * it would have cost at a stated target occupancy, usually 95%. Without it, a
 * tenant in a building running well under that target pays a share of
 * expenses that were never adjusted for the vacancy, which understates the
 * modeled amount for a fully-tenanted year -- exactly the kind of gap this
 * tool exists to surface before a payment conversation, not just the mirror
 * image (an overcharge).
 *
 * The clause only ever raises the pool toward the target, so it must not
 * fire, and must not silently shrink expenses, once actual occupancy already
 * meets or beats the target -- that is why the factor clamps to 1 instead of
 * going below it.
 */
export function reconcile({
  annualExpenses,
  rentableArea,
  tenantArea,
  billedAmount,
  credits,
  variablePercent = 0,
  actualOccupancyPercent = 100,
  targetOccupancyPercent = 100,
}) {
  const share = tenantArea / rentableArea;
  const variableExpenses = annualExpenses * (variablePercent / 100);
  const fixedExpenses = annualExpenses - variableExpenses;
  const grossUpFactor = actualOccupancyPercent < targetOccupancyPercent
    ? targetOccupancyPercent / actualOccupancyPercent
    : 1;
  const grossedUpVariableExpenses = variableExpenses * grossUpFactor;
  const effectiveExpenses = fixedExpenses + grossedUpVariableExpenses;
  const grossUpApplied = grossUpFactor > 1;
  const grossUpAdjustment = effectiveExpenses - annualExpenses;
  const modeledShare = effectiveExpenses * share;
  const netBilled = billedAmount - credits;
  const variance = modeledShare - netBilled;
  return {
    share,
    modeledShare,
    netBilled,
    variance,
    monthlyVariance: variance / 12,
    variablePercent,
    actualOccupancyPercent,
    targetOccupancyPercent,
    variableExpenses,
    fixedExpenses,
    effectiveExpenses,
    grossUpFactor,
    grossUpApplied,
    grossUpAdjustment,
  };
}

export function reviewItems(result) {
  const items = ['Confirm the expense total uses the lease year and the statement period.', 'Confirm rentable area and tenant area match the lease or current statement.', 'Compare each included expense category with the lease terms and supporting invoices.'];
  if (result.grossUpApplied) {
    items.push(`Modeled expenses include a gross-up: the variable share was adjusted from ${result.actualOccupancyPercent.toFixed(1)}% actual occupancy to a ${result.targetOccupancyPercent.toFixed(1)}% target, adding $${result.grossUpAdjustment.toFixed(2)} to the expense pool before the area share was applied. Confirm the lease's own clause allows a gross-up, at this target occupancy, on this share of expenses as variable.`);
  }
  if (result.variance > 0.005) items.push('The modeled share is above net billed; review whether a balance is being requested and whether credits were entered correctly.');
  else if (result.variance < -0.005) items.push('Net billed is above the modeled share; review whether estimates, prior payments, or credits were entered correctly.');
  else items.push('The modeled share and net billed amount are approximately equal; retain the inputs and supporting statement for your records.');
  return items;
}

/**
 * `variance` and `monthlyVariance` are the one pair of figures here that can
 * be negative -- and a perfectly reconciled statement (modeled share billed
 * to the exact cent) routinely lands them a fraction of a cent either side
 * of zero from floating-point subtraction, not from an actual shortfall. A
 * plain `.toFixed(2)` still prints that residual's sign -- `(-0.002).toFixed(2)`
 * is `"-0.00"` -- which reads as "you are down money" on a worksheet whose
 * whole point is telling a tenant whether they are.
 *
 * Two fixes in one, because a naive rewrite of one reintroduces the other:
 * rounding to cents first and comparing to `0` (not `< 0`) catches -0 as well
 * as a genuine sub-cent residual (`-0 === 0` in JS), giving the printed
 * figure the same `±0.005` tolerance `reviewItems` already applies to the
 * checklist wording. And the sign has to sit outside the `$`, on the whole
 * returned string, rather than inside it from interpolating a signed number
 * straight after a literal `$` in the caller's template (`` $${(-500).toFixed(2)} ``
 * prints `"$-500.00"`) -- the same defect `check_money_sign.py` guards named
 * `money`-shaped formatters against, reached here by an inline call this
 * function's own name doesn't match.
 */
function moneyText(n) {
  const cents = Math.round(n * 100);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function summary(result) {
  const grossUpLines = result.grossUpApplied
    ? [`Gross-up applied: variable expenses $${result.variableExpenses.toFixed(2)} at ${result.actualOccupancyPercent.toFixed(1)}% occupancy grossed to ${result.targetOccupancyPercent.toFixed(1)}%, adding $${result.grossUpAdjustment.toFixed(2)}`, `Effective annual expenses used in the model: $${result.effectiveExpenses.toFixed(2)}`]
    : [];
  return [`CAM reconciliation worksheet`, `Tenant area share: ${(result.share * 100).toFixed(2)}%`, ...grossUpLines, `Modeled tenant share: $${result.modeledShare.toFixed(2)}`, `Net billed after credits: $${result.netBilled.toFixed(2)}`, `Variance (modeled less billed): ${moneyText(result.variance)}`, `Monthly equivalent: ${moneyText(result.monthlyVariance)}`, '', 'Review checklist:', ...reviewItems(result).map((item) => `- ${item}`), '', 'This is a math worksheet, not a lease interpretation or payment demand.'].join('\n');
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
    grossUp: {
      applied: result.grossUpApplied,
      variablePercent: result.variablePercent,
      actualOccupancyPercent: result.actualOccupancyPercent,
      targetOccupancyPercent: result.targetOccupancyPercent,
      variableExpenses: result.variableExpenses,
      effectiveAnnualExpenses: result.effectiveExpenses,
      adjustment: result.grossUpAdjustment,
    },
    reviewChecklist: reviewItems(result),
    scope: 'Arithmetic worksheet only; not a lease interpretation, payment demand, legal advice, or compliance conclusion.',
  };
}

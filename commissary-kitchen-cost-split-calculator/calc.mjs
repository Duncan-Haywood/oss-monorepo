// Deterministic cost-split arithmetic for a commissary/shared-kitchen
// operator, or a lead tenant coordinating with others, who needs to divide
// pooled monthly kitchen costs (rent, utilities, trash, cleaning, pest
// control, insurance, etc.) fairly among several food-truck/mobile-vendor
// tenants who use the space unevenly, instead of splitting evenly or
// negotiating it by eye every month.
//
//   resolvePoolTotalCents(inputs) — the pool total in integer cents, either
//                                    the sum of itemized cost rows or a
//                                    manual override total if one is given.
//   allocateCents(totalCents, weights) — largest-remainder allocation of an
//                                    integer cent amount across weights that
//                                    sum to ~1, guaranteed to sum back to
//                                    exactly `totalCents`.
//   computeSplit(inputs)          — the full per-tenant bill: each tenant's
//                                    flat base fee plus their proportional
//                                    share of the pool remaining after every
//                                    base fee is collected, split by hours
//                                    booked, storage units used, a weighted
//                                    blend of the two, or an equal split.
//
// Money is tracked in integer cents everywhere inside `computeSplit` so the
// per-tenant totals sum EXACTLY to the pool total -- floating-point
// proportional shares (e.g. dividing $1000 three ways) would otherwise leave
// a fraction of a cent unaccounted for. Dollar amounts only appear at the
// input and output boundary.

export const DEFAULTS = {
  costItems: [
    { label: 'Rent', amount: 3200 },
    { label: 'Utilities (electric, gas, water)', amount: 650 },
    { label: 'Trash and grease removal', amount: 240 },
    { label: 'Commercial cleaning service', amount: 300 },
    { label: 'Pest control', amount: 110 },
    { label: 'Liability insurance (shared)', amount: 500 },
  ],
  manualPoolTotal: null,
  tenants: [
    { name: 'Truck 1', hoursBooked: 40, dryStorageUnits: 2, refrigeratedUnits: 1, freezerUnits: 1, baseFee: 75 },
    { name: 'Truck 2', hoursBooked: 25, dryStorageUnits: 1, refrigeratedUnits: 1, freezerUnits: 0, baseFee: 75 },
    { name: 'Truck 3', hoursBooked: 15, dryStorageUnits: 1, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 75 },
  ],
  splitMethod: 'blend',
  blendWeights: { hours: 0.7, storage: 0.3 },
};

export const SPLIT_METHODS = ['hours', 'storage', 'blend', 'equal'];

function number(value, label, { min = 0, max = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  if (parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  return parsed;
}

/** Dollars to integer cents, rounded -- the boundary between float dollar
 * inputs and the integer-cent arithmetic everything else here relies on. */
function toCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Validate and normalize the itemized cost rows, dropping any row with a
 * blank label -- the UI's way of representing "unused row" without a
 * separate empty-state flag, matching the blank-row convention other
 * ventures in this repo use for optional table rows.
 */
function normalizeCostItems(costItems) {
  if (!Array.isArray(costItems)) return [];
  return costItems
    .filter((c) => c && String(c.label ?? '').trim() !== '')
    .map((c, i) => {
      const label = String(c.label).trim();
      const amount = number(c.amount, `${label || `Cost item ${i + 1}`} amount`);
      return { label, amount };
    });
}

/**
 * The pool total in integer cents: a manual override total if one is
 * supplied (not null/undefined/empty string), otherwise the sum of the
 * itemized cost rows converted to cents individually and summed as integers
 * -- summing cents rather than summing dollar floats and converting once
 * keeps this exact regardless of how many rows are entered.
 */
export function resolvePoolTotalCents(inputs) {
  const hasManualTotal = inputs.manualPoolTotal !== null && inputs.manualPoolTotal !== undefined && inputs.manualPoolTotal !== '';
  if (hasManualTotal) {
    return toCents(number(inputs.manualPoolTotal, 'Manual pool total'));
  }
  const items = normalizeCostItems(inputs.costItems ?? []);
  return items.reduce((sum, c) => sum + toCents(c.amount), 0);
}

/**
 * Validate and normalize the tenant list. Storage is tracked as simple
 * per-category unit counts (dry/refrigerated/freezer), summed into
 * `totalStorageUnits` for the storage-based split -- the categories matter
 * for the operator filling the form in, not for weighting one kind of shelf
 * space against another, which this tool does not attempt to price.
 */
function normalizeTenants(tenants) {
  if (!Array.isArray(tenants)) throw new Error('Tenants must be a list.');
  const rows = tenants.filter((t) => t && String(t.name ?? '').trim() !== '');
  if (rows.length === 0) throw new Error('Add at least one tenant.');
  return rows.map((t, i) => {
    const name = String(t.name).trim() || `Tenant ${i + 1}`;
    const hoursBooked = number(t.hoursBooked, `${name} hours booked`);
    const dryStorageUnits = number(t.dryStorageUnits, `${name} dry storage units`);
    const refrigeratedUnits = number(t.refrigeratedUnits, `${name} refrigerated storage units`);
    const freezerUnits = number(t.freezerUnits, `${name} freezer storage units`);
    const baseFeeCents = toCents(number(t.baseFee ?? 0, `${name} base fee`));
    const totalStorageUnits = dryStorageUnits + refrigeratedUnits + freezerUnits;
    return { name, hoursBooked, dryStorageUnits, refrigeratedUnits, freezerUnits, totalStorageUnits, baseFeeCents };
  });
}

/**
 * Each tenant's share (0-1) of a pool, by the chosen method. If the values a
 * method needs are all zero (e.g. every tenant left hours blank while using
 * the storage-only split, or there is only one tenant), it falls back to an
 * equal split rather than dividing by zero -- the same fallback the "equal"
 * method itself uses on purpose.
 */
function computeWeights(tenants, splitMethod, blendWeights) {
  const n = tenants.length;
  const equalShares = () => tenants.map(() => 1 / n);
  const shareBy = (values) => {
    const total = values.reduce((a, b) => a + b, 0);
    return total === 0 ? equalShares() : values.map((v) => v / total);
  };

  if (splitMethod === 'equal') return equalShares();

  const hoursShares = shareBy(tenants.map((t) => t.hoursBooked));
  if (splitMethod === 'hours') return hoursShares;

  const storageShares = shareBy(tenants.map((t) => t.totalStorageUnits));
  if (splitMethod === 'storage') return storageShares;

  if (splitMethod === 'blend') {
    const hoursWeight = number(blendWeights?.hours ?? DEFAULTS.blendWeights.hours, 'Hours weight');
    const storageWeight = number(blendWeights?.storage ?? DEFAULTS.blendWeights.storage, 'Storage weight');
    const totalWeight = hoursWeight + storageWeight;
    const [normHours, normStorage] = totalWeight === 0 ? [0.5, 0.5] : [hoursWeight / totalWeight, storageWeight / totalWeight];
    return tenants.map((_, i) => normHours * hoursShares[i] + normStorage * storageShares[i]);
  }

  throw new Error(`Unknown split method: ${splitMethod}`);
}

/**
 * Largest-remainder allocation: split an integer cent amount across weights
 * that sum to ~1, rounding each share to the nearest cent and then nudging
 * the entries with the largest rounding error by 1 cent, one at a time,
 * until the allocated total matches `totalCents` exactly. This is what
 * guarantees `computeSplit`'s tenant totals sum to the cent -- rounding each
 * share independently (`Math.round(weight * totalCents)` with no correction
 * pass) can leave the sum a cent or two short or over, especially on shares
 * that do not divide evenly (e.g. $1000 split three equal ways is
 * $333.33/$333.33/$333.33, one cent short of $1000).
 *
 * Works for a negative `totalCents` too (a tenant's base fees can exceed the
 * pool, see computeSplit below) -- the correction pass fixes the total
 * regardless of sign, it does not assume the amounts are positive.
 */
export function allocateCents(totalCents, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const ideal = weights.map((w) => w * totalCents);
  const allocated = ideal.map((x) => Math.round(x));
  const allocatedSum = allocated.reduce((a, b) => a + b, 0);
  let diff = totalCents - allocatedSum;
  if (diff === 0) return allocated;

  const sign = diff > 0 ? 1 : -1;
  // Largest remainder first: the entries `Math.round` moved furthest below
  // their ideal share (for a positive diff) get the spare cents first, so
  // the correction lands on the tenants it is most proportionally fair to.
  const order = ideal
    .map((x, i) => ({ i, remainder: x - allocated[i] }))
    .sort((a, b) => (sign > 0 ? b.remainder - a.remainder : a.remainder - b.remainder));

  for (const { i } of order) {
    if (diff === 0) break;
    allocated[i] += sign;
    diff -= sign;
  }
  return allocated;
}

/**
 * The full per-tenant bill. Every tenant's flat base/access fee is charged
 * first; what remains of the pool after every base fee (`remainingPoolCents`
 * -- can be negative if base fees alone exceed the pool, in which case the
 * "remaining pool" split hands back a credit) is then split proportionally
 * by the chosen method. Because both halves are tracked in integer cents,
 * `sum(tenant.totalCents) === poolTotalCents` always holds exactly, by
 * construction rather than by a rounding coincidence.
 */
export function computeSplit(inputs) {
  const splitMethod = inputs.splitMethod ?? DEFAULTS.splitMethod;
  if (!SPLIT_METHODS.includes(splitMethod)) throw new Error(`Unknown split method: ${splitMethod}`);

  const poolTotalCents = resolvePoolTotalCents(inputs);
  const tenants = normalizeTenants(inputs.tenants ?? []);
  const baseFeeTotalCents = tenants.reduce((s, t) => s + t.baseFeeCents, 0);
  const remainingPoolCents = poolTotalCents - baseFeeTotalCents;

  const weights = computeWeights(tenants, splitMethod, inputs.blendWeights ?? DEFAULTS.blendWeights);
  const shareCents = allocateCents(remainingPoolCents, weights);

  const tenantResults = tenants.map((t, i) => {
    const proportionalShareCents = shareCents[i];
    const totalCents = t.baseFeeCents + proportionalShareCents;
    return {
      name: t.name,
      hoursBooked: t.hoursBooked,
      dryStorageUnits: t.dryStorageUnits,
      refrigeratedUnits: t.refrigeratedUnits,
      freezerUnits: t.freezerUnits,
      totalStorageUnits: t.totalStorageUnits,
      weight: weights[i],
      baseFee: t.baseFeeCents / 100,
      proportionalShare: proportionalShareCents / 100,
      totalCents,
      total: totalCents / 100,
    };
  });

  const totalCents = tenantResults.reduce((s, t) => s + t.totalCents, 0);

  return {
    splitMethod,
    poolTotalCents,
    poolTotal: poolTotalCents / 100,
    baseFeeTotalCents,
    baseFeeTotal: baseFeeTotalCents / 100,
    remainingPoolCents,
    remainingPool: remainingPoolCents / 100,
    tenants: tenantResults,
    totalCents,
    total: totalCents / 100,
  };
}

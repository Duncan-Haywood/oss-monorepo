const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
};

/**
 * Break starting MRR into its waterfall components and derive the metrics
 * that are easy to get backwards by hand: gross vs. net revenue retention,
 * and the quick ratio.
 *
 * Two rules that are the actual point of this tool, not an implementation
 * detail:
 *
 * - Gross revenue retention (GRR) never counts new, expansion, or
 *   reactivation MRR -- it answers "of the revenue I started the month
 *   with, how much did I keep?" and is capped at 100%, because you cannot
 *   retain more of a base than you started with.
 * - Net revenue retention (NRR) adds expansion and reactivation back in and
 *   has no cap -- a NRR above 100% ("negative churn") means upgrades and
 *   winbacks outpaced downgrades and cancellations, and is the number
 *   investors ask for. A high NRR next to a much lower GRR means real
 *   logo/dollar churn is being masked by expansion, not absent.
 */
export function calculateWaterfall(input) {
  const startingMrr = finite(input.startingMrr, 'Starting MRR');
  const newMrr = finite(input.newMrr, 'New MRR');
  const expansionMrr = finite(input.expansionMrr, 'Expansion MRR');
  const reactivationMrr = finite(input.reactivationMrr, 'Reactivation MRR');
  const contractionMrr = finite(input.contractionMrr, 'Contraction MRR');
  const churnedMrr = finite(input.churnedMrr, 'Churned MRR');

  const netNewMrr = newMrr + expansionMrr + reactivationMrr - contractionMrr - churnedMrr;
  const endingMrr = startingMrr + netNewMrr;

  const grossChurnRate = startingMrr === 0 ? 0 : (churnedMrr / startingMrr) * 100;
  // Net churn can be negative -- that IS negative churn, not an error state.
  const netChurnRate = startingMrr === 0
    ? 0
    : ((churnedMrr + contractionMrr - expansionMrr - reactivationMrr) / startingMrr) * 100;

  const grossRevenueRetention = startingMrr === 0
    ? 100
    : Math.min(100, ((startingMrr - churnedMrr - contractionMrr) / startingMrr) * 100);

  // Identity: netRevenueRetention === 100 - netChurnRate. Kept as two
  // separate derivations (rather than one computed from the other) because
  // this file's whole job is showing the two paths agree, not assuming it.
  const netRevenueRetention = startingMrr === 0
    ? 100
    : ((startingMrr - churnedMrr - contractionMrr + expansionMrr + reactivationMrr) / startingMrr) * 100;

  const growthMrr = newMrr + expansionMrr + reactivationMrr;
  const lossMrr = contractionMrr + churnedMrr;
  // Quick ratio: MRR growth divided by MRR lost. No loss to divide by reads
  // as Infinity when there is real growth (no ceiling on the ratio) and as
  // null when there is neither growth nor loss to compare.
  const quickRatio = lossMrr === 0
    ? (growthMrr === 0 ? null : Infinity)
    : growthMrr / lossMrr;

  return {
    startingMrr,
    newMrr,
    expansionMrr,
    reactivationMrr,
    contractionMrr,
    churnedMrr,
    netNewMrr,
    endingMrr,
    grossChurnRate,
    netChurnRate,
    grossRevenueRetention,
    netRevenueRetention,
    growthMrr,
    lossMrr,
    quickRatio,
  };
}

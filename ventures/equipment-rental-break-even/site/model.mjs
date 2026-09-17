export function calculate(v) {
  if (Object.entries(v).some(([key, value]) => key !== "currency" && (!Number.isFinite(value) || value < 0))) {
    throw new Error("Enter non-negative numbers in every field.");
  }
  if (!v.booking || !v.rental_days || !v.life || !v.available || v.target_margin >= 100) {
    throw new Error("Booking, rental days, recovery life, availability, and margin must be valid.");
  }
  const bookingCosts = v.delivery + v.cleaning + v.damage;
  const ownershipPerDay = v.purchase / v.life;
  const contribution = v.booking - bookingCosts - ownershipPerDay * v.rental_days;
  const minimumPrice = bookingCosts + ownershipPerDay * v.rental_days + v.fixed_monthly / (v.available / v.rental_days);
  const targetPrice = (bookingCosts + ownershipPerDay * v.rental_days) / (1 - v.target_margin / 100);
  // Break-even bookings per month = fixed monthly overhead divided by what
  // one booking actually contributes toward it -- `contribution`, which is
  // already net of this booking's own ownership-cost share. The formula this
  // replaced instead divided by `monthlyContribution` (profit *before*
  // ownership cost) while adding a single booking's ownership cost into the
  // numerator alongside fixed_monthly. That numerator only means "one
  // booking's depreciation," not "this month's depreciation," so it neither
  // scales with the booking count the answer is solving for nor matches the
  // denominator it was divided by -- and the two errors do not cancel out or
  // even point the same direction:
  //   - at the tool's own defaults it overstated break-even by ~0.5% (0.9871
  //     vs. the true 0.9825 bookings/month), and
  //   - once ownership cost exceeds the booking's pre-ownership profit
  //     ($100 booking, $77 booking costs, $26.67 ownership on the defaults'
  //     asset) the old formula still returned a plausible-looking *finite*
  //     count (~4.42) for a booking that in fact never breaks even at any
  //     volume -- every additional booking of that shape loses money once its
  //     own ownership cost is paid, so more volume makes the shortfall worse,
  //     not better.
  // `contribution <= 0` is exactly that second case: this booking does not
  // even cover its own ownership cost before fixed overhead is considered at
  // all, so no number of them ever will.
  const utilization = contribution > 0
    ? v.fixed_monthly / contribution
    : Infinity;
  // Share of the month's available rental days this booking's break-even
  // frequency would consume: `utilization` is a *count* of bookings per
  // month (e.g. 0.98), not a percentage, so it must be scaled by how many
  // days each booking occupies before it means anything as a share of
  // capacity. Computed here, once, so every caller (on-page display and the
  // downloaded snapshot) reads the same number instead of one of them
  // reinventing it and drifting.
  const daysShare = Number.isFinite(utilization) ? (utilization * v.rental_days) / v.available : Infinity;
  return { bookingCosts, ownershipPerDay, contribution, minimumPrice, targetPrice, utilization, daysShare };
}

// The plain-text file "Download quote snapshot" writes to disk. Pulled out
// of app.mjs and given every input as a plain argument (no DOM, no Date.now)
// so the exact string a user saves to their records can be asserted on in a
// test, the same way the on-screen numbers already are.
export function buildSnapshotText(v, r, generatedAt) {
  const utilizationLine = Number.isFinite(r.utilization)
    ? `${r.utilization.toFixed(2)} (${(r.daysShare * 100).toFixed(1)}% of available rental days)`
    : "Not reached";
  return [
    "Equipment Rental Break-Even",
    `Booking price: ${v.currency} ${v.booking}`,
    `Minimum price: ${v.currency} ${r.minimumPrice.toFixed(2)}`,
    `Target-margin price: ${v.currency} ${r.targetPrice.toFixed(2)}`,
    `Break-even bookings per month: ${utilizationLine}`,
    `Generated: ${generatedAt}`,
  ].join("\n");
}

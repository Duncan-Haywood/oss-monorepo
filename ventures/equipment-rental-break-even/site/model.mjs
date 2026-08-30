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
  const monthlyContribution = v.booking - bookingCosts;
  const utilization = monthlyContribution > 0
    ? (v.fixed_monthly + v.purchase / (v.life / v.rental_days)) / monthlyContribution
    : Infinity;
  // Share of the month's available rental days this booking's break-even
  // frequency would consume: `utilization` is a *count* of bookings per
  // month (e.g. 0.99), not a percentage, so it must be scaled by how many
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

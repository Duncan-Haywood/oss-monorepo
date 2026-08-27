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
  return { bookingCosts, ownershipPerDay, contribution, minimumPrice, targetPrice, utilization };
}

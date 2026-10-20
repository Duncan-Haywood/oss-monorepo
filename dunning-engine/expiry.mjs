// Pre-dunning: find active subscriptions whose card on file expires soon and
// ask the customer to update it before the renewal fails. Pure functions; the
// engine does the sending (see scanExpiring in engine.mjs). Zero dependencies.

// A card is valid through the last day of its expiry month (UTC).
export function cardValidUntil(expMonth, expYear) {
  return Date.UTC(expYear, expMonth, 1) - 1;
}

export function formatExpiry(expMonth, expYear) {
  return `${String(expMonth).padStart(2, "0")}/${expYear}`;
}

const asObj = (x) => (x && typeof x === "object" ? x : null);

// subscriptions: Stripe subscription objects with `default_payment_method` and
// `customer` expanded (customer.invoice_settings.default_payment_method too, as
// the fallback). Returns one entry per card that expires within `withinDays`
// (or has already expired) and belongs to an active or trialing subscription.
export function findExpiring(subscriptions, now, { withinDays = 30 } = {}) {
  const horizon = now + withinDays * 86400000;
  const out = [];
  const seen = new Set();
  for (const sub of subscriptions || []) {
    if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
    if (sub.cancel_at_period_end) continue; // leaving anyway: do not nag
    const customer = asObj(sub.customer);
    const pm = asObj(sub.default_payment_method) || asObj(customer?.invoice_settings?.default_payment_method);
    const card = pm?.card;
    if (!pm?.id || !card?.exp_month || !card?.exp_year) continue;
    if (seen.has(pm.id)) continue; // one card on two subscriptions: one email
    const validUntil = cardValidUntil(card.exp_month, card.exp_year);
    if (validUntil > horizon) continue;
    const email = customer?.email || pm.billing_details?.email || null;
    seen.add(pm.id);
    out.push({
      pm: pm.id, customer: customer?.id || (typeof sub.customer === "string" ? sub.customer : null), subscription: sub.id,
      email, name: customer?.name || pm.billing_details?.name || null,
      last4: card.last4 || "", brand: card.brand || "card", expires: formatExpiry(card.exp_month, card.exp_year),
      validUntil, expired: validUntil < now,
    });
  }
  return out.sort((a, b) => a.validUntil - b.validUntil);
}

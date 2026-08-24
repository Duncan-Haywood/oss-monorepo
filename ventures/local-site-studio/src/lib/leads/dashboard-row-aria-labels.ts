/**
 * Shared accessible-name helper for operator dashboard list-row action
 * buttons/links (`/dashboard/leads`, `leads-client.tsx`).
 *
 * Same "duplicate accessible name in a list" bug class already fixed
 * piecemeal for SuppressedEmailsPanel's Remove button, the Missing-client-
 * receipt "Resend receipt" button, the Commerce payouts panel's "Mark paid
 * out" button (commerceMarkPaidOutAriaLabel, src/lib/commerce/orders.ts),
 * and the public storefront's Buy now/Request order buttons
 * (commerceBuyNowAriaLabel / commerceRequestOrderAriaLabel,
 * src/lib/commerce/catalog.ts) — see list-row-action-button-aria-label,
 * commerce-storefront-buy-now-aria-label, and
 * commerce-payouts-mark-paid-out-aria-label in BUSINESS_DECISIONS.
 *
 * Every other due-queue/action panel on this page (`commerceCatalogsMissing`,
 * `commerceCatalogsUnsynced`, `starterUpsellCandidates`,
 * `recurringEntitlementPaused`, `marketingPacksDue`, `clientVoicePacksDue`,
 * `abandonedCheckoutsDue`, `commerceAbandonedCheckoutsDue`, `followUpsDue`,
 * `coldLeads`, `paidNotLive`, `openHandoffs`, `openInquiries`) renders the
 * exact same visible button text on every row of a `.map()` over more than
 * one record — a screen-reader user navigating by a controls-list shortcut
 * (NVDA/JAWS "list of buttons", VoiceOver rotor) sees N indistinguishable
 * entries with no way to tell which record each one acts on without
 * switching to linear reading. This one shared helper closes the gap across
 * every remaining instance in a single pass rather than one panel per
 * iteration, since every instance is the identical bug applied to a
 * differently-shaped record — see dashboard-row-action-button-aria-label in
 * BUSINESS_DECISIONS.
 *
 * Pure — no I/O. `detail` is optional context beyond business name + slug
 * for panels where more than one row can share both (e.g. one lead with
 * several open inquiries, or several abandoned Buy now carts for different
 * SKUs) — omit it when a panel's own row key already guarantees at most one
 * row per lead.
 */
export function dashboardRowActionAriaLabel(
  action: string,
  businessName: string,
  slug: string,
  detail?: string,
): string {
  const base = `${action} — ${businessName} (${slug})`;
  return detail ? `${base}: ${detail}` : base;
}

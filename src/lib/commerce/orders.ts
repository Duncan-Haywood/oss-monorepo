/**
 * End-customer Commerce "Buy now" orders — see /docs/product-bundles (Commerce add-on).
 *
 * A completed commerce_sku Stripe Checkout Session (POST /api/commerce/checkout)
 * is money from the lead's own customer for one catalog SKU. It is NOT Local
 * Site Studio's own revenue (that is `orders`/OrderRecord — Starter/Growth/
 * Complete/Commerce bundle sales) and must never be written into the `orders`
 * table: several eligibility predicates (orderEligibleForBillingPortal,
 * leadEligibleForStarterUpsell, leadEligibleForCommerceCatalog) treat any
 * `orders` row with commerceAddon=true as "this lead already subscribes to the
 * Commerce add-on," and revenueTotalUsd/orderCount on the dashboard are read
 * as Local Site Studio's own sales. Mixing pass-through customer revenue into
 * that table would falsely suppress upsell/billing-portal eligibility and
 * inflate the operator's own revenue number with money that isn't theirs.
 * Keep this a separate, append-only ledger instead.
 */

export interface CommerceOrderRecord {
  id: string;
  leadSlug: string;
  skuId: string;
  skuName: string;
  /** USD dollars (not cents) — matches OrderRecord.amountPaid's unit convention. */
  amountPaidUsd: number;
  stripeSessionId: string;
  createdAt: string;
}

export interface InsertCommerceOrderInput {
  leadSlug: string;
  skuId: string;
  skuName: string;
  amountPaidUsd: number;
  stripeSessionId: string;
}

/** Sum of all recorded commerce-order amounts (USD dollars). Pure — no I/O. */
export function sumCommerceOrdersRevenueUsd(
  orders: ReadonlyArray<{ amountPaidUsd: number }>,
): number {
  let total = 0;
  for (const order of orders) {
    if (typeof order.amountPaidUsd === "number" && Number.isFinite(order.amountPaidUsd)) {
      total += order.amountPaidUsd;
    }
  }
  return total;
}

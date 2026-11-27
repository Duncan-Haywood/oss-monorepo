// MRR from the prices Paddle webhooks recorded on each subscription. Nothing is estimated: a paid
// subscription without a usable recorded price is counted as "unpriced" and left out of the sum.
import type { MoneyByCurrency, MrrSummary } from "./contract.ts";

/** The recorded price columns an app keeps on its subscription row (all nullable). */
export interface RecordedPrice {
  priceAmountMinor: number | null;
  priceCurrency: string | null;
  billingInterval: string | null;
  billingFrequency: number | null;
  priceQuantity: number | null;
  priceDiscounted: boolean | null;
}

/**
 * Monthly amount (minor units, rounded to the nearest unit) for a recorded price, or null when the
 * price is missing, discounted (the webhook does not say by how much) or on a day/week cycle.
 */
export function monthlyRecurringMinor(p: RecordedPrice): MoneyByCurrency | null {
  const { priceAmountMinor: amount, priceCurrency: currency, billingFrequency: freq } = p;
  if (amount == null || !currency || !freq || freq <= 0 || p.priceDiscounted) return null;
  const qty = p.priceQuantity ?? 1;
  const months =
    p.billingInterval === "month" ? freq : p.billingInterval === "year" ? 12 * freq : 0;
  if (!months) return null;
  return { currency, amountMinor: Math.round((amount * qty) / months) };
}

export const PAID_STATUSES = ["active", "past_due"] as const;

/** Sums MRR per currency over subscription rows; only paid statuses count. */
export function summarizeMrr(rows: (RecordedPrice & { status: string })[]): MrrSummary {
  const totals = new Map<string, number>();
  let counted = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (r.status !== "active" && r.status !== "past_due") continue;
    const m = monthlyRecurringMinor(r);
    if (!m) {
      unpriced++;
      continue;
    }
    counted++;
    totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amountMinor);
  }
  return {
    byCurrency: [...totals]
      .map(([currency, amountMinor]) => ({ currency, amountMinor }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    subscriptionsCounted: counted,
    subscriptionsUnpriced: unpriced,
    source: "paddle_webhook",
  };
}

/** Adds MoneyByCurrency lists (console totals; currencies are never converted). */
export function addMoney(...lists: MoneyByCurrency[][]): MoneyByCurrency[] {
  const totals = new Map<string, number>();
  for (const l of lists)
    for (const m of l) totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amountMinor);
  return [...totals]
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

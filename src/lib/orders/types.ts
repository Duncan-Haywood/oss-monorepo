/**
 * Paid checkout orders — written by the Stripe webhook via recordLeadPayment.
 * Amounts are USD dollars (webhook divides Stripe cents by 100).
 */

export interface OrderRecord {
  id: string;
  leadSlug: string;
  stripeSessionId: string;
  tier: string;
  commerceAddon: boolean;
  /** USD dollars (not cents). */
  amountPaid: number;
  status: string;
  createdAt: string;
}

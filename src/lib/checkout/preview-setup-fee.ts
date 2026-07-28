/**
 * Whether the public /preview/[slug] page's TierUpsell cards should show the
 * setup fee waived — mirrors checkout's own setupFeeWaived predicate exactly
 * (see checkout-setup-fee-skip-on-upgrade / src/lib/checkout/prefill-slug.ts's
 * hasExistingOrder): true when the lead already has any prior bundle order,
 * since every tier shares the same one-time setup fee.
 *
 * Stage-gated before the listOrdersByLeadSlug call, same precedent as
 * loadPreviewCommerceItems (src/lib/commerce/preview-commerce.ts,
 * preview-page-uncapped-listOrders) — a lead only ever has an order after
 * recordLeadPayment flips its stage to paid/live, so the high-volume
 * cold-outreach preview path (every other stage) never pays that DB cost.
 *
 * Defaults lazy-import `@/lib/db` so Vitest can exercise the stage gate
 * without pulling the `server-only` db module (same pattern as other
 * injectable preview-page loaders).
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import type { OrderRecord } from "@/lib/orders/types";

export type PreviewSetupFeeDeps = {
  listOrdersByLeadSlug: (leadSlug: string) => Promise<OrderRecord[]>;
};

async function defaultDeps(): Promise<PreviewSetupFeeDeps> {
  const { listOrdersByLeadSlug } = await import("@/lib/db");
  return { listOrdersByLeadSlug };
}

export async function loadPreviewSetupFeeWaived(
  lead: { stage: LeadPipelineStage },
  slug: string,
  deps?: PreviewSetupFeeDeps,
): Promise<boolean> {
  if (lead.stage !== "paid" && lead.stage !== "live") {
    return false;
  }
  const resolved = deps ?? (await defaultDeps());
  const orders = await resolved.listOrdersByLeadSlug(slug);
  return orders.length > 0;
}

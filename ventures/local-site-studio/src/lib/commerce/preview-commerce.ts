/**
 * Load Commerce catalog items for the sold SSR preview page.
 *
 * Cold outreach / discovered previews are the high-volume path and never show
 * a catalog (`leadStageEligibleForCommerceCatalog` is false). Calling
 * `listOrders()` for every public preview burned a full-ledger Convex collect /
 * SQLite join before that stage short-circuit — see preview-page-uncapped-listOrders.
 *
 * Defaults lazy-import `@/lib/db` so Vitest can exercise the stage gate without
 * pulling the `server-only` db module.
 */

import {
  leadEligibleForCommerceCatalog,
  leadStageEligibleForCommerceCatalog,
} from "@/lib/commerce/catalog";
import type { CommerceCatalog, CommerceSku } from "@/lib/commerce/types";
import type { LeadPipelineStage } from "@/lib/leads/types";
import type { OrderRecord } from "@/lib/orders/types";

export type PreviewCommerceDeps = {
  listOrdersByLeadSlug: (leadSlug: string) => Promise<OrderRecord[]>;
  getCommerceCatalog: (leadSlug: string) => Promise<CommerceCatalog | null>;
};

async function defaultDeps(): Promise<PreviewCommerceDeps> {
  const { listOrdersByLeadSlug, getCommerceCatalog } = await import("@/lib/db");
  return { listOrdersByLeadSlug, getCommerceCatalog };
}

/**
 * Returns catalog SKUs when the lead is paid/live with a commerceAddon order
 * and a saved catalog; otherwise []. Never calls listOrders / catalog deps
 * when stage is ineligible.
 */
export async function loadPreviewCommerceItems(
  lead: { stage: LeadPipelineStage },
  slug: string,
  deps?: PreviewCommerceDeps,
): Promise<CommerceSku[]> {
  if (!leadStageEligibleForCommerceCatalog(lead.stage)) {
    return [];
  }
  const resolved = deps ?? (await defaultDeps());
  const orders = await resolved.listOrdersByLeadSlug(slug);
  if (!leadEligibleForCommerceCatalog(lead, orders)) {
    return [];
  }
  const catalog = await resolved.getCommerceCatalog(slug);
  return catalog?.items ?? [];
}

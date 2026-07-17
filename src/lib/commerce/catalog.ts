/**
 * Pure helpers for Commerce catalog eligibility + SKU normalization.
 * See /docs/product-bundles — Commerce sells catalog ≤50 SKUs.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import {
  MAX_COMMERCE_SKU_ID_LENGTH,
  MAX_COMMERCE_SKUS,
  MAX_SKU_DESCRIPTION_LENGTH,
  MAX_SKU_NAME_LENGTH,
  MAX_SKU_PRICE_CENTS,
  type CommerceSku,
} from "./types";

export { MAX_COMMERCE_SKU_ID_LENGTH };

export function leadStageEligibleForCommerceCatalog(
  stage: LeadPipelineStage,
): boolean {
  return stage === "paid" || stage === "live";
}

/**
 * Eligible when the lead is paid/live AND has at least one order with commerceAddon.
 * Tier alone (Starter/Growth/Complete) does not unlock the catalog — Commerce is the add-on.
 */
export function leadEligibleForCommerceCatalog(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
  }>,
): boolean {
  if (!leadStageEligibleForCommerceCatalog(lead.stage)) return false;
  return orders.some(
    (o) =>
      o.commerceAddon &&
      !(
        typeof o.recurringCanceledAt === "number" &&
        Number.isFinite(o.recurringCanceledAt) &&
        o.recurringCanceledAt > 0
      ),
  );
}

/** Paid/live commerceAddon leads still missing any catalog row — slug-sorted. */
export function listCommerceCatalogsMissing<
  T extends { slug: string; stage: LeadPipelineStage },
>(
  leads: T[],
  orders: ReadonlyArray<{
    leadSlug: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
  }>,
  catalogs: ReadonlyArray<{ leadSlug: string }>,
): T[] {
  const withCatalog = new Set(catalogs.map((c) => c.leadSlug));
  return leads
    .filter((lead) => {
      if (withCatalog.has(lead.slug)) return false;
      return leadEligibleForCommerceCatalog(
        lead,
        orders.filter((o) => o.leadSlug === lead.slug),
      );
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** True when any SKU still lacks a Stripe Price (Buy now not available for that SKU). */
export function catalogHasUnsyncedSku(
  catalog: Readonly<{ items: ReadonlyArray<{ stripePriceId?: string }> }>,
): boolean {
  return catalog.items.some((item) => !item.stripePriceId);
}

/**
 * Paid/live commerceAddon leads whose saved catalog still has ≥1 SKU without
 * stripePriceId — Sync to Stripe is still due. Empty catalogs are not
 * "unsynced" (no SKUs to sync); missing catalogs use listCommerceCatalogsMissing.
 */
export function listCommerceCatalogsUnsynced<
  T extends { slug: string; stage: LeadPipelineStage },
>(
  leads: T[],
  orders: ReadonlyArray<{ leadSlug: string; commerceAddon: boolean }>,
  catalogs: ReadonlyArray<{
    leadSlug: string;
    items: ReadonlyArray<{ stripePriceId?: string }>;
  }>,
): T[] {
  const unsyncedSlugs = new Set(
    catalogs.filter(catalogHasUnsyncedSku).map((c) => c.leadSlug),
  );
  return leads
    .filter((lead) => {
      if (!unsyncedSlugs.has(lead.slug)) return false;
      return leadEligibleForCommerceCatalog(
        lead,
        orders.filter((o) => o.leadSlug === lead.slug),
      );
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * After normalizeCommerceItems, re-attach Stripe ids from the previously saved
 * catalog. Product id sticks by SKU id; Price id only when priceCents is
 * unchanged (price edits need a fresh Stripe Price on next Sync). Never trust
 * client-submitted Stripe ids — callers pass the DB row as `previous`.
 */
export function preserveCommerceStripeIds(
  items: CommerceSku[],
  previous: ReadonlyArray<CommerceSku> | undefined,
): CommerceSku[] {
  if (!previous || previous.length === 0) return items;
  const prevById = new Map(previous.map((sku) => [sku.id, sku]));
  return items.map((item) => {
    const prev = prevById.get(item.id);
    if (!prev?.stripeProductId) return item;
    const merged: CommerceSku = {
      ...item,
      stripeProductId: prev.stripeProductId,
    };
    if (prev.stripePriceId && prev.priceCents === item.priceCents) {
      merged.stripePriceId = prev.stripePriceId;
    }
    return merged;
  });
}

export function formatPriceUsd(priceCents: number): string {
  if (!Number.isFinite(priceCents) || priceCents < 0) return "$—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(priceCents / 100);
}

/** Stable id for a new SKU (client may pass a temp id; server regenerates on save). */
export function newCommerceSkuId(): string {
  return `sku_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type NormalizeCommerceItemsResult =
  | { ok: true; items: CommerceSku[] }
  | { ok: false; error: string };

/**
 * Validate + normalize operator-submitted SKUs. Caps at MAX_COMMERCE_SKUS,
 * trims strings, drops empty names, rejects non-integer / out-of-range prices,
 * and hard-rejects opaque ids longer than MAX_COMMERCE_SKU_ID_LENGTH (never
 * truncate — truncation can collide Stripe Product / Price preservation keys).
 */
export function normalizeCommerceItems(
  raw: ReadonlyArray<{
    id?: string;
    name?: string;
    description?: string;
    priceCents?: number;
  }>,
): NormalizeCommerceItemsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Catalog items must be an array" };
  }
  if (raw.length > MAX_COMMERCE_SKUS) {
    return {
      ok: false,
      error: `Commerce catalogs are limited to ${MAX_COMMERCE_SKUS} SKUs`,
    };
  }

  const items: CommerceSku[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `SKU ${i + 1} is invalid` };
    }
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) {
      return { ok: false, error: `SKU ${i + 1} needs a name` };
    }
    if (name.length > MAX_SKU_NAME_LENGTH) {
      return {
        ok: false,
        error: `SKU ${i + 1} name must be ≤${MAX_SKU_NAME_LENGTH} characters`,
      };
    }
    const priceCents = row.priceCents;
    if (
      typeof priceCents !== "number" ||
      !Number.isInteger(priceCents) ||
      priceCents < 0 ||
      priceCents > MAX_SKU_PRICE_CENTS
    ) {
      return {
        ok: false,
        error: `SKU ${i + 1} needs a whole-cent price between $0 and $${MAX_SKU_PRICE_CENTS / 100}`,
      };
    }
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    if (description.length > MAX_SKU_DESCRIPTION_LENGTH) {
      return {
        ok: false,
        error: `SKU ${i + 1} description must be ≤${MAX_SKU_DESCRIPTION_LENGTH} characters`,
      };
    }
    let id: string;
    if (typeof row.id === "string" && row.id.trim()) {
      id = row.id.trim();
      if (id.length > MAX_COMMERCE_SKU_ID_LENGTH) {
        return {
          ok: false,
          error: `SKU ${i + 1} id must be ≤${MAX_COMMERCE_SKU_ID_LENGTH} characters`,
        };
      }
    } else {
      id = newCommerceSkuId();
    }
    items.push({
      id,
      name,
      priceCents,
      ...(description ? { description } : {}),
    });
  }

  return { ok: true, items };
}

/** Prefill contact-form message when a visitor requests a catalog item. */
export function commerceOrderRequestMessage(sku: CommerceSku): string {
  const price = formatPriceUsd(sku.priceCents);
  return `I'd like to order: ${sku.name} (${price}).`;
}

/**
 * Operator inquiry-inbox notification body for a completed Buy now Stripe
 * Checkout Session (kind: "commerce_sku") — the paid counterpart to
 * commerceOrderRequestMessage, so a synced-SKU purchase still reaches the
 * operator even though it skips the contact form.
 */
export function commerceOrderPaidInquiryMessage(input: {
  skuName: string;
  amountTotalUsd: number;
  stripeSessionId: string;
  skuId?: string;
}): string {
  const price = formatPriceUsd(Math.round(input.amountTotalUsd * 100));
  const skuNote = input.skuId ? `, SKU ${input.skuId}` : "";
  return `Paid order via Buy now: ${input.skuName} (${price}) — Stripe session ${input.stripeSessionId}${skuNote}.`;
}

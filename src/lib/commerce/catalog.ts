/**
 * Pure helpers for Commerce catalog eligibility + SKU normalization.
 * See /docs/product-bundles — Commerce sells catalog ≤50 SKUs.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import {
  MAX_COMMERCE_SKUS,
  MAX_SKU_DESCRIPTION_LENGTH,
  MAX_SKU_NAME_LENGTH,
  MAX_SKU_PRICE_CENTS,
  type CommerceSku,
} from "./types";

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
  orders: ReadonlyArray<{ commerceAddon: boolean }>,
): boolean {
  if (!leadStageEligibleForCommerceCatalog(lead.stage)) return false;
  return orders.some((o) => o.commerceAddon);
}

/** Paid/live commerceAddon leads still missing any catalog row — slug-sorted. */
export function listCommerceCatalogsMissing<
  T extends { slug: string; stage: LeadPipelineStage },
>(
  leads: T[],
  orders: ReadonlyArray<{ leadSlug: string; commerceAddon: boolean }>,
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
 * trims strings, drops empty names, rejects non-integer / out-of-range prices.
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
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim().slice(0, 64)
        : newCommerceSkuId();
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

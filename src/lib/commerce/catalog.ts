/**
 * Pure helpers for Commerce catalog eligibility + SKU normalization.
 * See /docs/product-bundles — Commerce sells catalog ≤50 SKUs.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import { orderGrantsSoldCapabilityEntitlement } from "@/lib/orders/recurring";
import {
  MAX_COMMERCE_SKU_ID_LENGTH,
  MAX_COMMERCE_SKUS,
  MAX_SKU_DESCRIPTION_LENGTH,
  MAX_SKU_NAME_LENGTH,
  MAX_SKU_PRICE_CENTS,
  MIN_SKU_PRICE_CENTS,
  type CommerceSku,
} from "./types";

export { MAX_COMMERCE_SKU_ID_LENGTH };

export function leadStageEligibleForCommerceCatalog(
  stage: LeadPipelineStage,
): boolean {
  return stage === "paid" || stage === "live";
}

/**
 * Eligible when the lead is paid/live AND has at least one order with commerceAddon
 * that still grants active entitlement (active recurring, never refunded/disputed —
 * see orderGrantsSoldCapabilityEntitlement). Tier alone (Starter/Growth/Complete)
 * does not unlock the catalog — Commerce is the add-on.
 */
export function leadEligibleForCommerceCatalog(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{
    tier?: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): boolean {
  if (!leadStageEligibleForCommerceCatalog(lead.stage)) return false;
  return orders.some(
    (o) =>
      o.commerceAddon &&
      orderGrantsSoldCapabilityEntitlement({ ...o, tier: o.tier ?? "" }),
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

const HOUR_MS = 60 * 60 * 1000;

/**
 * Age in whole hours since the oldest qualifying commerceAddon order among
 * `candidates` (as returned by listCommerceCatalogsMissing or
 * listCommerceCatalogsUnsynced — both share leadEligibleForCommerceCatalog,
 * so one helper covers both) was created; null when there are no candidates
 * or none of their orders parse. Pass nowMs from the caller — never
 * Date.now() inside list/age helpers (see oldestStarterUpsellCandidateAgeHours
 * for the same pattern).
 *
 * Must gate on orderGrantsSoldCapabilityEntitlement (not a raw
 * recurringCanceledAt check) — see refund-dispute-oldest-age-parity: an
 * older refunded/disputed commerceAddon order must never pull the reported
 * age earlier than the entitlement that actually grants the catalog.
 */
export function oldestCommerceCatalogCandidateAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier?: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
    createdAt?: string;
  }>,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  let oldestCreatedAtMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!order.commerceAddon) continue;
    if (
      !orderGrantsSoldCapabilityEntitlement({ ...order, tier: order.tier ?? "" })
    ) {
      continue;
    }
    if (typeof order.createdAt !== "string") continue;
    const createdAtMs = Date.parse(order.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    if (oldestCreatedAtMs === null || createdAtMs < oldestCreatedAtMs) {
      oldestCreatedAtMs = createdAtMs;
    }
  }
  if (oldestCreatedAtMs === null) return null;
  if (nowMs < oldestCreatedAtMs) return 0;
  return Math.max(0, Math.floor((nowMs - oldestCreatedAtMs) / HOUR_MS));
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
  orders: ReadonlyArray<{
    leadSlug: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
  }>,
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
      priceCents < MIN_SKU_PRICE_CENTS ||
      priceCents > MAX_SKU_PRICE_CENTS
    ) {
      return {
        ok: false,
        error: `SKU ${i + 1} needs a whole-cent price between $${(MIN_SKU_PRICE_CENTS / 100).toFixed(2)} and $${MAX_SKU_PRICE_CENTS / 100} — Stripe rejects a Checkout charge below its $${(MIN_SKU_PRICE_CENTS / 100).toFixed(2)} minimum`,
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

/**
 * The dashboard's catalog editor draft (leads-client.tsx commerceDraftItems)
 * is a single non-keyed slot shared across every lead row, paired with
 * commerceEditSlug to say which lead currently owns it. "Sync to Stripe" is
 * callable from two places: inside the open editor (always the owning lead)
 * and from the standalone "Commerce catalogs unsynced" panel, which can sync
 * a *different* lead than whichever one's editor happens to be open. Only
 * refresh the draft when the synced lead is the one actually being edited —
 * otherwise a sync for lead B while lead A's editor is open silently loads
 * lead B's items into the visibly-open "lead A" editor, and a subsequent
 * Save catalog persists lead B's SKUs under lead A's slug (see
 * commerce-draft-items-cross-lead-clobber).
 */
export function commerceDraftItemsAfterSync(
  editingSlug: string | null,
  syncedSlug: string,
  currentDraftItems: CommerceSku[],
  syncedItems: CommerceSku[],
): CommerceSku[] {
  if (editingSlug !== syncedSlug) return currentDraftItems;
  return syncedItems.map((item) => ({ ...item }));
}

/**
 * Preview-page catalog intro copy — must describe what the buyer is actually
 * about to do. A saved catalog is very often a mix of Stripe-synced SKUs
 * (instant "Buy now" checkout) and not-yet-synced SKUs (contact-form
 * "Request order" — see catalogHasUnsyncedSku, which exists precisely
 * because partial sync is the common steady state right after an operator
 * adds a new SKU to an already-synced catalog). A single hardcoded "Request
 * an item below — we'll confirm availability and payment by email or phone"
 * paragraph was shown unconditionally regardless of that mix, so a synced
 * SKU's buyer read a promise of a manual follow-up call/email and then
 * landed on a real Stripe Checkout that charged them immediately — a
 * genuine trust/expectation mismatch in the paid buyer journey, not just a
 * style nit (commerce-catalog-intro-copy-checkout-mismatch).
 */
export function commerceCatalogIntroCopy(
  items: ReadonlyArray<{ stripePriceId?: string }>,
): string {
  const hasDirectCheckout = items.some((item) => item.stripePriceId);
  const hasRequestOnly = items.some((item) => !item.stripePriceId);
  if (hasDirectCheckout && hasRequestOnly) {
    return "Buy now items charge securely through Stripe right away. For everything else, request below and we'll confirm availability and payment by email or phone.";
  }
  if (hasDirectCheckout) {
    return "Buy now to pay securely through Stripe — instant checkout.";
  }
  return "Request an item below — we'll confirm availability and payment by email or phone.";
}

/** Prefill contact-form message when a visitor requests a catalog item. */
export function commerceOrderRequestMessage(sku: CommerceSku): string {
  const price = formatPriceUsd(sku.priceCents);
  return `I'd like to order: ${sku.name} (${price}).`;
}

/**
 * Accessible name for a catalog item's "Buy now" button. Without this, every
 * SKU on a multi-item /preview/[slug] catalog renders a button whose visible
 * text is the identical literal "Buy now" — a screen-reader user browsing by
 * a controls-list shortcut (NVDA/JAWS "list all buttons") sees N identical
 * entries with no way to tell which item each one buys, the same
 * list-row-action-button-aria-label bug class already fixed on two operator
 * dashboard panels (SuppressedEmailsPanel's Remove, leads-client.tsx's
 * commerce-receipt-resend) but never checked on this public, real-money,
 * customer-facing storefront. Extracted as a pure helper (rather than inlined
 * in the "use client" component) so it's unit-testable — this repo has no
 * React testing harness.
 */
export function commerceBuyNowAriaLabel(sku: CommerceSku): string {
  return `Buy now — ${sku.name} (${formatPriceUsd(sku.priceCents)})`;
}

/**
 * Accessible name for a catalog item's "Request order" link — same
 * duplicate-accessible-name issue as commerceBuyNowAriaLabel above, for the
 * request-only (not yet synced to Stripe) catalog items.
 */
export function commerceRequestOrderAriaLabel(sku: CommerceSku): string {
  return `Request order — ${sku.name}`;
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
  /**
   * Units purchased (Stripe adjustable_quantity — see
   * commerce-checkout-adjustable-quantity). Only noted when >1: a shopper
   * buying exactly 1 (or a legacy/unknown-quantity row, quantity undefined)
   * reads identically to before this field existed, so existing operator
   * fulfillment habits and message text stay unchanged for the common case.
   */
  quantity?: number;
}): string {
  const price = formatPriceUsd(Math.round(input.amountTotalUsd * 100));
  const skuNote = input.skuId ? `, SKU ${input.skuId}` : "";
  const quantityNote =
    typeof input.quantity === "number" && input.quantity > 1
      ? `, quantity ${input.quantity}`
      : "";
  return `Paid order via Buy now: ${input.skuName} (${price}) — Stripe session ${input.stripeSessionId}${skuNote}${quantityNote}.`;
}

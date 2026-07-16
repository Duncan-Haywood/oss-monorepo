import { COMMERCE_ADDON } from "@/lib/pricing/bundles";

/**
 * Derive whether a bundle Checkout Session actually charged the Commerce
 * add-on from Stripe line-item Price IDs — never from metadata.commerceAddon.
 *
 * Create-path (POST /api/stripe/checkout) only sets metadata.commerceAddon
 * when both COMMERCE_ADDON Price IDs are on line_items. The webhook must
 * mirror that before recordLeadPayment / handoff, or a Dashboard-minted /
 * tampered session with metadata.commerceAddon=true unlocks catalog +
 * Billing Portal (and blocks Starter upsell) without the $300+$49/mo charge.
 */

export type CommerceAddonPriceIds = {
  setupId: string;
  monthlyId: string;
};

/** Trimmed COMMERCE_ADDON Price IDs from env, or null when either is missing. */
export function commerceAddonPriceIdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CommerceAddonPriceIds | null {
  const setupId = env[COMMERCE_ADDON.setupPriceIdEnv]?.trim() ?? "";
  const monthlyId = env[COMMERCE_ADDON.monthlyPriceIdEnv]?.trim() ?? "";
  if (!setupId || !monthlyId) return null;
  return { setupId, monthlyId };
}

/**
 * Pure: true only when both Commerce Price IDs appear among the session's
 * line-item price ids (create always adds both when commerceAddon is applied).
 */
export function sessionLineItemsIncludeCommerceAddon(
  lineItemPriceIds: ReadonlyArray<string | null | undefined>,
  commercePrices: CommerceAddonPriceIds,
): boolean {
  const present = new Set<string>();
  for (const id of lineItemPriceIds) {
    if (typeof id === "string" && id.length > 0) {
      present.add(id);
    }
  }
  return present.has(commercePrices.setupId) && present.has(commercePrices.monthlyId);
}

export type ResolveCommerceAddonFromLineItemsResult = {
  /** Entitlement flag for the paid-order ledger / handoff. */
  commerceAddon: boolean;
  /** True when metadata.commerceAddon === "true" disagreed with line items. */
  metadataMismatch: boolean;
};

/**
 * Resolve commerceAddon for bundle webhook fulfillment.
 * Missing Commerce Price env → fail closed (false); create already 501s
 * Commerce checkout without those Prices.
 */
export function resolveCommerceAddonFromLineItems(args: {
  metadataCommerceAddon: boolean;
  lineItemPriceIds: ReadonlyArray<string | null | undefined>;
  commercePrices: CommerceAddonPriceIds | null;
}): ResolveCommerceAddonFromLineItemsResult {
  if (!args.commercePrices) {
    return {
      commerceAddon: false,
      metadataMismatch: args.metadataCommerceAddon,
    };
  }
  const fromLineItems = sessionLineItemsIncludeCommerceAddon(
    args.lineItemPriceIds,
    args.commercePrices,
  );
  return {
    commerceAddon: fromLineItems,
    metadataMismatch: args.metadataCommerceAddon !== fromLineItems,
  };
}

/** Extract Price ids from a Stripe listLineItems `.data` page. */
export function priceIdsFromStripeLineItems(
  lineItems: ReadonlyArray<{ price?: string | { id?: string | null } | null }>,
): string[] {
  const ids: string[] = [];
  for (const item of lineItems) {
    const price = item.price;
    if (typeof price === "string" && price.length > 0) {
      ids.push(price);
    } else if (price && typeof price === "object" && typeof price.id === "string" && price.id) {
      ids.push(price.id);
    }
  }
  return ids;
}

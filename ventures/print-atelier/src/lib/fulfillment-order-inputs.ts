/**
 * The order inputs a print partner needs that are not part of the buyer's
 * address.
 *
 * `buyer-shipping.ts` established the rule for this checkout: a missing field is
 * a reason to refuse to submit an order, never a reason to invent one. That rule
 * was applied to the address and stopped at the edge of it. Inside the same two
 * payload builders, three more values were still being invented:
 *
 *   - `buyerEmail` fell back to `buyer@printatelier.com`. It is the address
 *     Gelato sends shipment notifications to and the address Printful prints on
 *     the packing slip, so the buyer never hears about the order they paid for.
 *   - Gelato's `fileUrl` — the artwork actually printed — fell back to
 *     `https://printatelier.com/prints/<catalogSlug>`. No catalog record in this
 *     repository carries a print file at all (`CatalogArtwork` holds an
 *     `imageClass`, a CSS class), so that URL never pointed at artwork.
 *   - An unmapped product fell back to `gel_<slug>` / `pf_<slug>`. Real
 *     identifiers look like `gel_poster_18x24_matte`; a fabricated one is
 *     rejected by the partner, so the order fails after the buyer has paid.
 *
 * Nothing writes any of these three keys anywhere in this repository, so each
 * default was taken on every order rather than in some edge case.
 *
 * Nothing in here has a default.
 */

/** Metadata keys the fulfillment adapters read for non-address order inputs. */
export const FULFILLMENT_INPUT_METADATA_KEYS = {
  buyerEmail: "buyerEmail",
  printFileUrl: "artworkUrl",
} as const;

/**
 * Enough structure to reject an empty or unusable address. This is deliberately
 * not a full RFC 5322 grammar: the partner validates properly, and the job here
 * is to refuse a value that cannot be a buyer's address at all.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResolvedValue = {
  ok: boolean;
  /** Empty when unresolved, so callers can report what they do have. */
  value: string;
  /** Metadata keys that would have to be supplied, named for an operator. */
  missing: string[];
};

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!metadata) {
    return "";
  }
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The buyer's own email address. Stripe collects one at checkout; until it is
 * lifted into payment metadata this resolves to unset, and an order carrying no
 * buyer email is refused rather than addressed to the studio's own inbox.
 */
export function resolveBuyerEmail(
  paymentMetadata: Record<string, unknown> = {},
): ResolvedValue {
  const key = FULFILLMENT_INPUT_METADATA_KEYS.buyerEmail;
  const value = readMetadataString(paymentMetadata, key);

  if (value === "" || !EMAIL_PATTERN.test(value)) {
    return { ok: false, value: "", missing: [key] };
  }
  return { ok: true, value, missing: [] };
}

/**
 * The artwork file a partner prints, for one line of the order. A per-line key
 * wins over the order-wide one so a multi-artwork cart cannot be collapsed onto
 * a single image.
 *
 * Only `https` is accepted: the partner fetches this URL from its own
 * infrastructure, and a plaintext fetch of a customer's artwork is not something
 * to hand to a third party.
 */
export function resolvePrintFileUrl(
  paymentMetadata: Record<string, unknown> = {},
  index = 0,
): ResolvedValue {
  const sharedKey = FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl;
  const lineKey = `${sharedKey}_${index}`;

  const lineValue = readMetadataString(paymentMetadata, lineKey);
  const value = lineValue !== "" ? lineValue : readMetadataString(paymentMetadata, sharedKey);

  if (value === "" || !value.startsWith("https://")) {
    return { ok: false, value: "", missing: [lineKey] };
  }
  return { ok: true, value, missing: [] };
}

/**
 * A partner product identifier resolved from the variant map. The map is the
 * only source: an unmapped artwork has no product, and naming one after the
 * artwork slug produces an identifier the partner does not have.
 */
export function resolvePartnerProductId(
  mapped: string | null | undefined,
  /** Named for the operator who has to add the mapping, e.g. `midnight-coast`. */
  artworkSlug: string,
): ResolvedValue {
  const value = typeof mapped === "string" ? mapped.trim() : "";
  if (value === "") {
    return { ok: false, value: "", missing: [`product mapping for "${artworkSlug}"`] };
  }
  return { ok: true, value, missing: [] };
}

/** Human-readable reason a fulfillment submission was refused. */
export function describeMissingFulfillmentInputs(missing: string[]): string {
  return `Order inputs incomplete — missing ${[...new Set(missing)].join(
    ", ",
  )}. Order not submitted to the print partner.`;
}

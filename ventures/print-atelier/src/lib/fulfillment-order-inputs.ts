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
  lineItemQuantities: "lineItemQuantities",
  lineItemUnitAmounts: "lineItemUnitAmounts",
  /**
   * Order-wide fallback for the per-line `catalogSlug_<index>`. Both are
   * written by `buildCheckoutSessionPayload`.
   */
  catalogSlug: "catalogSlug",
} as const;

/**
 * Both line lists are one comma-separated key rather than one key per line.
 *
 * Stripe caps metadata at 50 keys. The checkout already writes 9 order-wide keys
 * plus 4 per line, so a cart of 11 lines is rejected by Stripe today; two more
 * per-line keys would bring that ceiling down to 8. A compact list costs one key
 * whatever the cart size and leaves the ceiling where it is.
 */
const LINE_LIST_SEPARATOR = ",";

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

/**
 * The one definition of a print file URL this venture will act on.
 *
 * It lives here, and `checkout.ts`'s `hasUsablePrintFile` calls it, because the
 * two ends previously each carried their own copy of `startsWith("https://")`.
 * They *agreed*, which is what made the defect invisible: the listing said
 * sellable and the adapter said fulfillable, and both were wrong about the same
 * inputs. Measured 2026-08-05 with `printFileUrl` set to the bare string
 * `"https://"` — `hasUsablePrintFile` returned true, `validateCheckoutLineItem`
 * returned zero blockers and `eligible: true`, `buildCheckoutSessionPayload`
 * created the session, and `toPrintfulWirePayload` emitted
 * `files: [{ url: "https://" }]` while Gelato got `fileUrl: "https://"`. That is
 * the charge-then-cannot-fulfil failure the print-file blocker exists to
 * prevent, arriving through the blocker itself.
 *
 * What is required, and why each one:
 *
 *   - **Parses as an absolute URL.** `new URL(value)` rather than a prefix test.
 *     `"https://"` and `"not a url"` throw; a prefix test cannot tell them apart
 *     from a URL.
 *   - **Scheme `https`, compared case-insensitively.** RFC 3986 §3.1 makes
 *     schemes case-insensitive, and `startsWith("https://")` rejected
 *     `"HTTPS://host/a.tif"` — a valid URL, refused as unfetchable. `URL`
 *     lowercases `protocol` during parsing, so the comparison below is already
 *     case-insensitive; there is no `toLowerCase()` to forget. `http` stays
 *     refused: the partner fetches this from its own infrastructure, and a
 *     plaintext fetch of an artist's full-resolution master is not something to
 *     hand to a third party.
 *   - **A host that could resolve on the public internet** — non-empty, and
 *     either an IP literal or a name with a dot in it. The WHATWG parser refuses
 *     an empty host for `https` outright, but it is *forgiving* about extra
 *     slashes: `new URL("https:///path/a.tif")` does not throw, it silently
 *     re-reads `path` as the hostname. A single-label host is not resolvable by
 *     a POD partner's fetcher, so accepting one is the same fail-open with a
 *     typo in front of it. This subsumes the non-empty check rather than
 *     repeating it — see the comment at the clause.
 *   - **Addresses a resource** — a path beyond `/`, or a query string. A bare
 *     origin (`"https://host"`, and `"https:///path"` once the parser has
 *     rewritten it to host `path` with path `/`) names a site, not a file; a
 *     partner told to fetch it downloads a home page and prints it or rejects
 *     the job, after the buyer has paid. The query-string alternative is
 *     deliberate: signed download endpoints of the form
 *     `https://dl.example.com/?id=…` do address one file, and refusing those
 *     would refuse real revenue.
 *   - **No embedded credentials.** `https://user:pw@host/a.tif` is a valid URL
 *     that hands a secret to a third party and writes it into their request
 *     logs. `parseSiteUrl` in `site-url.ts` refuses userinfo for the same
 *     reason.
 *
 * What is deliberately *not* required:
 *
 *   - **Reachability.** No fetch, ever. `atelier.marisstella.dev` currently runs
 *     an `nginxdemos/hello` echo server that answers any path with `200` and
 *     `content-type: image/tiff` over a 197-byte status body, so a successful
 *     GET is not evidence a print file exists — see
 *     `tests/catalog-print-file-provenance.test.ts`, which is where provenance
 *     is actually established. This function checks shape, which is all a pure
 *     function can check, and a well-formed fabrication still passes it.
 *   - **A fragment-free URL.** A fragment is never sent to the server, so it
 *     cannot make a fetch fail. Refusing it would be strictness with no failure
 *     behind it, which is how D3 above came to exist.
 *
 * Returns the **trimmed original** rather than `parsed.href`. Normalisation is
 * semantics-preserving for the URL but not necessarily for a *signature*: a
 * pre-signed URL whose token covers the exact path and query can be invalidated
 * by re-encoding. The operator recorded a string; the partner fetches that
 * string.
 */
export function parsePrintFileUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }
  // Non-empty *and* resolvable, in one comparison. An IPv6 literal arrives
  // bracketed; an IPv4 literal is dotted like a name. There is no separate
  // `hostname === ""` check because this one already refuses it and a check that
  // cannot fail is worse than no check — deleting a standalone empty-host clause
  // broke no test, since the WHATWG parser refuses an empty host for `https`
  // before this line is reached.
  if (!parsed.hostname.includes(".") && !parsed.hostname.startsWith("[")) {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if ((parsed.pathname === "" || parsed.pathname === "/") && parsed.search === "") {
    return null;
  }

  return trimmed;
}

/** `parsePrintFileUrl` as a predicate, for callers that only need yes or no. */
export function isUsablePrintFileUrl(value: unknown): boolean {
  return parsePrintFileUrl(value) !== null;
}

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
 * What counts as usable is `parsePrintFileUrl` above — the same function
 * `checkout.ts` blocks a listing with. This end used to apply its own
 * `startsWith("https://")`, identical to the storefront's copy and wrong in the
 * same two ways, so the two ends agreed on accepting `"https://"` and agreed on
 * refusing `"HTTPS://host/a.tif"`.
 */
export function resolvePrintFileUrl(
  paymentMetadata: Record<string, unknown> = {},
  index = 0,
): ResolvedValue {
  const sharedKey = FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl;
  const lineKey = `${sharedKey}_${index}`;

  const lineValue = readMetadataString(paymentMetadata, lineKey);
  const value = lineValue !== "" ? lineValue : readMetadataString(paymentMetadata, sharedKey);

  const usable = parsePrintFileUrl(value);
  if (usable === null) {
    return { ok: false, value: "", missing: [lineKey] };
  }
  return { ok: true, value: usable, missing: [] };
}

/**
 * Which catalog artwork one line of the order is for.
 *
 * Both adapters resolved this as `readMetadataString(paymentMetadata,
 * "catalogSlug") ?? "sample-print"` — the last invented fulfillment input left
 * in this venture after the address, the buyer email, the quantity and the unit
 * price were taken out. It was contained only by accident: `sample-print` is
 * absent from `defaultPrintfulVariantMappings` and
 * `defaultGelatoVariantMappings`, so the product lookup failed and the order was
 * refused. That is a guard resting on the *absence* of a row in a seed file
 * nobody is required to keep any particular shape. Adding a `sample-print`
 * mapping is an ordinary thing to do while testing a partner integration, and
 * doing it would turn every order carrying no `catalogSlug` into a real order
 * for the sample print — printed and posted to a buyer who paid for a different
 * artwork.
 *
 * It also misdirected the operator: the refusal read `product mapping for
 * "sample-print"`, which reads as "add a variant mapping" when the missing
 * input is the slug itself.
 *
 * Empty means unresolved. Every caller treats that as a reason to refuse.
 */
export function resolveLineCatalogSlug(
  paymentMetadata: Record<string, unknown> = {},
  index = 0,
): ResolvedValue {
  const lineKey = `${FULFILLMENT_INPUT_METADATA_KEYS.catalogSlug}_${index}`;
  const lineValue = readMetadataString(paymentMetadata, lineKey);
  const value =
    lineValue !== ""
      ? lineValue
      : readMetadataString(paymentMetadata, FULFILLMENT_INPUT_METADATA_KEYS.catalogSlug);

  if (value === "") {
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

/** A whole number lifted from a comma-separated per-line metadata list. */
export type ResolvedCount = {
  ok: boolean;
  /** Zero when unresolved, so no caller can read it as "one of something". */
  value: number;
  missing: string[];
};

function resolveLineNumber(
  paymentMetadata: Record<string, unknown>,
  key: string,
  index: number,
  minimum: number,
): ResolvedCount {
  const raw = readMetadataString(paymentMetadata, key);
  const entry = (raw === "" ? [] : raw.split(LINE_LIST_SEPARATOR))[index]?.trim() ?? "";

  if (!/^\d+$/.test(entry)) {
    return { ok: false, value: 0, missing: [`${key}[${index}]`] };
  }
  const value = Number.parseInt(entry, 10);
  if (!Number.isSafeInteger(value) || value < minimum) {
    return { ok: false, value: 0, missing: [`${key}[${index}]`] };
  }
  return { ok: true, value, missing: [] };
}

/**
 * How many prints of one line the buyer paid for.
 *
 * Both adapters hardcoded `quantity: 1` while the checkout charged for the real
 * quantity, so a cart of three copies of an $85 print took $261.95 and ordered
 * one. The number was never missing — `buildCheckoutSessionPayload` had it, put
 * it on the Stripe line item the buyer is charged from, and then wrote only
 * `lineItemCount` (how many *distinct* lines) into the metadata the fulfillment
 * side reads. Charging for three and shipping one is not an edge case a default
 * covers; it is the default being wrong on every multi-quantity order.
 */
export function resolveLineItemQuantity(
  paymentMetadata: Record<string, unknown> = {},
  index = 0,
): ResolvedCount {
  // No `if (raw === "") return 1`. An order that carries no quantity is exactly
  // the order this function was written for — every order did, until the
  // checkout started writing the list — and answering "one" for it is the
  // original defect with a resolver in front of it.
  return resolveLineNumber(
    paymentMetadata,
    FULFILLMENT_INPUT_METADATA_KEYS.lineItemQuantities,
    index,
    1,
  );
}

/**
 * What one print of this line retails for, in minor units.
 *
 * Printful's `retail_price` is per item and is what the customs declaration is
 * built from. It was set to the whole PaymentIntent amount — shipping included —
 * on every line of the order. With the quantity corrected that error compounds
 * rather than cancels, so the two are carried together or not at all.
 */
export function resolveLineItemUnitAmountCents(
  paymentMetadata: Record<string, unknown> = {},
  index = 0,
): ResolvedCount {
  // No order-total fallback either. The order total *was* the fallback, and
  // declaring it as the unit price of every item is the customs error this
  // exists to end; `{ ok: true, value: 0 }` would be the same order passing the
  // gate with a $0.00 declaration instead.
  return resolveLineNumber(
    paymentMetadata,
    FULFILLMENT_INPUT_METADATA_KEYS.lineItemUnitAmounts,
    index,
    1,
  );
}

/** Human-readable reason a fulfillment submission was refused. */
export function describeMissingFulfillmentInputs(missing: string[]): string {
  return `Order inputs incomplete — missing ${[...new Set(missing)].join(
    ", ",
  )}. Order not submitted to the print partner.`;
}

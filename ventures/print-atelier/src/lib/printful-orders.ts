import type { OrderRecord } from "./orders";
import {
  createInMemoryFulfillmentSubmissionStore,
  type FulfillmentSubmissionStoreDescriptor,
} from "./fulfillment-submission-store";
import {
  describeMissingBuyerShipping,
  resolveBuyerShippingAddress,
} from "./buyer-shipping";
import {
  defaultPrintfulVariantMappings,
  resolvePrintfulVariantId,
  type PrintfulVariantMapping,
} from "./printful-variant-map";
import {
  describeMissingFulfillmentInputs,
  resolveBuyerEmail,
  resolveLineItemQuantity,
  resolveLineItemUnitAmountCents,
  resolvePartnerProductId,
  resolvePrintFileUrl,
} from "./fulfillment-order-inputs";

export type PrintfulOrderRecipient = {
  name: string;
  address1: string;
  city: string;
  stateCode: string;
  countryCode: string;
  zip: string;
};

export type PrintfulOrderItem = {
  variantId: string;
  quantity: number;
  retailPrice: string;
  name: string;
  /**
   * The artwork Printful prints for this line, sent as its `files` entry. Empty
   * when unresolved, so `queuePrintfulFulfillmentFromOrder` refuses the order —
   * no print file exists in this repository, and pointing `files` at a product
   * page is what `gelato-orders.ts` was stopped from doing in 35b96d60.
   */
  printFileUrl: string;
};

export type PrintfulOrderPayload = {
  externalId: string;
  recipient: PrintfulOrderRecipient;
  items: PrintfulOrderItem[];
  retailCosts: {
    currency: string;
    subtotal: string;
    /**
     * Omitted when unknown rather than declared as zero. These are the retail
     * values Printful puts on the customs declaration for an international
     * shipment, so a hardcoded "0.00" understates a parcel the buyer was
     * charged shipping and tax on. Nothing writes `shippingCost`/`taxCost` into
     * payment metadata yet — carrying the figures the checkout already computes
     * is follow-up work in `checkout.ts`.
     */
    shipping?: string;
    tax?: string;
  };
  packingSlip?: {
    email: string;
    message: string;
  };
};

export type PrintfulOrderSubmission = {
  orderId: string;
  partner: "printful";
  mode: "dry_run" | "api_submit";
  status: "queued" | "submitted" | "skipped" | "blocked";
  apiEndpoint: string;
  payload: PrintfulOrderPayload;
  message: string;
  httpStatus?: number;
  httpOk?: boolean;
  responseSnippet?: string;
  retryCount?: number;
  maxRetries?: number;
  lastAttemptAt?: string;
  canRetry?: boolean;
};

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const PRINTFUL_ORDERS_ENDPOINT = "https://api.printful.com/orders";

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

/** Drop keys with no resolved value, so an unknown cost is absent, not zero. */
function omitUnset(fields: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}

export function buildPrintfulOrderPayload(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  variantMappings: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): PrintfulOrderPayload {
  const subtotal = (order.amountCents / 100).toFixed(2);

  const catalogSlug = readMetadataString(paymentMetadata, "catalogSlug") ?? "sample-print";
  // Unresolved stays empty so `queuePrintfulFulfillmentFromOrder` can refuse the
  // order — see `fulfillment-order-inputs.ts`. `buyer@printatelier.com` is a
  // studio inbox, and it was on the packing slip of every order.
  const buyerEmail = resolveBuyerEmail(paymentMetadata).value;

  // Whatever the buyer actually gave us, and nothing else. An unresolved field
  // stays empty so `queuePrintfulFulfillmentFromOrder` can refuse the order;
  // filling it in would ship someone else's print to a placeholder street.
  const { address } = resolveBuyerShippingAddress(paymentMetadata);

  return {
    externalId: order.orderId,
    recipient: {
      name: address.name,
      address1: address.address1,
      city: address.city,
      stateCode: address.state,
      countryCode: address.countryCode,
      zip: address.postalCode,
    },
    items: Array.from({ length: Math.max(order.lineItemCount, 1) }, (_, index) => {
      const lineSlug =
        readMetadataString(paymentMetadata, `catalogSlug_${index}`) ??
        (index === 0 ? catalogSlug : null) ??
        catalogSlug;
      const mappedVariantId = resolvePrintfulVariantId(lineSlug, variantMappings);
      // Unresolved stays 0 and "" so `queuePrintfulFulfillmentFromOrder` refuses
      // the order. `quantity: 1` charged for three prints and ordered one, and
      // `retailPrice: subtotal` declared the whole order — shipping included —
      // as the customs value of every single item.
      const unitAmount = resolveLineItemUnitAmountCents(paymentMetadata, index);
      return {
        variantId:
          readMetadataString(paymentMetadata, `variantId_${index}`) ??
          resolvePartnerProductId(mappedVariantId, lineSlug).value,
        quantity: resolveLineItemQuantity(paymentMetadata, index).value,
        retailPrice: unitAmount.ok ? (unitAmount.value / 100).toFixed(2) : "",
        name:
          readMetadataString(paymentMetadata, `lineItemName_${index}`) ?? `Print — ${lineSlug}`,
        printFileUrl: resolvePrintFileUrl(paymentMetadata, index).value,
      };
    }),
    retailCosts: {
      currency: order.currency.toUpperCase(),
      subtotal,
      ...omitUnset({
        shipping: readMetadataString(paymentMetadata, "shippingCost"),
        tax: readMetadataString(paymentMetadata, "taxCost"),
      }),
    },
    packingSlip: {
      email: buyerEmail,
      message: "Thank you for supporting independent artists via Print Atelier.",
    },
  };
}

/**
 * Which non-address inputs this order is still missing. Read by
 * `queuePrintfulFulfillmentFromOrder` before anything can be submitted, so a
 * payload built from an incomplete order never reaches the partner.
 */
export function resolvePrintfulOrderInputs(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  variantMappings: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): { ok: boolean; missing: string[] } {
  const catalogSlug = readMetadataString(paymentMetadata, "catalogSlug") ?? "sample-print";
  const missing: string[] = [...resolveBuyerEmail(paymentMetadata).missing];

  for (let index = 0; index < Math.max(order.lineItemCount, 1); index += 1) {
    const lineSlug =
      readMetadataString(paymentMetadata, `catalogSlug_${index}`) ??
      (index === 0 ? catalogSlug : null) ??
      catalogSlug;

    // An explicit per-line variant from metadata is an operator override and
    // needs no mapping behind it.
    const explicitVariantId = readMetadataString(paymentMetadata, `variantId_${index}`);
    if (explicitVariantId === null || explicitVariantId === "") {
      missing.push(
        ...resolvePartnerProductId(resolvePrintfulVariantId(lineSlug, variantMappings), lineSlug)
          .missing,
      );
    }

    missing.push(...resolveLineItemQuantity(paymentMetadata, index).missing);
    missing.push(...resolveLineItemUnitAmountCents(paymentMetadata, index).missing);
    missing.push(...resolvePrintFileUrl(paymentMetadata, index).missing);
  }

  const deduped = [...new Set(missing)];
  return { ok: deduped.length === 0, missing: deduped };
}

export function getPrintfulEnvStatus(env: Record<string, string | undefined>): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!env.PRINTFUL_API_KEY?.trim()) {
    blockers.push("PRINTFUL_API_KEY missing");
  }
  if (!env.PRINTFUL_STORE_ID?.trim()) {
    blockers.push("PRINTFUL_STORE_ID missing");
  }
  return { ready: blockers.length === 0, blockers };
}

/**
 * The payload as Printful's Orders API takes it. The type above is the shape the
 * rest of this venture reads — operator panels, stored submissions — and stays
 * camelCase; the conversion happens here, at the wire boundary, and nowhere else.
 *
 * The field names are snake_case: `docs/research/2026-06-12-printful-variant-retargeting.md:5`
 * records `variant_id` per line item against the create-order endpoint, and
 * `external_id`, `retail_price`, `state_code` and `country_code` are named in
 * `docs/CONTROL-AUDIT-2026-08-04.md` (print-atelier item 2). `retail_costs`,
 * `packing_slip` and the element shape of `files` are NOT covered by either
 * document — they follow the same convention as the fields that are, which is
 * an inference, not something this repository verified against the vendor.
 */
export type PrintfulWireOrderPayload = {
  external_id: string;
  recipient: {
    name: string;
    address1: string;
    city: string;
    state_code: string;
    country_code: string;
    zip: string;
  };
  items: Array<{
    variant_id: string;
    quantity: number;
    retail_price: string;
    name: string;
    /** Absent when no print file resolved, never a fabricated URL. */
    files?: Array<{ url: string }>;
  }>;
  retail_costs: {
    currency: string;
    subtotal: string;
    shipping?: string;
    tax?: string;
  };
  packing_slip?: {
    email: string;
    message: string;
  };
};

export function toPrintfulWirePayload(payload: PrintfulOrderPayload): PrintfulWireOrderPayload {
  return {
    external_id: payload.externalId,
    recipient: {
      name: payload.recipient.name,
      address1: payload.recipient.address1,
      city: payload.recipient.city,
      state_code: payload.recipient.stateCode,
      country_code: payload.recipient.countryCode,
      zip: payload.recipient.zip,
    },
    items: payload.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      retail_price: item.retailPrice,
      name: item.name,
      ...(item.printFileUrl === "" ? {} : { files: [{ url: item.printFileUrl }] }),
    })),
    retail_costs: {
      currency: payload.retailCosts.currency,
      subtotal: payload.retailCosts.subtotal,
      ...omitUnset({
        shipping: payload.retailCosts.shipping ?? null,
        tax: payload.retailCosts.tax ?? null,
      }),
    },
    ...(payload.packingSlip ? { packing_slip: payload.packingSlip } : {}),
  };
}

export async function submitPrintfulOrder(
  payload: PrintfulOrderPayload,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike = fetch,
): Promise<{ ok: boolean; status: number; body: string }> {
  const storeId = env.PRINTFUL_STORE_ID ?? "";
  const response = await fetchFn(`${PRINTFUL_ORDERS_ENDPOINT}?store_id=${storeId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PRINTFUL_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toPrintfulWirePayload(payload)),
  });
  return {
    ok: response.ok,
    status: response.status,
    body: await response.text(),
  };
}

export async function queuePrintfulFulfillmentFromOrder(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<PrintfulOrderSubmission | null> {
  if (order.fulfillmentPartnerId !== "printful") {
    return null;
  }

  const payload = buildPrintfulOrderPayload(order, paymentMetadata);
  const envStatus = getPrintfulEnvStatus(env);

  // Fail closed before anything else, including before the dry-run branch: a
  // queued dry run is the record an operator later retries, so an order with no
  // buyer address must never enter the queue looking submittable.
  const shipping = resolveBuyerShippingAddress(paymentMetadata);
  if (!shipping.ok) {
    return recordPrintfulFulfillmentSubmission({
      orderId: order.orderId,
      partner: "printful",
      mode: "dry_run",
      status: "blocked",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: describeMissingBuyerShipping(shipping.missing),
      canRetry: false,
    });
  }

  // The rest of the order, on the same terms: no buyer email and no mapped
  // variant means no submission. `canRetry` stays false for the same reason the
  // address guard sets it — the retry path holds the payload but not the
  // metadata, so retrying cannot supply what is missing here.
  const inputs = resolvePrintfulOrderInputs(order, paymentMetadata);
  if (!inputs.ok) {
    return recordPrintfulFulfillmentSubmission({
      orderId: order.orderId,
      partner: "printful",
      mode: "dry_run",
      status: "blocked",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: describeMissingFulfillmentInputs(inputs.missing),
      canRetry: false,
    });
  }

  if (!envStatus.ready) {
    return recordPrintfulFulfillmentSubmission({
      orderId: order.orderId,
      partner: "printful",
      mode: "dry_run",
      status: "queued",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: `Printful order queued (dry run) — configure ${envStatus.blockers.join(", ")}`,
    });
  }

  if (!fetchFn) {
    return recordPrintfulFulfillmentSubmission({
      orderId: order.orderId,
      partner: "printful",
      mode: "api_submit",
      status: "queued",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: `Printful payload ready — ${payload.items.length} line items for ${payload.recipient.countryCode}`,
    });
  }

  const http = await submitPrintfulOrder(payload, env, fetchFn);
  const isBlocked = !http.ok;
  return recordPrintfulFulfillmentSubmission({
    orderId: order.orderId,
    partner: "printful",
    mode: "api_submit",
    status: http.ok ? "submitted" : "blocked",
    apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
    payload,
    httpStatus: http.status,
    httpOk: http.ok,
    responseSnippet: http.body.slice(0, 200),
    message: http.ok
      ? `Printful order submitted for ${order.orderId}`
      : `Printful API error (${http.status})`,
    retryCount: 0,
    maxRetries: 3,
    lastAttemptAt: new Date().toISOString(),
    canRetry: isBlocked,
  });
}

const fulfillmentStore =
  createInMemoryFulfillmentSubmissionStore<PrintfulOrderSubmission>("printful");

export function getPrintfulFulfillmentSubmissions(): PrintfulOrderSubmission[] {
  return fulfillmentStore.list();
}

export function getPrintfulFulfillmentStoreDescriptor(): FulfillmentSubmissionStoreDescriptor {
  return { ...fulfillmentStore.descriptor };
}

export function getPrintfulRetryQueue(): PrintfulOrderSubmission[] {
  return fulfillmentStore
    .list()
    .filter(
      (item) => item.status === "blocked" && (item.canRetry ?? true) && (item.retryCount ?? 0) < (item.maxRetries ?? 3),
    );
}

export async function retryPrintfulFulfillmentSubmission(
  orderId: string,
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<PrintfulOrderSubmission | null> {
  const existing = fulfillmentStore.find(orderId);
  if (!existing || existing.status !== "blocked") {
    return null;
  }

  // `canRetry: false` is set by the buyer-address guard, and a retry cannot
  // supply the address the guard was missing — the submission holds the payload
  // but not the payment metadata. Retrying here would POST the empty recipient
  // the guard exists to stop.
  if (existing.canRetry === false) {
    return existing;
  }

  const currentRetries = existing.retryCount ?? 0;
  const maxRetries = existing.maxRetries ?? 3;
  if (currentRetries >= maxRetries) {
    existing.canRetry = false;
    existing.message = `Printful retry limit exceeded (${maxRetries} max retries)`;
    return existing;
  }

  if (!fetchFn) {
    existing.retryCount = currentRetries + 1;
    existing.lastAttemptAt = new Date().toISOString();
    existing.message = `Printful retry #${existing.retryCount} queued — waiting for active API key or fetch handler`;
    return existing;
  }

  const http = await submitPrintfulOrder(existing.payload, env, fetchFn);
  existing.retryCount = currentRetries + 1;
  existing.lastAttemptAt = new Date().toISOString();
  existing.httpStatus = http.status;
  existing.httpOk = http.ok;
  existing.responseSnippet = http.body.slice(0, 200);

  if (http.ok) {
    existing.status = "submitted";
    existing.canRetry = false;
    existing.message = `Printful order submitted on retry #${existing.retryCount} for ${orderId}`;
  } else {
    existing.status = "blocked";
    existing.canRetry = existing.retryCount < maxRetries;
    existing.message = `Printful API error on retry #${existing.retryCount} (${http.status})`;
  }

  return existing;
}

export function recordPrintfulFulfillmentSubmission(
  submission: PrintfulOrderSubmission,
): PrintfulOrderSubmission {
  return fulfillmentStore.record(submission);
}

export function clearPrintfulFulfillmentForTests(): void {
  fulfillmentStore.clear();
}

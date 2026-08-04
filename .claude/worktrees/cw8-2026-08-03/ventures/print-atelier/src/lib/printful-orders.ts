import type { OrderRecord } from "./orders";
import {
  defaultPrintfulVariantMappings,
  resolvePrintfulVariantId,
  type PrintfulVariantMapping,
} from "./printful-variant-map";

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
};

export type PrintfulOrderPayload = {
  externalId: string;
  recipient: PrintfulOrderRecipient;
  items: PrintfulOrderItem[];
  retailCosts: {
    currency: string;
    subtotal: string;
    shipping: string;
    tax: string;
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

export function buildPrintfulOrderPayload(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  variantMappings: PrintfulVariantMapping[] = defaultPrintfulVariantMappings,
): PrintfulOrderPayload {
  const region = order.shippingRegion ?? "US";
  const countryCode = region === "UK" ? "GB" : region.slice(0, 2).toUpperCase();
  const subtotal = (order.amountCents / 100).toFixed(2);

  const catalogSlug = readMetadataString(paymentMetadata, "catalogSlug") ?? "sample-print";
  const buyerEmail = readMetadataString(paymentMetadata, "buyerEmail") ?? "buyer@printatelier.com";

  return {
    externalId: order.orderId,
    recipient: {
      name: readMetadataString(paymentMetadata, "shippingName") ?? "Print Atelier Buyer",
      address1: readMetadataString(paymentMetadata, "shippingAddress1") ?? "123 Market St",
      city: readMetadataString(paymentMetadata, "shippingCity") ?? "San Francisco",
      stateCode: readMetadataString(paymentMetadata, "shippingState") ?? "CA",
      countryCode,
      zip: readMetadataString(paymentMetadata, "shippingZip") ?? "94105",
    },
    items: Array.from({ length: Math.max(order.lineItemCount, 1) }, (_, index) => {
      const lineSlug =
        readMetadataString(paymentMetadata, `catalogSlug_${index}`) ??
        (index === 0 ? catalogSlug : null) ??
        catalogSlug;
      const mappedVariantId = resolvePrintfulVariantId(lineSlug, variantMappings);
      return {
        variantId:
          readMetadataString(paymentMetadata, `variantId_${index}`) ??
          mappedVariantId ??
          `pf_${lineSlug}`,
        quantity: 1,
        retailPrice: subtotal,
        name:
          readMetadataString(paymentMetadata, `lineItemName_${index}`) ?? `Print — ${lineSlug}`,
      };
    }),
    retailCosts: {
      currency: order.currency.toUpperCase(),
      subtotal,
      shipping: readMetadataString(paymentMetadata, "shippingCost") ?? "0.00",
      tax: readMetadataString(paymentMetadata, "taxCost") ?? "0.00",
    },
    packingSlip: {
      email: buyerEmail,
      message: "Thank you for supporting independent artists via Print Atelier.",
    },
  };
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
    body: JSON.stringify(payload),
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

const fulfillmentStore: PrintfulOrderSubmission[] = [];

export function getPrintfulFulfillmentSubmissions(): PrintfulOrderSubmission[] {
  return [...fulfillmentStore];
}

export function getPrintfulRetryQueue(): PrintfulOrderSubmission[] {
  return fulfillmentStore.filter(
    (item) => item.status === "blocked" && (item.canRetry ?? true) && (item.retryCount ?? 0) < (item.maxRetries ?? 3),
  );
}

export async function retryPrintfulFulfillmentSubmission(
  orderId: string,
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<PrintfulOrderSubmission | null> {
  const existing = fulfillmentStore.find((item) => item.orderId === orderId);
  if (!existing || existing.status !== "blocked") {
    return null;
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
  fulfillmentStore.unshift(submission);
  if (fulfillmentStore.length > 50) {
    fulfillmentStore.length = 50;
  }
  return submission;
}

export function clearPrintfulFulfillmentForTests(): void {
  fulfillmentStore.length = 0;
}

import type { OrderRecord } from "./orders";

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
    items: Array.from({ length: Math.max(order.lineItemCount, 1) }, (_, index) => ({
      variantId: readMetadataString(paymentMetadata, `variantId_${index}`) ?? `pf_${catalogSlug}`,
      quantity: 1,
      retailPrice: subtotal,
      name: readMetadataString(paymentMetadata, `lineItemName_${index}`) ?? `Print — ${catalogSlug}`,
    })),
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
    return {
      orderId: order.orderId,
      partner: "printful",
      mode: "dry_run",
      status: "queued",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: `Printful order queued (dry run) — configure ${envStatus.blockers.join(", ")}`,
    };
  }

  if (!fetchFn) {
    return {
      orderId: order.orderId,
      partner: "printful",
      mode: "api_submit",
      status: "queued",
      apiEndpoint: PRINTFUL_ORDERS_ENDPOINT,
      payload,
      message: `Printful payload ready — ${payload.items.length} line items for ${payload.recipient.countryCode}`,
    };
  }

  const http = await submitPrintfulOrder(payload, env, fetchFn);
  return {
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
  };
}

const fulfillmentStore: PrintfulOrderSubmission[] = [];

export function getPrintfulFulfillmentSubmissions(): PrintfulOrderSubmission[] {
  return [...fulfillmentStore];
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

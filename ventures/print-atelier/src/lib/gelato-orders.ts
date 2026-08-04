import type { OrderRecord } from "./orders";
import {
  describeMissingBuyerShipping,
  resolveBuyerShippingAddress,
} from "./buyer-shipping";
import {
  defaultGelatoVariantMappings,
  resolveGelatoProductUid,
  type GelatoVariantMapping,
} from "./gelato-variant-map";

export type GelatoShippingAddress = {
  firstName: string;
  lastName: string;
  addressLine1: string;
  city: string;
  state: string;
  postCode: string;
  country: string;
  email: string;
};

export type GelatoOrderItem = {
  itemReferenceId: string;
  productUid: string;
  quantity: number;
  fileUrl: string;
};

export type GelatoOrderPayload = {
  orderType: "order";
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  items: GelatoOrderItem[];
  shippingAddress: GelatoShippingAddress;
};

export type GelatoOrderSubmission = {
  orderId: string;
  partner: "gelato";
  mode: "dry_run" | "api_submit";
  status: "queued" | "submitted" | "skipped" | "blocked";
  apiEndpoint: string;
  payload: GelatoOrderPayload;
  message: string;
  httpStatus?: number;
  httpOk?: boolean;
  responseSnippet?: string;
};

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const GELATO_ORDERS_ENDPOINT = "https://order.gelatoapis.com/v4/orders";

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

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (trimmed === "") {
    // No name to split. Returning a stand-in here would defeat the guard in
    // `queueGelatoFulfillmentFromOrder`, which reads the resolution, not this.
    return { firstName: "", lastName: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] ?? "Buyer", lastName: "Print Atelier" };
  }
  return {
    firstName: parts[0] ?? "Buyer",
    lastName: parts.slice(1).join(" "),
  };
}

export function buildGelatoOrderPayload(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  variantMappings: GelatoVariantMapping[] = defaultGelatoVariantMappings,
): GelatoOrderPayload {
  // The buyer's own address, with no substitutions — see `buyer-shipping.ts`.
  // `region` no longer decides the country: "EU".slice(0,2) produced the
  // country code "EU", and "APAC" produced "AP", neither of which is a country.
  const { address } = resolveBuyerShippingAddress(paymentMetadata);
  const countryCode = address.countryCode;
  const { firstName, lastName } = splitName(address.name);
  const catalogSlug = readMetadataString(paymentMetadata, "catalogSlug") ?? "sample-print";
  const buyerEmail =
    readMetadataString(paymentMetadata, "buyerEmail") ?? "buyer@printatelier.com";
  const artworkUrl =
    readMetadataString(paymentMetadata, "artworkUrl") ??
    `https://printatelier.com/prints/${catalogSlug}`;

  return {
    orderType: "order",
    orderReferenceId: order.orderId,
    customerReferenceId: order.paymentIntentId ?? order.orderId,
    currency: order.currency.toUpperCase(),
    items: Array.from({ length: Math.max(order.lineItemCount, 1) }, (_, index) => {
      const lineSlug =
        readMetadataString(paymentMetadata, `catalogSlug_${index}`) ??
        (index === 0 ? catalogSlug : null) ??
        catalogSlug;
      const mappedProductUid = resolveGelatoProductUid(lineSlug, variantMappings);
      return {
        itemReferenceId: `${order.orderId}_${index}`,
        productUid:
          readMetadataString(paymentMetadata, `gelatoProductUid_${index}`) ??
          mappedProductUid ??
          `gel_${lineSlug}`,
        quantity: 1,
        fileUrl:
          readMetadataString(paymentMetadata, `artworkUrl_${index}`) ?? artworkUrl,
      };
    }),
    shippingAddress: {
      firstName,
      lastName,
      addressLine1: address.address1,
      city: address.city,
      state: address.state,
      postCode: address.postalCode,
      country: countryCode,
      email: buyerEmail,
    },
  };
}

export function getGelatoEnvStatus(env: Record<string, string | undefined>): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!env.GELATO_API_KEY?.trim()) {
    blockers.push("GELATO_API_KEY missing");
  }
  if (!env.GELATO_STORE_ID?.trim()) {
    blockers.push("GELATO_STORE_ID missing");
  }
  return { ready: blockers.length === 0, blockers };
}

export async function submitGelatoOrder(
  payload: GelatoOrderPayload,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike = fetch,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetchFn(GELATO_ORDERS_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": env.GELATO_API_KEY ?? "",
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

export async function queueGelatoFulfillmentFromOrder(
  order: OrderRecord,
  paymentMetadata: Record<string, unknown> = {},
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<GelatoOrderSubmission | null> {
  if (order.fulfillmentPartnerId !== "gelato") {
    return null;
  }

  const payload = buildGelatoOrderPayload(order, paymentMetadata);
  const envStatus = getGelatoEnvStatus(env);

  // Fail closed before the dry-run branch, for the reason given in
  // `queuePrintfulFulfillmentFromOrder`.
  const shipping = resolveBuyerShippingAddress(paymentMetadata);
  if (!shipping.ok) {
    return recordGelatoFulfillmentSubmission({
      orderId: order.orderId,
      partner: "gelato",
      mode: "dry_run",
      status: "blocked",
      apiEndpoint: GELATO_ORDERS_ENDPOINT,
      payload,
      message: describeMissingBuyerShipping(shipping.missing),
    });
  }

  if (!envStatus.ready) {
    return {
      orderId: order.orderId,
      partner: "gelato",
      mode: "dry_run",
      status: "queued",
      apiEndpoint: GELATO_ORDERS_ENDPOINT,
      payload,
      message: `Gelato order queued (dry run) — configure ${envStatus.blockers.join(", ")}`,
    };
  }

  if (!fetchFn) {
    return {
      orderId: order.orderId,
      partner: "gelato",
      mode: "api_submit",
      status: "queued",
      apiEndpoint: GELATO_ORDERS_ENDPOINT,
      payload,
      message: `Gelato payload ready — ${payload.items.length} line items for ${payload.shippingAddress.country}`,
    };
  }

  const http = await submitGelatoOrder(payload, env, fetchFn);
  return {
    orderId: order.orderId,
    partner: "gelato",
    mode: "api_submit",
    status: http.ok ? "submitted" : "blocked",
    apiEndpoint: GELATO_ORDERS_ENDPOINT,
    payload,
    httpStatus: http.status,
    httpOk: http.ok,
    responseSnippet: http.body.slice(0, 200),
    message: http.ok
      ? `Gelato order submitted for ${order.orderId}`
      : `Gelato API error (${http.status})`,
  };
}

const fulfillmentStore: GelatoOrderSubmission[] = [];

export function getGelatoFulfillmentSubmissions(): GelatoOrderSubmission[] {
  return [...fulfillmentStore];
}

export function recordGelatoFulfillmentSubmission(
  submission: GelatoOrderSubmission,
): GelatoOrderSubmission {
  fulfillmentStore.unshift(submission);
  if (fulfillmentStore.length > 50) {
    fulfillmentStore.length = 50;
  }
  return submission;
}

export function clearGelatoFulfillmentForTests(): void {
  fulfillmentStore.length = 0;
}

import type { CheckoutShippingRegion } from "./checkout";

/**
 * Where a paid order is actually sent.
 *
 * This module exists because the print-on-demand adapters used to substitute a
 * placeholder address — `123 Market St, San Francisco` for Printful, `10 Market
 * Street, London` for Gelato — whenever the buyer's address was absent from the
 * payment metadata. It was always absent: the Stripe session never asked for
 * one. With live partner credentials configured, every paid order would have
 * produced a real print job addressed to a street the buyer had never heard of.
 *
 * A missing address is a reason to refuse to submit an order, never a reason to
 * invent one. Nothing in here has a default.
 */

export type BuyerShippingAddress = {
  name: string;
  address1: string;
  city: string;
  /** Empty where the destination country does not use a subdivision code. */
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, as both partner APIs require. */
  countryCode: string;
};

export type BuyerShippingResolution =
  | { ok: true; address: BuyerShippingAddress }
  | { ok: false; missing: string[]; address: BuyerShippingAddress };

/** Metadata keys the checkout writes and the fulfillment adapters read. */
export const BUYER_SHIPPING_METADATA_KEYS = {
  name: "shippingName",
  address1: "shippingAddress1",
  city: "shippingCity",
  state: "shippingState",
  postalCode: "shippingZip",
  countryCode: "shippingCountry",
} as const;

/**
 * Countries whose carriers reject an address with no subdivision. Everywhere
 * else `state` is genuinely optional, so requiring it would block real orders.
 */
const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA", "AU"]);

const REQUIRED_FIELDS = ["name", "address1", "city", "postalCode", "countryCode"] as const;

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
 * Read the buyer's address out of payment metadata without inventing any part
 * of it. The returned address is always present so callers can report what they
 * do have; `ok` is what decides whether an order may be submitted.
 */
export function resolveBuyerShippingAddress(
  paymentMetadata: Record<string, unknown> = {},
): BuyerShippingResolution {
  const address: BuyerShippingAddress = {
    name: readMetadataString(paymentMetadata, BUYER_SHIPPING_METADATA_KEYS.name),
    address1: readMetadataString(paymentMetadata, BUYER_SHIPPING_METADATA_KEYS.address1),
    city: readMetadataString(paymentMetadata, BUYER_SHIPPING_METADATA_KEYS.city),
    state: readMetadataString(paymentMetadata, BUYER_SHIPPING_METADATA_KEYS.state),
    postalCode: readMetadataString(paymentMetadata, BUYER_SHIPPING_METADATA_KEYS.postalCode),
    countryCode: readMetadataString(
      paymentMetadata,
      BUYER_SHIPPING_METADATA_KEYS.countryCode,
    ).toUpperCase(),
  };

  const missing: string[] = REQUIRED_FIELDS.filter((field) => address[field] === "").map(
    (field) => BUYER_SHIPPING_METADATA_KEYS[field],
  );

  if (address.countryCode !== "" && !/^[A-Z]{2}$/.test(address.countryCode)) {
    missing.push(BUYER_SHIPPING_METADATA_KEYS.countryCode);
  }

  if (
    address.state === "" &&
    STATE_REQUIRED_COUNTRIES.has(address.countryCode)
  ) {
    missing.push(BUYER_SHIPPING_METADATA_KEYS.state);
  }

  if (missing.length > 0) {
    return { ok: false, missing: [...new Set(missing)], address };
  }
  return { ok: true, address };
}

/** Human-readable reason a fulfillment submission was refused. */
export function describeMissingBuyerShipping(missing: string[]): string {
  return `Buyer shipping address incomplete — missing ${missing.join(", ")}. Order not submitted to the print partner.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNested(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Read the buyer's email off whichever Stripe object triggered the webhook.
 *
 * Stripe collects an email on every Checkout Session but exposes it in a
 * different place on each object: `customer_details.email` on the session,
 * `receipt_email` on the PaymentIntent, and `billing_details.email` on a
 * charge. None of them is `metadata`, which is what the fulfillment adapters
 * read, so without this the buyer's own address never reached them.
 */
function extractStripeBuyerEmail(paymentObject: Record<string, unknown>): string {
  const direct = readNested(paymentObject, "receipt_email");
  if (direct !== "") {
    return direct;
  }

  const customerDetails = isRecord(paymentObject.customer_details)
    ? paymentObject.customer_details
    : undefined;
  if (customerDetails) {
    const fromSession = readNested(customerDetails, "email");
    if (fromSession !== "") {
      return fromSession;
    }
  }

  const charges = isRecord(paymentObject.charges) ? paymentObject.charges : undefined;
  const chargeList = charges && Array.isArray(charges.data) ? charges.data : [];
  const charge = isRecord(paymentObject.latest_charge)
    ? paymentObject.latest_charge
    : chargeList.find(isRecord);
  if (charge && isRecord(charge.billing_details)) {
    return readNested(charge.billing_details, "email");
  }

  return "";
}

/**
 * Lift what the buyer supplied at checkout into the metadata shape the
 * fulfillment adapters read.
 *
 * Stripe does not put a collected shipping address into `metadata` — it hangs
 * it off the PaymentIntent as `shipping`, or off a Checkout Session as
 * `collected_information.shipping_details`. Both shapes are handled here so the
 * webhook does not have to know which object type triggered it. The buyer's
 * email is lifted on the same trip, for the same reason; the function name is
 * narrower than what it now carries because its one call site lives in a file
 * under concurrent edit.
 */
export function extractStripeShippingMetadata(
  paymentObject: unknown,
): Record<string, string> {
  if (!isRecord(paymentObject)) {
    return {};
  }

  const buyerEmail = extractStripeBuyerEmail(paymentObject);

  const collected = isRecord(paymentObject.collected_information)
    ? paymentObject.collected_information
    : undefined;
  const details = isRecord(paymentObject.shipping)
    ? paymentObject.shipping
    : collected && isRecord(collected.shipping_details)
      ? collected.shipping_details
      : undefined;

  // The email is emitted whether or not an address came with it. A payment that
  // carries one but not the other should surface the field it has, so the
  // adapters name only what is genuinely still missing.
  const address = details && isRecord(details.address) ? details.address : {};
  const fields: Record<string, string> = {
    buyerEmail,
    ...(details
      ? {
          [BUYER_SHIPPING_METADATA_KEYS.name]: readNested(details, "name"),
          [BUYER_SHIPPING_METADATA_KEYS.address1]: readNested(address, "line1"),
          [BUYER_SHIPPING_METADATA_KEYS.city]: readNested(address, "city"),
          [BUYER_SHIPPING_METADATA_KEYS.state]: readNested(address, "state"),
          [BUYER_SHIPPING_METADATA_KEYS.postalCode]: readNested(address, "postal_code"),
          [BUYER_SHIPPING_METADATA_KEYS.countryCode]: readNested(
            address,
            "country",
          ).toUpperCase(),
        }
      : {}),
  };

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
}

/**
 * Countries Stripe should offer for a cart routed to a given region. Stripe
 * refuses a session whose `allowed_countries` is empty, so every region here
 * must name at least one country the fulfillment partner actually serves.
 */
const regionShippingCountries: Record<CheckoutShippingRegion, string[]> = {
  US: ["US"],
  UK: ["GB"],
  EU: [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
    "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
    "SI", "ES", "SE",
  ],
  APAC: ["AU", "NZ", "JP", "SG", "HK", "KR", "MY", "TH"],
};

export function shippingAddressCollectionCountries(
  region: CheckoutShippingRegion,
): string[] {
  return [...regionShippingCountries[region]];
}

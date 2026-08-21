export type OrderStatus = "paid" | "fulfillment_queued" | "fulfilled" | "cancelled";

export type OrderRecord = {
  orderId: string;
  stripeEventId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  fulfillmentPartnerId: string | null;
  shippingRegion: string | null;
  artistTransferTotal: number | null;
  lineItemCount: number;
  testMode: boolean;
  recordedAt: string;
};

export type OrderSummary = {
  totalOrders: number;
  paidOrders: number;
  fulfillmentQueued: number;
  totalRevenueCents: number;
  totalArtistTransfers: number;
  lastOrderAt: string | null;
  testModeOrders: number;
};

const orderStore: OrderRecord[] = [];

function generateOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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

function parseMetadataNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recordOrderFromPaymentWebhook(
  stripeEventId: string,
  eventType: string,
  paymentObject: Record<string, unknown>,
  testMode: boolean,
  recordedAt?: string,
): OrderRecord | null {
  if (eventType !== "payment_intent.succeeded") {
    return null;
  }

  const existing = orderStore.find((order) => order.stripeEventId === stripeEventId);
  if (existing) {
    return existing;
  }

  const amount =
    typeof paymentObject.amount === "number" ? paymentObject.amount : 0;
  const currency =
    typeof paymentObject.currency === "string" ? paymentObject.currency : "usd";
  const paymentIntentId =
    typeof paymentObject.id === "string" ? paymentObject.id : null;
  const metadata =
    typeof paymentObject.metadata === "object" && paymentObject.metadata !== null
      ? (paymentObject.metadata as Record<string, unknown>)
      : undefined;

  const fulfillmentPartnerId = readMetadataString(metadata, "fulfillmentPartnerId");
  const shippingRegion = readMetadataString(metadata, "shippingRegion");
  const artistTransferTotal = parseMetadataNumber(
    readMetadataString(metadata, "artistTransferTotal"),
  );
  const lineItemCountRaw = readMetadataString(metadata, "lineItemCount");
  const lineItemCount = lineItemCountRaw
    ? Number.parseInt(lineItemCountRaw, 10) || 1
    : 1;

  const order: OrderRecord = {
    orderId: generateOrderId(),
    stripeEventId,
    paymentIntentId,
    amountCents: amount,
    currency,
    status: fulfillmentPartnerId ? "fulfillment_queued" : "paid",
    fulfillmentPartnerId,
    shippingRegion,
    artistTransferTotal,
    lineItemCount,
    testMode,
    recordedAt: recordedAt ?? new Date().toISOString(),
  };

  orderStore.unshift(order);
  if (orderStore.length > 100) {
    orderStore.length = 100;
  }

  return order;
}

/**
 * Returns true if an order was already recorded for this Stripe event id.
 * Stripe retries webhook deliveries (timeouts, non-2xx responses, manual
 * redelivery), so callers must check this before triggering side effects
 * that are not themselves idempotent (e.g. submitting a fulfillment order
 * to a print-on-demand partner) — recordOrderFromPaymentWebhook alone only
 * protects the OrderRecord store, not downstream actions.
 */
export function hasOrderForStripeEvent(stripeEventId: string): boolean {
  return orderStore.some((order) => order.stripeEventId === stripeEventId);
}

export function getOrderRecords(): OrderRecord[] {
  return [...orderStore];
}

export function clearOrdersForTests(): void {
  orderStore.length = 0;
}

export function buildOrderSummary(
  orders: OrderRecord[] = getOrderRecords(),
): OrderSummary {
  const paidOrders = orders.filter(
    (order) => order.status === "paid" || order.status === "fulfillment_queued",
  );
  const fulfillmentQueued = orders.filter(
    (order) => order.status === "fulfillment_queued",
  );

  return {
    totalOrders: orders.length,
    paidOrders: paidOrders.length,
    fulfillmentQueued: fulfillmentQueued.length,
    totalRevenueCents: orders.reduce((sum, order) => sum + order.amountCents, 0),
    totalArtistTransfers: orders.reduce(
      (sum, order) => sum + (order.artistTransferTotal ?? 0),
      0,
    ),
    lastOrderAt: orders[0]?.recordedAt ?? null,
    testModeOrders: orders.filter((order) => order.testMode).length,
  };
}

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
  artistAccountId?: string | null;
  artistHandle?: string | null;
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

/**
 * How many of the most recent orders are kept for display. The window is
 * bounded so a long-lived process cannot grow without limit.
 */
const ORDER_WINDOW_LIMIT = 100;

/**
 * Newest-first *display window* of order records — not a ledger, and not the
 * source of truth for anything else.
 *
 * Two things used to be derived from this array, and truncating it broke both:
 *  - Webhook idempotency was a scan of this array for a matching
 *    `stripeEventId`. Once an order fell out of the window a replayed Stripe
 *    `payment_intent.succeeded` was no longer recognised as a duplicate, so a
 *    second `OrderRecord` was created with a fresh `orderId` — and `orderId` is
 *    the partner-visible reference id (`orderReferenceId` for Gelato,
 *    `externalId` for Printful), so the print partner saw a genuinely new order
 *    and printed and shipped a second copy of a print paid for once.
 *  - `buildOrderSummary`'s `totalOrders` / `totalRevenueCents` /
 *    `totalArtistTransfers` were reduced over this array, so past 100 orders
 *    they silently became "the last 100" while the investor dashboard kept
 *    labelling them "Total orders" and "Revenue (cents)".
 *
 * Both now live in the dedicated structures below, which do not expire with the
 * display window.
 *
 * PROCESS-LOCAL AND NOT DURABLE — this is a real, unfixed gap, not a caveat.
 * `orderStore`, `ordersByStripeEventId` and `lifetimeTotals` are module state
 * inside one Node process. A pod restart, a redeploy, or a second replica
 * starts from empty, and then:
 *  - the dashboard's lifetime totals reset to zero and under-report every order
 *    taken before the restart; and
 *  - every previously processed `stripeEventId` becomes unknown, so a Stripe
 *    retry arriving after a restart IS recorded a second time and DOES queue a
 *    second fulfillment for an already-paid print.
 * Nothing in this file can close that — it needs a durable store shared across
 * processes. It is already tracked in `docs/BACKLOG.md` as "Convex order
 * persistence — migrate in-memory `src/lib/orders.ts` records to database";
 * note that item is ticked but not built (there is no database in this repo,
 * and `order-persistence.ts` is another in-memory array that emits Convex
 * schema *code*).
 */
const orderStore: OrderRecord[] = [];

/**
 * Idempotency index: `stripeEventId` -> the order that event created. Kept
 * separately from the display window so a replay is still recognised long after
 * its record has scrolled out of view. `Map` preserves insertion order, so the
 * bound is enforced by evicting the oldest event id first.
 *
 * The bound is sized against Stripe's retry window rather than against volume:
 * Stripe retries a failed webhook for up to about three days, so only events
 * from the last few days can be replayed at all. 10,000 distinct paid orders
 * inside a rolling three-day window (~3,300/day) is orders of magnitude above
 * anything this venture has taken. Memory is therefore constant in lifetime
 * order count — at most `PROCESSED_EVENT_LIMIT` retained `OrderRecord`s (a few
 * MB) plus seven counters — no matter how many orders the process has seen.
 * Records inside the display window are the same objects, not copies.
 *
 * If that ceiling were ever exceeded, the oldest event ids are dropped first,
 * which reopens the duplicate window for the oldest events only.
 */
const PROCESSED_EVENT_LIMIT = 10_000;
const ordersByStripeEventId = new Map<string, OrderRecord>();

/**
 * Running lifetime totals, updated on insert. These are what `buildOrderSummary`
 * reports when it is asked about the store, so a total stays a total once the
 * display window starts truncating.
 */
const lifetimeTotals: OrderSummary = {
  totalOrders: 0,
  paidOrders: 0,
  fulfillmentQueued: 0,
  totalRevenueCents: 0,
  totalArtistTransfers: 0,
  lastOrderAt: null,
  testModeOrders: 0,
};

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

  // Deliberately the idempotency index, not `orderStore`: the store is a
  // bounded display window and a replay can arrive after the original has
  // scrolled out of it. Returning the *original* record keeps `orderId` stable,
  // which is the reference id the print partner deduplicates on.
  const existing = ordersByStripeEventId.get(stripeEventId);
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
  const artistAccountId =
    readMetadataString(metadata, "artistAccountId") ??
    readMetadataString(metadata, "destinationConnectAccountId");
  const artistHandle = readMetadataString(metadata, "artistHandle");
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
    artistAccountId,
    artistHandle,
    lineItemCount,
    testMode,
    recordedAt: recordedAt ?? new Date().toISOString(),
  };

  orderStore.unshift(order);
  if (orderStore.length > ORDER_WINDOW_LIMIT) {
    orderStore.length = ORDER_WINDOW_LIMIT;
  }

  ordersByStripeEventId.set(stripeEventId, order);
  while (ordersByStripeEventId.size > PROCESSED_EVENT_LIMIT) {
    const oldest = ordersByStripeEventId.keys().next();
    if (oldest.done) {
      break;
    }
    ordersByStripeEventId.delete(oldest.value);
  }

  lifetimeTotals.totalOrders += 1;
  lifetimeTotals.totalRevenueCents += order.amountCents;
  lifetimeTotals.totalArtistTransfers += order.artistTransferTotal ?? 0;
  if (order.status === "paid" || order.status === "fulfillment_queued") {
    lifetimeTotals.paidOrders += 1;
  }
  if (order.status === "fulfillment_queued") {
    lifetimeTotals.fulfillmentQueued += 1;
  }
  if (order.testMode) {
    lifetimeTotals.testModeOrders += 1;
  }
  // Same semantics as the previous `orders[0]?.recordedAt`: the most recently
  // recorded order, not the largest timestamp.
  lifetimeTotals.lastOrderAt = order.recordedAt;

  return order;
}

/**
 * The bounded display window, newest first — at most `ORDER_WINDOW_LIMIT`
 * records. Callers that need a count or a sum over *all* orders must use
 * `buildOrderSummary()`, which does not read this window.
 */
export function getOrderRecords(): OrderRecord[] {
  return [...orderStore];
}

export function clearOrdersForTests(): void {
  orderStore.length = 0;
  ordersByStripeEventId.clear();
  lifetimeTotals.totalOrders = 0;
  lifetimeTotals.paidOrders = 0;
  lifetimeTotals.fulfillmentQueued = 0;
  lifetimeTotals.totalRevenueCents = 0;
  lifetimeTotals.totalArtistTransfers = 0;
  lifetimeTotals.lastOrderAt = null;
  lifetimeTotals.testModeOrders = 0;
}

/**
 * With no argument, reports the store's lifetime totals — these are labelled
 * and displayed as totals (investor dashboard "Total orders" / "Revenue
 * (cents)"), so they must not silently degrade into "the last
 * `ORDER_WINDOW_LIMIT`" once the display window truncates.
 *
 * With an explicit array, summarises exactly that array; callers such as
 * `summarizePersistedOrders` pass a filtered record set and expect a summary of
 * the set they passed, not of this module's store.
 */
export function buildOrderSummary(orders?: OrderRecord[]): OrderSummary {
  if (orders === undefined) {
    return { ...lifetimeTotals };
  }

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

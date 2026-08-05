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

/**
 * Whether a set of order records can honestly be presented as *all* the orders
 * this venture has taken money for.
 *
 * This is not decoration. `buildOrderSummary` reduces `totalRevenueCents` and
 * `totalArtistTransfers` over whatever records it is given, and
 * `payout-reconciliation.ts` builds each artist's owed amount from the same
 * set. If the set is a subset, both stay plausible and both under-report — in
 * the direction that flatters us and underpays the artist. A number that cannot
 * be complete has to say so next to itself.
 */
export type OrderRecordCompleteness = {
  /** True only when the backing store can account for every order ever recorded. */
  complete: boolean;
  storeKind: string;
  durable: boolean;
  /** Why the set is not complete. Null only when `complete` is true. */
  reason: string | null;
};

export type OrderSummary = {
  totalOrders: number;
  paidOrders: number;
  fulfillmentQueued: number;
  totalRevenueCents: number;
  totalArtistTransfers: number;
  lastOrderAt: string | null;
  testModeOrders: number;
  /**
   * Provenance of the numbers above. Read this before quoting any of them as a
   * revenue or payout figure.
   */
  completeness: OrderRecordCompleteness;
};

/** Describes where paid orders are actually kept, and whether they survive. */
export type OrderStoreDescriptor = {
  kind: string;
  /** True only if a record survives this process exiting. */
  durable: boolean;
  /** Maximum records held. Reaching it refuses the write; it never evicts. */
  capacity: number;
};

/**
 * The seam between "an order was paid for" and "the order was written down".
 *
 * `append` must never silently drop a record. A store that cannot accept a paid
 * order is required to throw, so the caller can decline to acknowledge the
 * payment, rather than return success over a record it destroyed.
 */
export type OrderStore = {
  readonly descriptor: OrderStoreDescriptor;
  findByStripeEventId(stripeEventId: string): OrderRecord | undefined;
  /** @throws OrderStoreCapacityExceededError when the store is full. */
  append(order: OrderRecord): void;
  /** Newest first. */
  list(): OrderRecord[];
  clear(): void;
};

/**
 * Thrown instead of evicting. The webhook route turns this into a 5xx so Stripe
 * retries, because the alternative — 200 over a discarded order — is money
 * collected against a record that no longer exists.
 */
export class OrderStoreCapacityExceededError extends Error {
  readonly storeKind: string;
  readonly capacity: number;

  constructor(storeKind: string, capacity: number) {
    super(
      `Order store "${storeKind}" is at its capacity of ${capacity} records and refuses to ` +
        `evict a paid order to make room. The order was NOT recorded. Configure a durable ` +
        `order store before taking further payments.`,
    );
    this.name = "OrderStoreCapacityExceededError";
    this.storeKind = storeKind;
    this.capacity = capacity;
  }
}

/**
 * The name is the disclosure. This store is process-local: a pod restart, a
 * rollout, or a second replica loses every order in it. It is the development
 * default, and `durable: false` is what makes every summary built over it
 * declare itself incomplete.
 */
export const IN_MEMORY_ORDER_STORE_KIND = "in-memory-development-store";

/**
 * A bound on memory, not a retention policy — which is the distinction the
 * previous `orderStore.length = 100` collapsed. At the bound this store refuses
 * the write; it does not decide which paid order stops existing.
 */
export const IN_MEMORY_ORDER_STORE_CAPACITY = 10_000;

export function createInMemoryOrderStore(
  capacity: number = IN_MEMORY_ORDER_STORE_CAPACITY,
): OrderStore {
  const records: OrderRecord[] = [];

  return {
    descriptor: {
      kind: IN_MEMORY_ORDER_STORE_KIND,
      durable: false,
      capacity,
    },
    findByStripeEventId(stripeEventId: string) {
      return records.find((order) => order.stripeEventId === stripeEventId);
    },
    append(order: OrderRecord) {
      if (records.length >= capacity) {
        throw new OrderStoreCapacityExceededError(IN_MEMORY_ORDER_STORE_KIND, capacity);
      }
      records.unshift(order);
    },
    list() {
      return [...records];
    },
    clear() {
      records.length = 0;
    },
  };
}

let activeOrderStore: OrderStore = createInMemoryOrderStore();

/** Swap in a durable backend. The in-memory default is explicitly a stand-in. */
export function setOrderStore(store: OrderStore): void {
  activeOrderStore = store;
}

export function getOrderStoreDescriptor(): OrderStoreDescriptor {
  return { ...activeOrderStore.descriptor };
}

export function resetOrderStoreForTests(): void {
  activeOrderStore = createInMemoryOrderStore();
}

export function describeOrderRecordCompleteness(
  descriptor: OrderStoreDescriptor = activeOrderStore.descriptor,
): OrderRecordCompleteness {
  if (descriptor.durable) {
    return {
      complete: true,
      storeKind: descriptor.kind,
      durable: true,
      reason: null,
    };
  }

  return {
    complete: false,
    storeKind: descriptor.kind,
    durable: false,
    reason:
      `Orders are held in "${descriptor.kind}", which is process-local. Orders recorded ` +
      `before this process started, or by any other replica, are not counted. These totals ` +
      `are a lower bound, not a reconciliation.`,
  };
}

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

  const existing = activeOrderStore.findByStripeEventId(stripeEventId);
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

  // Throws rather than evicting. The caller must not acknowledge a payment
  // whose order this store refused to hold.
  activeOrderStore.append(order);

  return order;
}

export function getOrderRecords(): OrderRecord[] {
  return activeOrderStore.list();
}

export function clearOrdersForTests(): void {
  activeOrderStore.clear();
}

export function buildOrderSummary(
  orders: OrderRecord[] = getOrderRecords(),
  completeness: OrderRecordCompleteness = describeOrderRecordCompleteness(),
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
    completeness,
  };
}

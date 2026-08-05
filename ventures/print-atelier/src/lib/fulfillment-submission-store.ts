/**
 * Where a paid order's fulfillment attempt is written down.
 *
 * Both partner adapters used to keep their submissions in a bare array trimmed
 * with `fulfillmentStore.length = 50`. That line did three things at once, and
 * only the first was intended:
 *
 *   1. bounded memory;
 *   2. destroyed the only record that a paid order's fulfillment was blocked —
 *      the recipient address and print file URL are held nowhere else once the
 *      Stripe event is acknowledged;
 *   3. cleared the alarm that would have surfaced it, because
 *      `buildFulfillmentSubmissionSummary` derives `blockedCount` and
 *      `fulfillmentReady` from the same window. Evicting a blocked submission
 *      decrements the count, drops its blocker string, and can flip
 *      `fulfillmentReady` from false to true. The operator surface reports
 *      fulfillment healthy precisely because the evidence is gone.
 *
 * This store keeps (1) and refuses (2) and (3): at capacity it throws rather
 * than deciding which paid order stops existing. That is the same distinction
 * `orders.ts` draws between a bound on memory and a retention policy, and it is
 * deliberately the same shape so the two are read together.
 */

/** Describes where fulfillment submissions are kept, and whether they survive. */
export type FulfillmentSubmissionStoreDescriptor = {
  kind: string;
  /** True only if a record survives this process exiting. */
  durable: boolean;
  /** Maximum records held. Reaching it refuses the write; it never evicts. */
  capacity: number;
};

/**
 * The name is the disclosure, as in `orders.ts`: this store is process-local. A
 * pod restart, a rollout, or a second replica loses every submission in it.
 */
export const IN_MEMORY_FULFILLMENT_STORE_KIND = "in-memory-development-store";

/**
 * A bound on memory, not a retention policy. Ten thousand, matching
 * `IN_MEMORY_ORDER_STORE_CAPACITY`, because one order produces at most one
 * submission record per partner and the two bounds should not disagree about
 * how many orders this process can hold.
 */
export const IN_MEMORY_FULFILLMENT_STORE_CAPACITY = 10_000;

/**
 * Thrown instead of evicting. The Stripe webhook turns this into a 5xx so the
 * event is redelivered, because the alternative — 200 over a discarded
 * submission — tells Stripe the fulfillment of a paid order is safely recorded
 * when the record was just destroyed.
 */
export class FulfillmentSubmissionStoreCapacityExceededError extends Error {
  readonly storeKind: string;
  readonly capacity: number;
  readonly partner: string;

  constructor(storeKind: string, capacity: number, partner: string) {
    super(
      `Fulfillment submission store "${storeKind}" for ${partner} is at its capacity of ` +
        `${capacity} records and refuses to evict a paid order's fulfillment record to make ` +
        `room. The submission was NOT recorded. Configure a durable fulfillment store before ` +
        `taking further payments.`,
    );
    this.name = "FulfillmentSubmissionStoreCapacityExceededError";
    this.storeKind = storeKind;
    this.capacity = capacity;
    this.partner = partner;
  }
}

/** The minimum a stored submission must carry for the store to key on it. */
type KeyedSubmission = { orderId: string };

export type FulfillmentSubmissionStore<T extends KeyedSubmission> = {
  readonly descriptor: FulfillmentSubmissionStoreDescriptor;
  /**
   * Upsert by `orderId`. One order has one current submission per partner —
   * `retryPrintfulFulfillmentSubmission` already mutates the stored record in
   * place rather than appending an attempt, so appending here would contradict
   * it. It also makes the write idempotent, which matters because Stripe
   * redelivers events and both the queue helpers and the webhook route record
   * the same submission.
   *
   * @throws FulfillmentSubmissionStoreCapacityExceededError when full.
   */
  record(submission: T): T;
  find(orderId: string): T | undefined;
  /** Newest first. */
  list(): T[];
  clear(): void;
};

export function createInMemoryFulfillmentSubmissionStore<T extends KeyedSubmission>(
  partner: string,
  capacity: number = IN_MEMORY_FULFILLMENT_STORE_CAPACITY,
): FulfillmentSubmissionStore<T> {
  const records: T[] = [];

  return {
    descriptor: {
      kind: IN_MEMORY_FULFILLMENT_STORE_KIND,
      durable: false,
      capacity,
    },
    record(submission: T) {
      const existingIndex = records.findIndex((item) => item.orderId === submission.orderId);
      if (existingIndex >= 0) {
        records[existingIndex] = submission;
        return submission;
      }
      if (records.length >= capacity) {
        throw new FulfillmentSubmissionStoreCapacityExceededError(
          IN_MEMORY_FULFILLMENT_STORE_KIND,
          capacity,
          partner,
        );
      }
      records.unshift(submission);
      return submission;
    },
    find(orderId: string) {
      return records.find((item) => item.orderId === orderId);
    },
    list() {
      return [...records];
    },
    clear() {
      records.length = 0;
    },
  };
}

/**
 * What a summary built over these stores may claim about its own inputs.
 *
 * Mirrors `describeOrderRecordCompleteness`. A process-local store cannot
 * vouch for submissions recorded before this process started or by another
 * replica, so a count taken over it is a lower bound.
 */
export type FulfillmentRecordCompleteness = {
  complete: boolean;
  storeKinds: string[];
  durable: boolean;
  reason: string | null;
};

export function describeFulfillmentRecordCompleteness(
  descriptors: FulfillmentSubmissionStoreDescriptor[],
): FulfillmentRecordCompleteness {
  const storeKinds = Array.from(new Set(descriptors.map((descriptor) => descriptor.kind)));
  const durable = descriptors.length > 0 && descriptors.every((descriptor) => descriptor.durable);

  if (durable) {
    return { complete: true, storeKinds, durable: true, reason: null };
  }

  return {
    complete: false,
    storeKinds,
    durable: false,
    reason:
      `Fulfillment submissions are held in ${storeKinds.map((kind) => `"${kind}"`).join(", ")}, ` +
      `which is process-local. Submissions recorded before this process started, or by any ` +
      `other replica, are not counted. These totals are a lower bound, not a reconciliation.`,
  };
}

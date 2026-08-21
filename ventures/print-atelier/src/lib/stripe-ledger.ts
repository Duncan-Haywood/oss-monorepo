import type { StripeWebhookProcessingResult } from "./stripe-connect";

export type StripeLedgerEntry = {
  ledgerId: string;
  eventId: string;
  eventType: string;
  recordedAt: string;
  action: string;
  amountCents: number | null;
  artistAccountId: string | null;
  testMode: boolean;
  fulfillmentQueued: boolean;
};

export type StripePayoutLedgerSummary = {
  totalEntries: number;
  transferCount: number;
  payoutCount: number;
  paymentCount: number;
  totalTransferCents: number;
  totalPaymentCents: number;
  lastRecordedAt: string | null;
  artistAccounts: string[];
};

const ledgerStore: StripeLedgerEntry[] = [];

function generateLedgerId(): string {
  return `led_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function recordStripeWebhookToLedger(
  eventId: string,
  eventType: string,
  result: StripeWebhookProcessingResult,
  recordedAt?: string,
): StripeLedgerEntry | null {
  if (!result.handled) {
    return null;
  }

  // Stripe delivers webhooks at-least-once and retries on timeout or a
  // non-2xx response, so the same event id can arrive more than once.
  // Without this guard, a redelivered `transfer.created`/`payout.paid`/
  // `payment_intent.succeeded` event is appended again and inflates
  // totalTransferCents/totalPaymentCents (and the investor dashboard that
  // reads them) by the duplicate amount.
  const existing = ledgerStore.find((entry) => entry.eventId === eventId);
  if (existing) {
    return existing;
  }

  const entry: StripeLedgerEntry = {
    ledgerId: generateLedgerId(),
    eventId,
    eventType,
    recordedAt: recordedAt ?? new Date().toISOString(),
    action: result.action,
    amountCents: result.amountCents ?? null,
    artistAccountId: result.artistAccountId ?? null,
    testMode: result.testMode,
    fulfillmentQueued: eventType === "payment_intent.succeeded",
  };

  ledgerStore.unshift(entry);
  if (ledgerStore.length > 100) {
    ledgerStore.length = 100;
  }

  return entry;
}

export function getStripeLedgerEntries(): StripeLedgerEntry[] {
  return [...ledgerStore];
}

export function clearStripeLedgerForTests(): void {
  ledgerStore.length = 0;
}

export function buildStripePayoutLedgerSummary(
  entries: StripeLedgerEntry[] = getStripeLedgerEntries(),
): StripePayoutLedgerSummary {
  const transfers = entries.filter((entry) => entry.eventType === "transfer.created");
  const payouts = entries.filter((entry) => entry.eventType === "payout.paid");
  const payments = entries.filter((entry) => entry.eventType === "payment_intent.succeeded");

  const artistAccounts = Array.from(
    new Set(entries.map((entry) => entry.artistAccountId).filter((id): id is string => Boolean(id))),
  );

  return {
    totalEntries: entries.length,
    transferCount: transfers.length,
    payoutCount: payouts.length,
    paymentCount: payments.length,
    totalTransferCents: transfers.reduce((sum, entry) => sum + (entry.amountCents ?? 0), 0),
    totalPaymentCents: payments.reduce((sum, entry) => sum + (entry.amountCents ?? 0), 0),
    lastRecordedAt: entries[0]?.recordedAt ?? null,
    artistAccounts,
  };
}

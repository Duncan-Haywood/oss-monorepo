import { calculatePrintEconomics, roundCurrency, type PrintEconomicsInput } from "@/lib/marketplace";

export type StripeConnectPayoutInput = PrintEconomicsInput & {
  monthlyOrders: number;
  stripeFeeRate?: number;
  stripeFeeFixed?: number;
  connectTransferDelayDays?: number;
};

export type StripeConnectOrderBreakdown = {
  grossRevenue: number;
  stripeProcessingFee: number;
  fulfillmentCost: number;
  aiComputeCost: number;
  netProfit: number;
  artistTransfer: number;
  platformRetained: number;
};

export type StripeConnectPayoutSimulation = {
  perOrder: StripeConnectOrderBreakdown;
  monthly: {
    grossRevenue: number;
    stripeProcessingFees: number;
    fulfillmentSpend: number;
    aiComputeSpend: number;
    netProfit: number;
    artistTransfers: number;
    platformRetained: number;
    effectiveTakeRatePercent: number;
  };
  connect: {
    transferDelayDays: number;
    pendingArtistBalance: number;
    nextPayoutDateLabel: string;
    platformStripeFees: number;
    artistStripeFees: number;
  };
  readiness: {
    testModeReady: boolean;
    blockers: string[];
    checklist: string[];
  };
};

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.3;

export function simulateStripeConnectPayout({
  retailPrice,
  fulfillmentCost,
  paymentFeeRate,
  aiComputeCost = 0.35,
  monthlyOrders,
  stripeFeeRate = STRIPE_RATE,
  stripeFeeFixed = STRIPE_FIXED,
  connectTransferDelayDays = 7,
}: StripeConnectPayoutInput): StripeConnectPayoutSimulation {
  const safeOrders = Math.max(monthlyOrders, 0);
  const economics = calculatePrintEconomics({
    retailPrice,
    fulfillmentCost,
    paymentFeeRate,
    aiComputeCost,
  });
  const stripeProcessingFee = roundCurrency(retailPrice * stripeFeeRate + stripeFeeFixed);
  const netProfitAfterStripe = roundCurrency(
    retailPrice - stripeProcessingFee - fulfillmentCost - aiComputeCost,
  );
  const artistTransfer = roundCurrency(Math.max(netProfitAfterStripe, 0) * 0.3);
  const platformRetained = roundCurrency(Math.max(netProfitAfterStripe, 0) * 0.7);

  const perOrder: StripeConnectOrderBreakdown = {
    grossRevenue: retailPrice,
    stripeProcessingFee,
    fulfillmentCost,
    aiComputeCost,
    netProfit: netProfitAfterStripe,
    artistTransfer,
    platformRetained,
  };

  const monthlyGross = roundCurrency(retailPrice * safeOrders);
  const monthlyStripeFees = roundCurrency(stripeProcessingFee * safeOrders);
  const monthlyFulfillment = roundCurrency(fulfillmentCost * safeOrders);
  const monthlyAi = roundCurrency(aiComputeCost * safeOrders);
  const monthlyNet = roundCurrency(netProfitAfterStripe * safeOrders);
  const monthlyArtist = roundCurrency(artistTransfer * safeOrders);
  const monthlyPlatform = roundCurrency(platformRetained * safeOrders);
  const effectiveTakeRate =
    monthlyGross > 0 ? roundCurrency((monthlyPlatform / monthlyGross) * 100) : 0;

  const blockers: string[] = [];
  if (netProfitAfterStripe <= 0) {
    blockers.push("Net profit is negative after Stripe, fulfillment, and AI costs");
  }
  if (artistTransfer < 5) {
    blockers.push("Artist transfer below $5 minimum — raise retail or lower POD cost");
  }
  if (safeOrders === 0) {
    blockers.push("No orders to simulate payout timing");
  }

  const checklist = [
    "Stripe Connect Express account for artist onboarding",
    "Platform Stripe account with test-mode keys in `.env.local`",
    "Webhook handler for `transfer.created` and `payout.paid`",
    "Artist dashboard showing pending vs available balance",
    "Monthly payout schedule aligned to Connect transfer delay",
  ];

  return {
    perOrder,
    monthly: {
      grossRevenue: monthlyGross,
      stripeProcessingFees: monthlyStripeFees,
      fulfillmentSpend: monthlyFulfillment,
      aiComputeSpend: monthlyAi,
      netProfit: monthlyNet,
      artistTransfers: monthlyArtist,
      platformRetained: monthlyPlatform,
      effectiveTakeRatePercent: effectiveTakeRate,
    },
    connect: {
      transferDelayDays: connectTransferDelayDays,
      pendingArtistBalance: monthlyArtist,
      nextPayoutDateLabel: `T+${connectTransferDelayDays} business days after month close`,
      platformStripeFees: monthlyStripeFees,
      artistStripeFees: 0,
    },
    readiness: {
      testModeReady: blockers.length === 0,
      blockers,
      checklist,
    },
  };
}

export function formatStripeCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export type StripeConnectWebhookEventType =
  | "transfer.created"
  | "payout.paid"
  | "account.updated"
  | "payment_intent.succeeded";

export type StripeConnectWebhookEvent = {
  id: string;
  type: StripeConnectWebhookEventType | string;
  created: number;
  livemode: boolean;
  data: {
    object: Record<string, unknown>;
  };
};

export type StripeWebhookProcessingResult = {
  handled: boolean;
  eventType: string;
  action: string;
  artistAccountId?: string;
  destinationConnectAccountId?: string;
  transferAmountCents?: number;
  amountCents?: number;
  testMode: boolean;
};


export type StripeWebhookEnvStatus = {
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  connectClientIdConfigured: boolean;
  readyForTestMode: boolean;
  blockers: string[];
};

export function getStripeWebhookEnvStatus(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_CLIENT_ID?: string;
}): StripeWebhookEnvStatus {
  const secretKeyConfigured = Boolean(env.STRIPE_SECRET_KEY?.startsWith("sk_"));
  const webhookSecretConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"));
  const connectClientIdConfigured = Boolean(env.STRIPE_CONNECT_CLIENT_ID?.startsWith("ca_"));

  const blockers: string[] = [];
  if (!secretKeyConfigured) {
    blockers.push("STRIPE_SECRET_KEY missing or invalid (expect sk_test_…)");
  }
  if (!webhookSecretConfigured) {
    blockers.push("STRIPE_WEBHOOK_SECRET missing or invalid (expect whsec_…)");
  }
  if (!connectClientIdConfigured) {
    blockers.push("STRIPE_CONNECT_CLIENT_ID missing or invalid (expect ca_…)");
  }

  return {
    secretKeyConfigured,
    webhookSecretConfigured,
    connectClientIdConfigured,
    readyForTestMode: blockers.length === 0,
    blockers,
  };
}

export function processStripeConnectWebhookEvent(
  event: StripeConnectWebhookEvent,
): StripeWebhookProcessingResult {
  const object = event.data.object;
  const testMode = !event.livemode;

  if (event.type === "transfer.created") {
    const amount = typeof object.amount === "number" ? object.amount : undefined;
    const destination =
      typeof object.destination === "string" ? object.destination : undefined;

    return {
      handled: true,
      eventType: event.type,
      action: "Queue artist payout notification and update pending balance",
      artistAccountId: destination,
      amountCents: amount,
      testMode,
    };
  }

  if (event.type === "payout.paid") {
    const amount = typeof object.amount === "number" ? object.amount : undefined;

    return {
      handled: true,
      eventType: event.type,
      action: "Mark artist payout as available and refresh dashboard balance",
      amountCents: amount,
      testMode,
    };
  }

  if (event.type === "account.updated") {
    const accountId = typeof object.id === "string" ? object.id : undefined;
    const chargesEnabled = object.charges_enabled === true;
    const payoutsEnabled = object.payouts_enabled === true;

    return {
      handled: true,
      eventType: event.type,
      action:
        chargesEnabled && payoutsEnabled
          ? "Artist Connect onboarding complete — enable listing release"
          : "Artist Connect onboarding incomplete — hold listing release",
      artistAccountId: accountId,
      testMode,
    };
  }

  if (event.type === "payment_intent.succeeded") {
    const amount = typeof object.amount === "number" ? object.amount : undefined;
    const metadata =
      typeof object.metadata === "object" && object.metadata !== null
        ? (object.metadata as Record<string, unknown>)
        : {};
    const destinationAccountId =
      typeof metadata.destinationConnectAccountId === "string"
        ? metadata.destinationConnectAccountId
        : typeof metadata.artistAccountId === "string"
        ? metadata.artistAccountId
        : undefined;
    const transferTotalString =
      typeof metadata.artistTransferTotal === "string" ? metadata.artistTransferTotal : undefined;
    const transferAmountCents = transferTotalString
      ? Math.round(parseFloat(transferTotalString) * 100)
      : undefined;

    return {
      handled: true,
      eventType: event.type,
      action: destinationAccountId
        ? `Trigger POD fulfillment job and route Connect transfer of ${
            transferTotalString ? `$${transferTotalString}` : "calculated 30% share"
          } to ${destinationAccountId}`
        : "Trigger POD fulfillment job and schedule Connect transfer after delay",
      artistAccountId: destinationAccountId,
      destinationConnectAccountId: destinationAccountId,
      transferAmountCents,
      amountCents: amount,
      testMode,
    };
  }


  return {
    handled: false,
    eventType: event.type,
    action: "Ignored unsupported Stripe event",
    testMode,
  };
}

export type ConnectBatchTransferInstruction = {
  artistAccountId: string;
  artistHandle: string | null;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  description: string;
  metadata: {
    type: "reconciliation_topup";
    underpaidCents: number;
    reconciledAt: string;
    testMode: boolean;
  };
};

export type ConnectBatchTransferResult = {
  executedAt: string;
  totalTransfers: number;
  totalTopUpCents: number;
  instructions: ConnectBatchTransferInstruction[];
  skippedAccounts: Array<{
    artistAccountId: string;
    reason: string;
  }>;
  summaryLabel: string;
};

export type ConnectBatchTransferOptions = {
  report: import("./payout-reconciliation").ArtistPayoutReconciliationReport;
  minTransferCents?: number;
  maxTransferCents?: number;
  testMode?: boolean;
  now?: string;
};

export function executeConnectPayoutBatchTransfer({
  report,
  minTransferCents = 100,
  maxTransferCents = 100000,
  testMode = true,
  now = new Date().toISOString(),
}: ConnectBatchTransferOptions): ConnectBatchTransferResult {
  const instructions: ConnectBatchTransferInstruction[] = [];
  const skippedAccounts: Array<{ artistAccountId: string; reason: string }> = [];

  const eligibleRows = report.rows.filter(
    (row) => row.status === "underpaid" || row.status === "unpaid",
  );

  for (const row of eligibleRows) {
    const owedCents = Math.abs(row.varianceCents);

    if (row.currency === "MIXED") {
      skippedAccounts.push({
        artistAccountId: row.artistAccountId,
        reason: "Mixed currency on account — cannot execute single-currency batch top-up transfer",
      });
      continue;
    }

    if (owedCents < minTransferCents) {
      skippedAccounts.push({
        artistAccountId: row.artistAccountId,
        reason: `Owed amount (${formatStripeCurrency(owedCents / 100)}) below minimum batch transfer threshold (${formatStripeCurrency(minTransferCents / 100)})`,
      });
      continue;
    }

    if (owedCents > maxTransferCents) {
      skippedAccounts.push({
        artistAccountId: row.artistAccountId,
        reason: `Owed amount (${formatStripeCurrency(owedCents / 100)}) exceeds maximum safe batch transfer threshold (${formatStripeCurrency(maxTransferCents / 100)}) — manual review required`,
      });
      continue;
    }

    const idempotencyKey = `topup_${row.artistAccountId}_${now.substring(0, 10)}_${owedCents}`;

    instructions.push({
      artistAccountId: row.artistAccountId,
      artistHandle: row.artistHandle,
      amountCents: owedCents,
      currency: row.currency || "USD",
      idempotencyKey,
      description: `Print Atelier 30% Net Profit Reconciliation Top-Up for ${row.artistHandle ?? row.artistAccountId}`,
      metadata: {
        type: "reconciliation_topup",
        underpaidCents: owedCents,
        reconciledAt: report.generatedAt,
        testMode,
      },
    });
  }

  const totalTopUpCents = instructions.reduce((sum, item) => sum + item.amountCents, 0);
  const totalTransfers = instructions.length;

  const summaryLabel =
    totalTransfers === 0
      ? skippedAccounts.length > 0
        ? `No batch transfers generated — ${skippedAccounts.length} underpaid account(s) skipped due to guardrails`
        : "No underpaid accounts require batch transfer top-ups"
      : `Prepared ${totalTransfers} batch top-up transfer(s) totaling ${formatStripeCurrency(totalTopUpCents / 100)}${
          skippedAccounts.length > 0 ? ` (${skippedAccounts.length} skipped)` : ""
        }`;

  return {
    executedAt: now,
    totalTransfers,
    totalTopUpCents,
    instructions,
    skippedAccounts,
    summaryLabel,
  };
}


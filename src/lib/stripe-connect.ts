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

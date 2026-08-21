"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatStripeCurrency,
  simulateStripeConnectPayout,
  type StripeWebhookEnvStatus,
} from "@/lib/stripe-connect";

export default function StripeConnectSimulator() {
  const [retailPrice, setRetailPrice] = useState(85);
  const [fulfillmentCost, setFulfillmentCost] = useState(28);
  const [monthlyOrders, setMonthlyOrders] = useState(42);
  const [transferDelayDays, setTransferDelayDays] = useState(7);
  const [webhookEnv, setWebhookEnv] = useState<StripeWebhookEnvStatus | null>(null);

  useEffect(() => {
    fetch("/api/stripe/webhook")
      .then((response) => response.json())
      .then((data) => setWebhookEnv(data as StripeWebhookEnvStatus))
      .catch(() => setWebhookEnv(null));
  }, []);

  const simulation = useMemo(
    () =>
      simulateStripeConnectPayout({
        retailPrice,
        fulfillmentCost,
        monthlyOrders,
        connectTransferDelayDays: transferDelayDays,
      }),
    [retailPrice, fulfillmentCost, monthlyOrders, transferDelayDays],
  );

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
          Finance · Phase 3 prep
        </p>
        <h1 className="text-3xl font-bold mt-1">Stripe Connect Payout Simulator</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
          Model buyer payment → Stripe processing → POD fulfillment → 30/70 net-profit split → Connect
          transfer to artist. Use this before wiring test-mode keys and webhooks.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <span className="text-xs text-gray-600 dark:text-gray-400 uppercase">Retail price</span>
          <input
            type="range"
            min={35}
            max={200}
            value={retailPrice}
            onChange={(event) => setRetailPrice(Number(event.target.value))}
            className="w-full mt-2"
          />
          <p className="text-2xl font-bold mt-1">{formatStripeCurrency(retailPrice)}</p>
        </label>
        <label className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <span className="text-xs text-gray-600 dark:text-gray-400 uppercase">POD fulfillment</span>
          <input
            type="range"
            min={12}
            max={60}
            value={fulfillmentCost}
            onChange={(event) => setFulfillmentCost(Number(event.target.value))}
            className="w-full mt-2"
          />
          <p className="text-2xl font-bold mt-1">{formatStripeCurrency(fulfillmentCost)}</p>
        </label>
        <label className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <span className="text-xs text-gray-600 dark:text-gray-400 uppercase">Monthly orders</span>
          <input
            type="range"
            min={0}
            max={120}
            value={monthlyOrders}
            onChange={(event) => setMonthlyOrders(Number(event.target.value))}
            className="w-full mt-2"
          />
          <p className="text-2xl font-bold mt-1">{monthlyOrders}</p>
        </label>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="bg-slate-900 text-white px-5 py-3 font-medium">Per-order waterfall</div>
          <dl className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {[
              ["Gross revenue", simulation.perOrder.grossRevenue],
              ["Stripe processing", -simulation.perOrder.stripeProcessingFee],
              ["POD fulfillment", -simulation.perOrder.fulfillmentCost],
              ["AI compute", -simulation.perOrder.aiComputeCost],
              ["Net profit", simulation.perOrder.netProfit],
              ["Artist transfer (30%)", simulation.perOrder.artistTransfer],
              ["Platform retained (70%)", simulation.perOrder.platformRetained],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between px-5 py-3">
                <dt className="text-gray-600 dark:text-gray-300">{label}</dt>
                <dd className="font-mono font-medium">{formatStripeCurrency(Number(value))}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">Monthly artist transfers</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatStripeCurrency(simulation.monthly.artistTransfers)}
              </p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-xl p-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">Platform retained</p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                {formatStripeCurrency(simulation.monthly.platformRetained)}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3 text-sm">
            <p className="font-medium">Connect payout timing</p>
            <label className="block">
              <span className="text-xs text-gray-800 dark:text-gray-400">Transfer delay (days)</span>
              <input
                type="range"
                min={2}
                max={14}
                value={transferDelayDays}
                onChange={(event) => setTransferDelayDays(Number(event.target.value))}
                className="w-full mt-1"
              />
            </label>
            <p className="text-gray-600 dark:text-gray-300">
              Pending artist balance:{" "}
              <span className="font-mono font-medium">
                {formatStripeCurrency(simulation.connect.pendingArtistBalance)}
              </span>
            </p>
            <p className="text-gray-600 dark:text-gray-400">{simulation.connect.nextPayoutDateLabel}</p>
            <p className="text-gray-600 dark:text-gray-400">
              Effective platform take rate: {simulation.monthly.effectiveTakeRatePercent}%
            </p>
          </div>

          <div
            className={`rounded-xl p-5 border ${
              simulation.readiness.testModeReady
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
            }`}
          >
            <p className="font-medium text-sm">
              {simulation.readiness.testModeReady
                ? "Ready for Stripe Connect test mode"
                : "Blockers before Connect onboarding"}
            </p>
            {simulation.readiness.blockers.length > 0 ? (
              <ul className="mt-2 text-sm text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-1">
                {simulation.readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 text-sm text-emerald-800 dark:text-emerald-200 list-disc pl-5 space-y-1">
                {simulation.readiness.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="font-medium text-sm">Webhook endpoint scaffold</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              <code className="text-xs bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded">POST /api/stripe/webhook</code>{" "}
              verifies signatures and routes <code className="text-xs">transfer.created</code>,{" "}
              <code className="text-xs">payout.paid</code>, and <code className="text-xs">account.updated</code>.
            </p>
            {webhookEnv ? (
              <ul className="mt-3 text-sm list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                <li>Secret key: {webhookEnv.secretKeyConfigured ? "configured" : "missing"}</li>
                <li>Webhook secret: {webhookEnv.webhookSecretConfigured ? "configured" : "missing"}</li>
                <li>Connect client ID: {webhookEnv.connectClientIdConfigured ? "configured" : "missing"}</li>
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Load .env.local from .env.example to enable test-mode webhooks.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

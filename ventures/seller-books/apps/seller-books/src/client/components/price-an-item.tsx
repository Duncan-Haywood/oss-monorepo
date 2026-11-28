// "Price an item": what an item would net on each platform at a price, and the price that leaves a target
// profit, from the fees the seller's own orders paid (GET /reports/pricing, shared/pricing.ts, where every
// term is defined). Quotes are worked out in the browser as the seller types; nothing is saved.
import { PLATFORM_LABELS, type SaleChannel } from "@shared/enums";
import {
  type PlatformFeeModel,
  type PricingReport,
  priceForProfit,
  quotePrice,
} from "@shared/pricing";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, dollarsToCents, orgPath, usd } from "../lib/api";
import { ErrorText } from "../routes/public";

const label = (p: string) => PLATFORM_LABELS[p as SaleChannel] ?? p;
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

function cents(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    return dollarsToCents(s);
  } catch {
    return null;
  }
}

function feeText(m: PlatformFeeModel) {
  const parts = [
    m.model === "fit" && m.fixedCents > 0 ? `${usd(m.fixedCents)} + ` : "",
    pct(m.percent),
  ];
  if (m.otherRate > 0) parts.push(` + ${pct(m.otherRate)} ads/other`);
  return parts.join("");
}

function minusDays(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

export function PriceAnItem({
  orgId,
  asOf,
  medianDays,
}: {
  orgId: string;
  asOf: string;
  /** Median days to sell by platform, from the stock report. */
  medianDays: Map<string, number | null>;
}) {
  const from = minusDays(asOf, 364);
  const q = useQuery({
    queryKey: ["pricing", orgId, from, asOf],
    queryFn: () =>
      api<PricingReport>(
        orgPath(orgId, `/reports/pricing?${new URLSearchParams({ from, to: asOf })}`),
      ),
  });
  const [cost, setCost] = useState("10.00");
  const [price, setPrice] = useState("35.00");
  const [target, setTarget] = useState("15.00");
  const costC = cents(cost);
  const priceC = cents(price);
  const targetC = cents(target);
  const r = q.data;

  return (
    <section className="card overflow-x-auto" aria-labelledby="price-an-item">
      <h2 id="price-an-item" className="mb-1 font-medium">
        Price an item, from your own fees
      </h2>
      <p className="mb-3 text-xs text-stone-500">
        What each platform took from your orders from {from} to {asOf}: the fees each report
        itemised (fitted as a fixed part plus a percent of the item price when there are five or
        more orders at different prices), ads and other charges as a share of sales, and postage
        less the shipping buyers paid, per order. Subscriptions and refunds are left out, and sales
        tax is never part of a price. An estimate from past orders, not a promise of what the next
        sale nets.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Item cost</span>
          <input
            className="input w-28"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <label>
          <span className="label">List price</span>
          <input
            className="input w-28"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Profit you want</span>
          <input
            className="input w-28"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
      </div>
      {(costC == null || priceC == null || targetC == null) && (
        <p className="mb-2 text-sm text-red-700">Enter each amount in dollars, like 12.50.</p>
      )}
      <ErrorText error={q.error} />
      {r && r.platforms.length === 0 && (
        <p className="text-sm text-stone-600">
          No orders in the last year yet. Import a sales report on the Imports page to see what each
          platform takes.
        </p>
      )}
      {r && r.platforms.length > 0 && costC != null && priceC != null && targetC != null && (
        <table className="table table-stack">
          <thead>
            <tr>
              <th>Platform</th>
              <th className="num">Orders</th>
              <th className="num">Fees</th>
              <th className="num">Net postage</th>
              <th className="num">Nets at {usd(priceC)}</th>
              <th className="num">Profit</th>
              <th className="num">Price for {usd(targetC)} profit</th>
              <th className="num">Median days</th>
            </tr>
          </thead>
          <tbody>
            {r.platforms.map((m) => {
              const qt = quotePrice(m, priceC, costC);
              const need = priceForProfit(m, costC, targetC);
              const rough = m.orders < r.fewOrders;
              return (
                <tr key={m.platform}>
                  <td>
                    {label(m.platform)}
                    {rough && (
                      <span className="block text-xs text-stone-500">few orders: rough</span>
                    )}
                  </td>
                  <td data-label="Orders" className="num">
                    {m.orders}
                  </td>
                  <td data-label="Fees" className="num">
                    <div>
                      {feeText(m)}
                      {m.typicalMissCents > 0 && (
                        <span className="block text-xs text-stone-500">
                          ±{usd(m.typicalMissCents)} an order
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Net postage" className="num">
                    {usd(m.netPostageCents)}
                  </td>
                  <td data-label={`Nets at ${usd(priceC)}`} className="num">
                    {usd(qt.netCents)}
                  </td>
                  <td
                    data-label="Profit"
                    className={`num font-medium ${qt.profitCents < 0 ? "text-red-700" : "text-brand-700"}`}
                  >
                    {usd(qt.profitCents)}
                  </td>
                  <td data-label={`Price for ${usd(targetC)} profit`} className="num">
                    {need == null ? "fees take it all" : usd(need)}
                  </td>
                  <td data-label="Median days" className="num">
                    {medianDays.get(m.platform) ?? "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {r?.warnings.map((w) => (
        <p key={w} className="mt-2 text-xs text-stone-500">
          {w}
        </p>
      ))}
    </section>
  );
}

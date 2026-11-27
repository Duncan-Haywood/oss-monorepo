// Stock report: aging of unsold inventory, sell-through, days to sell by platform and lot payback.
// The numbers come from GET /reports/stock (services/books/stock.ts, where every term is defined).
import { PLATFORM_LABELS, type Platform } from "@shared/enums";
import { useQuery } from "@tanstack/react-query";
import type { StockReport } from "@worker/services/books/stock";
import { useState } from "react";
import { api, orgPath, today, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

const platformLabel = (p: string) =>
  p === "unlinked" ? "No linked order" : (PLATFORM_LABELS[p as Platform] ?? p);

const days = (d: number | null) => (d == null ? "–" : `${d}`);

function minusDays(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

export function StockPage() {
  const orgId = useOrgId();
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(minusDays(today(), 89));
  const to = asOf;
  const q = useQuery({
    queryKey: ["stock", orgId, asOf, from],
    queryFn: () =>
      api<StockReport>(orgPath(orgId, `/reports/stock?asOf=${asOf}&from=${from}&to=${to}`)),
    enabled: from <= to,
  });
  const r = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Stock report</h1>
        <label>
          <span className="label">Sales from</span>
          <input
            className="input"
            type="date"
            value={from}
            max={asOf}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Stock as of</span>
          <input
            className="input"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
      </div>
      {from > to && (
        <p className="text-sm text-red-700">"Sales from" must be on or before "Stock as of".</p>
      )}
      <ErrorText error={q.error} />
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Items in stock", `${r.inStock.items}`],
              ["Cost in stock", usd(r.inStock.costCents)],
              ["Sell-through", r.sellThrough.percent == null ? "–" : `${r.sellThrough.percent}%`],
              ["Median days to sell", days(r.speedTotal.medianDays)],
            ].map(([label, v]) => (
              <div key={label} className="card">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {r.warnings.map((w) => (
            <p key={w} className="rounded-md bg-accent-100 p-3 text-sm text-accent-700">
              {w}
            </p>
          ))}
          <p className="text-xs text-stone-500">
            Sell-through: {r.sellThrough.soldItems} sold from {r.from} to {r.to}, out of{" "}
            {r.sellThrough.startItems} in stock the day before plus {r.sellThrough.acquiredItems}{" "}
            bought in the period. Proceeds are item price plus shipping charged, less refunds, the
            report's own fees and postage; sales tax is left out. They are before cost of goods and
            before expenses not tied to a sale.
          </p>

          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-medium">How long unsold stock has been held</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Held</th>
                  <th className="num">Items</th>
                  <th className="num">Cost</th>
                  <th className="num">Share of cost</th>
                </tr>
              </thead>
              <tbody>
                {r.aging.map((b) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    <td className="num">{b.items}</td>
                    <td className="num">{usd(b.costCents)}</td>
                    <td className="num">
                      {r.inStock.costCents > 0
                        ? `${Math.round((b.costCents / r.inStock.costCents) * 100)}%`
                        : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-medium">Days to sell, by platform</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="num">Sold</th>
                  <th className="num">Median days</th>
                  <th className="num">Mean days</th>
                  <th className="num">Proceeds</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[...r.speed, r.speedTotal].map((s) => (
                  <tr key={s.platform} className={s.platform === "all" ? "font-medium" : ""}>
                    <td>{s.platform === "all" ? "All" : platformLabel(s.platform)}</td>
                    <td className="num">{s.sold}</td>
                    <td className="num">{days(s.medianDays)}</td>
                    <td className="num">{days(s.meanDays)}</td>
                    <td className="num">{usd(s.proceedsCents)}</td>
                    <td className="num">{usd(s.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-medium">Lots: have they paid for themselves?</h2>
            {r.lots.length === 0 ? (
              <p className="text-sm text-stone-600">No lots yet. Add one on the Inventory page.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th className="num">Cost</th>
                    <th className="num">Sold / items</th>
                    <th className="num">Proceeds</th>
                    <th className="num">Recovered</th>
                    <th className="num">Still in stock</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.name}
                        <span className="block text-xs text-stone-500">{l.acquiredDate}</span>
                      </td>
                      <td className="num">{usd(l.totalCostCents)}</td>
                      <td className="num">
                        {l.sold} / {l.items}
                      </td>
                      <td className="num">{usd(l.proceedsCents)}</td>
                      <td
                        className={`num font-medium ${l.paybackCents < 0 ? "text-red-700" : "text-brand-700"}`}
                      >
                        {l.recoveredPercent == null ? "–" : `${l.recoveredPercent}%`}
                      </td>
                      <td className="num">{usd(l.inStockCostCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-medium">Longest held (up to 25)</h2>
            {r.oldest.length === 0 ? (
              <p className="text-sm text-stone-600">Nothing in stock on {r.asOf}.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Bought</th>
                    <th className="num">Days held</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {r.oldest.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.title}
                        {i.sku && <span className="block text-xs text-stone-500">{i.sku}</span>}
                      </td>
                      <td>{i.acquiredDate}</td>
                      <td className="num">{i.daysHeld}</td>
                      <td className="num">{usd(i.costCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

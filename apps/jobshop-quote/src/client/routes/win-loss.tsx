// Win/loss analytics: where the shop wins, at what markup, and what each repeat part went at.
// Every figure is counted from the shop's own decided quotes (src/shared/win-loss.ts).

import { WIN_LOSS_WINDOWS, type WinLossDto, type WinLossWindow } from "@shared/api";
import type { PartPrices, WinLossRow } from "@shared/win-loss";
import { LOW_SAMPLE } from "@shared/win-loss";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Card, ErrorText, Select, STATUS_TONE } from "../components/ui";
import { api, money, orgApi } from "../lib/api";
import { useOrgId, useShopDay } from "./layout";

const WINDOW_LABEL: Record<WinLossWindow, string> = {
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All time",
};

const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);
const bpsPct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toFixed(1)}%`);

export function WinLossPage() {
  const orgId = useOrgId();
  const [range, setRange] = useState<WinLossWindow>("365");
  const q = useQuery({
    queryKey: ["win-loss", orgId, range],
    queryFn: () => api<WinLossDto>(orgApi(orgId, `/quotes/analytics?window=${range}`)),
  });
  const r = q.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-stone-900">Win/loss</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={range}
            onChange={(e) => setRange(e.target.value as WinLossWindow)}
            aria-label="Decided within"
          >
            {WIN_LOSS_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {WINDOW_LABEL[w]}
              </option>
            ))}
          </Select>
          {r && r.quoteCount > 0 && (
            <a
              href={orgApi(orgId, `/quotes/analytics.csv?window=${range}`)}
              download
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50"
            >
              Download CSV
            </a>
          )}
        </div>
      </div>
      {q.error && <ErrorText error={q.error} />}
      {r && r.quoteCount === 0 && (
        <Card>
          <p className="text-sm text-stone-600">
            No decided quotes in this period. Mark sent quotes won or lost from the{" "}
            <Link to="/app/$orgId" params={{ orgId }} className="text-sky-800 underline">
              quote log
            </Link>{" "}
            and this page fills in.
          </p>
        </Card>
      )}
      {r && r.quoteCount > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Win rate"
              value={pct(r.totals.winRate)}
              hint={`${r.totals.won} won / ${r.totals.decided} decided${r.totals.expired ? `, ${r.totals.expired} expired` : ""}`}
            />
            <Stat label="Won" value={money(r.totals.wonCents)} hint="As awarded" />
            <Stat
              label="Markup on won quotes"
              value={bpsPct(r.markupWonBps)}
              hint="On cost, smallest quantity"
            />
            <Stat label="Markup on lost quotes" value={bpsPct(r.markupLostBps)} hint="Same basis" />
          </div>
          <p className="text-xs text-stone-500">
            Win rate is won ÷ (won + lost); expired quotes are shown but not counted. A quote counts
            once in each customer, material, machine and routing row it touches; the estimator is
            whoever created the quote, and months are by decision date in{" "}
            {r.timeZone === "UTC" ? "UTC (set your shop's time zone on the Rate card)" : r.timeZone}
            . Routing and part family rows match lines against your saved routings as they are today
            (same machines and operation labels, in order). Rows marked “few” have fewer than{" "}
            {LOW_SAMPLE} decided quotes: read them as anecdotes, not rates.
            {r.truncated && " Only the most recent 2,000 decided quotes are counted."}
          </p>
          <MonthsCard rows={r.byMonth} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RowsCard title="By estimator" rows={r.byEstimator} />
            <RowsCard title="By customer" rows={r.byCustomer} />
            <RowsCard title="By markup on cost" rows={r.byMarkup} keepEmpty />
            <RowsCard title="By material" rows={r.byMaterial} />
            <RowsCard title="By machine" rows={r.byMachine} />
            {r.byRouting.length > 0 && <RowsCard title="By routing" rows={r.byRouting} />}
            {r.byPartFamily.length > 0 && <RowsCard title="By part family" rows={r.byPartFamily} />}
          </div>
          {r.lostReasons.length > 0 && (
            <Card title="Why we lost">
              <ul className="flex flex-wrap gap-2 text-sm">
                {r.lostReasons.map((x) => (
                  <li key={x.reason} className="rounded bg-stone-100 px-2 py-0.5">
                    {x.reason} <span className="text-stone-500">× {x.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <PricesCard orgId={orgId} prices={r.prices} />
        </>
      )}
    </div>
  );
}

function RowsCard({
  title,
  rows,
  keepEmpty = false,
}: {
  title: string;
  rows: WinLossRow[];
  keepEmpty?: boolean;
}) {
  const shown = keepEmpty ? rows : rows.filter((x) => x.decided + x.expired > 0);
  return (
    <Card title={title}>
      {shown.length === 0 ? (
        <p className="text-sm text-stone-600">Nothing to show yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="py-1" />
              <th className="text-right">Won</th>
              <th className="text-right">Lost</th>
              <th className="text-right">Win rate</th>
              <th className="text-right">Won value</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.key} className="border-t border-stone-100">
                <td className="py-1.5">
                  {x.label}
                  {x.expired > 0 && (
                    <span className="ml-1 text-xs text-stone-500">({x.expired} expired)</span>
                  )}
                </td>
                <td className="text-right">{x.won}</td>
                <td className="text-right">{x.lost}</td>
                <td className="text-right">
                  {pct(x.winRate)}
                  {x.decided > 0 && x.lowSample && (
                    <span
                      className="ml-1 text-xs text-stone-400"
                      title={`Fewer than ${LOW_SAMPLE} decided`}
                    >
                      few
                    </span>
                  )}
                </td>
                <td className="text-right">{money(x.wonCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Win rate month by month: a bar per month (empty months shown), counts and won value beside it. */
function MonthsCard({ rows }: { rows: WinLossRow[] }) {
  if (rows.length < 2) return null; // one month is the headline figure again
  return (
    <Card title="Win rate by month">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="py-1">Month</th>
              <th className="w-2/5">Win rate</th>
              <th className="text-right">Won</th>
              <th className="text-right">Lost</th>
              <th className="text-right">Won value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className="border-t border-stone-100">
                <td className="whitespace-nowrap py-1.5 pr-2">{x.label}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 flex-1 rounded bg-stone-100"
                      role="img"
                      aria-label={
                        x.winRate == null ? "No decided quotes" : `Win rate ${pct(x.winRate)}`
                      }
                    >
                      {x.winRate != null && (
                        <div
                          className={`h-2 rounded ${x.lowSample ? "bg-sky-300" : "bg-sky-700"}`}
                          style={{ width: `${Math.round(x.winRate * 100)}%` }}
                        />
                      )}
                    </div>
                    <span className="w-14 text-right tabular-nums">
                      {pct(x.winRate)}
                      {x.decided > 0 && x.lowSample && (
                        <span className="ml-1 text-xs text-stone-400">few</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="text-right">{x.won}</td>
                <td className="text-right">{x.lost}</td>
                <td className="text-right">{money(x.wonCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PricesCard({ orgId, prices }: { orgId: string; prices: PartPrices[] }) {
  const shopDayOf = useShopDay(orgId);
  return (
    <Card title="What price did we win at">
      {prices.length === 0 ? (
        <p className="text-sm text-stone-600">No part has been won or lost yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {prices.map((p) => (
            <div key={p.partNumber}>
              <div className="text-sm font-medium text-stone-900">
                {p.partNumber}{" "}
                <span className="font-normal text-stone-500">
                  {p.won} won, {p.lost} lost
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {p.entries.map((e) => (
                    <tr key={e.quoteId} className="border-t border-stone-100">
                      <td className="w-24 py-1">
                        <Link
                          to="/app/$orgId/quotes/$quoteId"
                          params={{ orgId, quoteId: e.quoteId }}
                          className="text-sky-800 underline"
                        >
                          {e.label}
                        </Link>
                      </td>
                      <td className="w-20">
                        <Badge tone={STATUS_TONE[e.outcome]}>{e.outcome}</Badge>
                      </td>
                      <td>
                        {e.customerCompany}
                        {e.revision && <span className="text-stone-500"> · rev {e.revision}</span>}
                      </td>
                      <td className="text-right text-stone-700">
                        {e.breaks.length === 0
                          ? "not priced"
                          : e.breaks
                              .map((b) => `${b.quantity} @ ${money(b.unitPriceCents)}`)
                              .join(" · ")}
                      </td>
                      <td className="w-24 text-right text-stone-500">{shopDayOf(e.decidedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

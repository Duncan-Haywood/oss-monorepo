// Org shell (navigation) and the P&L dashboard.
import {
  FEE_KIND_LABELS,
  type FeeKind,
  type MemberRole,
  PLATFORM_LABELS,
  type Platform,
  ROLE_RANK,
  type SaleChannel,
} from "@shared/enums";
import { SELLER_TAX_CAVEATS, sellerSalesTaxRows, totalsBy } from "@shared/sales-tax";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { GettingStartedCard } from "../components/getting-started";
import { QuickBooksExport } from "../components/quickbooks-export";
import { api, orgPath, usd } from "../lib/api";
import { apiUrl, appPath } from "../lib/base-path";
import { LegalFooter, LegalGate } from "./legal";
import { ErrorText, useMe } from "./public";

export const useOrgId = () => useParams({ strict: false }).orgId ?? "";

const NAV = [
  { to: "/o/$orgId", label: "Profit & loss" },
  { to: "/o/$orgId/imports", label: "Imports" },
  { to: "/o/$orgId/sales", label: "Sales" },
  { to: "/o/$orgId/inventory", label: "Inventory" },
  { to: "/o/$orgId/stock", label: "Stock report" },
  { to: "/o/$orgId/mileage", label: "Mileage" },
  { to: "/o/$orgId/expenses", label: "Expenses" },
  { to: "/o/$orgId/schedule-c", label: "Schedule C worksheet" },
  { to: "/o/$orgId/estimated-tax", label: "Quarterly estimates" },
  { to: "/o/$orgId/1099k", label: "1099-K notes" },
  { to: "/o/$orgId/members", label: "Members" },
  { to: "/o/$orgId/billing", label: "Billing" },
  { to: "/o/$orgId/settings", label: "Shop settings" },
] as const;

export function OrgLayout() {
  const orgId = useOrgId();
  const me = useMe();
  const navigate = useNavigate();
  if (me.isLoading) return null;
  if (!me.data) {
    void navigate({ to: "/login" });
    return null;
  }
  const membership = me.data.memberships.find((m) => m.orgId === orgId);
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-stone-200 bg-white p-4 md:w-56 md:border-r md:border-b-0">
        <Link to="/orgs" className="block text-lg font-semibold text-brand-700">
          Seller Books
        </Link>
        <p className="mb-4 truncate text-sm text-stone-600">{membership?.orgName ?? "Shop"}</p>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              params={{ orgId }}
              activeOptions={{ exact: true }}
              className="rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-100"
              activeProps={{ className: "bg-brand-50 font-medium text-brand-800" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="mt-6 text-xs text-stone-500 underline"
          onClick={async () => {
            await api("/api/auth/sign-out", { method: "POST", body: {} });
            window.location.href = appPath("/login");
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        {/* A user who has not accepted the current documents sees the notice instead of the books. */}
        <LegalGate>
          <Outlet />
        </LegalGate>
        <LegalFooter />
      </main>
    </div>
  );
}

interface PnlCell {
  platform: string;
  month: string;
  orders: number;
  ordersWithoutCost: number;
  itemSalesCents: number;
  shippingChargedCents: number;
  refundsCents: number;
  revenueCents: number;
  feesCents: number;
  feesByKind: Record<string, number>;
  postageCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  salesTaxCollectedCents: number;
  marketplaceSalesTaxCents: number;
  sellerSalesTaxCents: number;
  sellerSalesTaxRefundedCents: number;
}

interface PnlReport {
  cells: PnlCell[];
  byPlatform: PnlCell[];
  byMonth: PnlCell[];
  total: PnlCell;
}

const platformLabel = (p: string) =>
  p in PLATFORM_LABELS ? PLATFORM_LABELS[p as Platform] : p === "general" ? "General" : p;

function PnlTable({ rows, first }: { rows: PnlCell[]; first: (c: PnlCell) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th />
            <th className="num">Orders</th>
            <th className="num">Revenue</th>
            <th className="num">Fees</th>
            <th className="num">Postage</th>
            <th className="num">COGS</th>
            <th className="num">Expenses</th>
            <th className="num">Net profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={`${c.platform}-${c.month}`}>
              <td>{first(c)}</td>
              <td className="num">
                {c.orders}
                {c.ordersWithoutCost > 0 && (
                  <span
                    className="ml-1 text-xs text-accent-700"
                    title="Orders with no inventory item linked for some or all units"
                  >
                    ({c.ordersWithoutCost} no cost)
                  </span>
                )}
              </td>
              <td className="num">{usd(c.revenueCents)}</td>
              <td className="num">{usd(c.feesCents)}</td>
              <td className="num">{usd(c.postageCents)}</td>
              <td className="num">{usd(c.cogsCents)}</td>
              <td className="num">{usd(c.expensesCents)}</td>
              <td className={`num font-medium ${c.netProfitCents < 0 ? "text-red-700" : ""}`}>
                {usd(c.netProfitCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The tax the seller collected on the sales they rang up themselves (Square, PayPal, Venmo, their Shopify store,
 * direct sales): theirs to report on their own sales tax return, by month and quarter. Hidden when the
 * range has no sale on those channels.
 */
function SellerSalesTax({
  orgId,
  range,
  cells,
}: {
  orgId: string;
  range: string;
  cells: PnlCell[];
}) {
  const rows = sellerSalesTaxRows(cells);
  if (rows.length === 0) return null;
  const quarters = totalsBy(rows, "quarter");
  const caveats = [...new Set(rows.map((r) => r.platform))].flatMap((p) => {
    const note = SELLER_TAX_CAVEATS[p as SaleChannel];
    return note ? [note] : [];
  });
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="mr-auto font-medium">Sales tax you collected</h2>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/sales-tax.csv?${range}`))}
          title="By month and channel, with quarter totals"
        >
          Download (CSV)
        </a>
      </div>
      <p className="text-sm text-stone-600">
        Tax charged on sales you rang up yourself: Square, PayPal and Venmo payments, your own
        Shopify store and the direct sales you typed in. No marketplace sent it to the state, so
        reporting and paying it is up to you. Tax handed back is read from Square refunds and the
        direct refunds you type in; for PayPal, Venmo and Shopify refunds, check it against their
        reports. Which sales are taxable, and where, is for you or your preparer.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="py-1">Month</th>
              <th>Channel</th>
              <th className="text-right">Sales</th>
              <th className="text-right">Refunds</th>
              <th className="text-right">Tax collected</th>
              <th className="text-right">Tax refunded</th>
              <th className="text-right">Net tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.month}|${r.platform}`} className="border-t border-stone-100">
                <td className="py-1">{r.month}</td>
                <td>{platformLabel(r.platform)}</td>
                <td className="text-right tabular-nums">{usd(r.salesCents)}</td>
                <td className="text-right tabular-nums">{usd(r.refundsCents)}</td>
                <td className="text-right tabular-nums">{usd(r.taxCollectedCents)}</td>
                <td className="text-right tabular-nums">{usd(r.taxRefundedCents)}</td>
                <td className="text-right tabular-nums">{usd(r.netTaxCents)}</td>
              </tr>
            ))}
            {quarters.map((qt) => (
              <tr key={qt.period} className="border-t border-stone-200 font-medium">
                <td className="py-1">{qt.period}</td>
                <td>All channels</td>
                <td className="text-right tabular-nums">{usd(qt.salesCents)}</td>
                <td className="text-right tabular-nums">{usd(qt.refundsCents)}</td>
                <td className="text-right tabular-nums">{usd(qt.taxCollectedCents)}</td>
                <td className="text-right tabular-nums">{usd(qt.taxRefundedCents)}</td>
                <td className="text-right tabular-nums">{usd(qt.netTaxCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caveats.map((c) => (
        <p key={c} className="text-xs text-stone-500">
          {c}
        </p>
      ))}
    </section>
  );
}

export function PnlPage() {
  const orgId = useOrgId();
  const role = useMe().data?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role != null && (ROLE_RANK[role as MemberRole] ?? 0) >= ROLE_RANK.editor;
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  // The dates come from text inputs: encode them so the query string stays a query string.
  const range = new URLSearchParams({ from, to }).toString();
  const q = useQuery({
    queryKey: ["pnl", orgId, from, to],
    queryFn: () => api<PnlReport>(orgPath(orgId, `/reports/pnl?${range}`)),
  });
  const t = q.data?.total;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Profit &amp; loss</h1>
        <label>
          <span className="label">From</span>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="label">To</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/sales-ledger.csv?${range}`))}
          title="Every sale, refund and marketplace charge behind these figures, one row each"
        >
          Download sales ledger (CSV)
        </a>
      </div>
      <GettingStartedCard orgId={orgId} canEdit={canEdit} />
      <QuickBooksExport orgId={orgId} from={from} to={to} />
      <ErrorText error={q.error} />
      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Revenue", t.revenueCents],
              ["Fees + postage", t.feesCents + t.postageCents],
              ["Cost of goods", t.cogsCents],
              ["Net profit", t.netProfitCents],
            ].map(([label, v]) => (
              <div key={label as string} className="card">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{usd(v as number)}</p>
              </div>
            ))}
          </div>
          {t.ordersWithoutCost > 0 && (
            <p className="rounded-md bg-accent-100 p-3 text-sm text-accent-700">
              {t.ordersWithoutCost} orders have no inventory item linked for some or all of the
              units sold, so their cost of goods is missing and profit is overstated. Link them on
              the Sales page.
            </p>
          )}
          <p className="text-xs text-stone-500">
            Sales tax is not revenue and is left out: {usd(t.marketplaceSalesTaxCents)} collected
            and sent to the state by marketplaces
            {t.sellerSalesTaxCents > 0
              ? `, and ${usd(t.sellerSalesTaxCents)} you collected yourself (below)`
              : ""}
            .
          </p>
          <SellerSalesTax orgId={orgId} range={range} cells={q.data?.cells ?? []} />
          <section className="card">
            <h2 className="mb-2 font-medium">By platform</h2>
            <PnlTable rows={q.data?.byPlatform ?? []} first={(c) => platformLabel(c.platform)} />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">By month</h2>
            <PnlTable rows={q.data?.byMonth ?? []} first={(c) => c.month} />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Platform × month</h2>
            <PnlTable
              rows={q.data?.cells ?? []}
              first={(c) => `${c.month} · ${platformLabel(c.platform)}`}
            />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Fees by kind</h2>
            <ul className="text-sm">
              {Object.entries(t.feesByKind).map(([k, v]) => (
                <li key={k} className="flex justify-between border-b border-stone-100 py-1">
                  <span>{FEE_KIND_LABELS[k as FeeKind] ?? k}</span>
                  <span className="tabular-nums">{usd(v)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

// Org shell (navigation) and the P&L dashboard.
import { FEE_KIND_LABELS, type FeeKind, PLATFORM_LABELS, type Platform } from "@shared/enums";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { LegalFooter, LegalGate } from "./legal";
import { ErrorText, useMe } from "./public";

export const useOrgId = () => useParams({ strict: false }).orgId ?? "";

const NAV = [
  { to: "/o/$orgId", label: "Profit & loss" },
  { to: "/o/$orgId/imports", label: "Imports" },
  { to: "/o/$orgId/sales", label: "Sales" },
  { to: "/o/$orgId/inventory", label: "Inventory" },
  { to: "/o/$orgId/mileage", label: "Mileage" },
  { to: "/o/$orgId/expenses", label: "Expenses" },
  { to: "/o/$orgId/schedule-c", label: "Schedule C worksheet" },
  { to: "/o/$orgId/1099k", label: "1099-K notes" },
  { to: "/o/$orgId/members", label: "Members" },
  { to: "/o/$orgId/billing", label: "Billing" },
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
            window.location.href = "/login";
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
                    title="Orders with no inventory item linked"
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

export function PnlPage() {
  const orgId = useOrgId();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const q = useQuery({
    queryKey: ["pnl", orgId, from, to],
    queryFn: () => api<PnlReport>(orgPath(orgId, `/reports/pnl?from=${from}&to=${to}`)),
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
      </div>
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
              {t.ordersWithoutCost} orders have no inventory item linked, so their cost of goods is
              missing and profit is overstated. Link them on the Sales page.
            </p>
          )}
          <p className="text-xs text-stone-500">
            Sales tax collected and remitted by marketplaces ({usd(t.salesTaxCollectedCents)}) is
            not revenue and is left out.
          </p>
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

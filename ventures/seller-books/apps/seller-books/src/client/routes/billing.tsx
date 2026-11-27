// Billing: the plan, what it allows, this shop's usage, and checkout / the Paddle portal (admins).
// While paid plans are dark (no Paddle secrets on this deployment) it says so and sells nothing.
import { PLATFORM_LABELS, type Platform } from "@shared/enums";
import type { BillingDto, PlanDto } from "@shared/plans";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText, useMe } from "./public";

const limit = (n: number | null, unit: string) =>
  n === null ? `Unlimited ${unit}s` : `${n.toLocaleString("en-US")} ${unit}${n === 1 ? "" : "s"}`;

const platformList = (ps: string[]) =>
  ps.length === 0 ? "none yet" : ps.map((p) => PLATFORM_LABELS[p as Platform] ?? p).join(", ");

const STATUS: Record<BillingDto["status"], string> = {
  none: "No subscription",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
  comp: "Complimentary",
};

function PlanCard({
  plan,
  current,
  suggested,
  canBuy,
  interval,
  onBuy,
  busy,
}: {
  plan: PlanDto;
  current: boolean;
  suggested: boolean;
  canBuy: boolean;
  interval: "month" | "year";
  onBuy: () => void;
  busy: boolean;
}) {
  const price =
    plan.priceCents === 0
      ? "$0"
      : interval === "year" && plan.annualPriceCents !== null
        ? `${usd(plan.annualPriceCents)} a year`
        : `${usd(plan.priceCents)} a month`;
  return (
    <div className={`card space-y-2 ${suggested ? "ring-2 ring-brand-600" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        {current && <span className="text-xs font-medium text-brand-800">Your plan</span>}
        {suggested && !current && (
          <span className="text-xs font-medium text-brand-800">Fits your volume</span>
        )}
      </div>
      <p className="text-xl font-semibold">{price}</p>
      <p className="text-sm text-stone-600">{plan.description}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {plan.purchasable && !current && canBuy && (
        <button className="btn" type="button" disabled={busy} onClick={onBuy}>
          Choose {plan.name}
        </button>
      )}
    </div>
  );
}

export function BillingPage() {
  const orgId = useOrgId();
  const me = useMe();
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role;
  const isAdmin = role === "owner" || role === "admin";
  const [interval, setInterval] = useState<"month" | "year">("month");
  const billing = useQuery({
    queryKey: ["billing", orgId],
    queryFn: () => api<BillingDto>(orgPath(orgId, "/billing")),
  });
  const go = (url: string) => {
    window.location.href = url;
  };
  const checkout = useMutation({
    mutationFn: (plan: string) =>
      api<{ url: string }>(orgPath(orgId, "/billing/checkout"), {
        method: "POST",
        body: { plan, interval },
      }),
    onSuccess: (r) => go(r.url),
  });
  const portal = useMutation({
    mutationFn: () =>
      api<{ url: string }>(orgPath(orgId, "/billing/portal"), { method: "POST", body: {} }),
    onSuccess: (r) => go(r.url),
  });
  const returned = new URLSearchParams(window.location.search).get("checkout");

  if (billing.isLoading) return <p>Loading…</p>;
  if (!billing.data) return <ErrorText error={billing.error} />;
  const b = billing.data;
  const busiest = b.usage.busiestMonth;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      {returned === "success" && (
        <p className="card text-sm">
          Thanks. Your plan changes here as soon as the payment provider confirms it, usually within
          a minute; reload the page if it hasn't.
        </p>
      )}
      {returned === "cancel" && (
        <p className="card text-sm">Checkout was canceled; nothing was charged.</p>
      )}

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">
          {b.plan.name} · {STATUS[b.status]}
        </h2>
        {b.lapsed && (
          <p className="text-sm text-red-800">
            The subscription no longer covers this shop, so the Free limits apply. Everything
            already imported stays readable and exportable.
          </p>
        )}
        {b.graceUntil && (
          <p className="text-sm text-red-800">
            The last renewal failed. The plan stays on until {b.graceUntil.slice(0, 10)}; update the
            card in the billing portal.
          </p>
        )}
        {b.currentPeriodEnd && !b.lapsed && (
          <p className="text-sm text-stone-600">
            {b.cancelAtPeriodEnd ? "Ends" : "Renews"} on {b.currentPeriodEnd.slice(0, 10)}.
          </p>
        )}
        <table className="table">
          <tbody>
            <tr>
              <td>Platforms</td>
              <td>{platformList(b.usage.platforms)}</td>
              <td className="num">
                {b.limits.platforms === null ? "all 6" : `up to ${b.limits.platforms}`}
              </td>
            </tr>
            <tr>
              <td>Users</td>
              <td className="num">{b.usage.members}</td>
              <td className="num">{limit(b.limits.members, "user")}</td>
            </tr>
            <tr>
              <td>Orders this month</td>
              <td className="num">{b.usage.ordersThisMonth.toLocaleString("en-US")}</td>
              <td className="num">
                {b.limits.ordersPerMonth === null
                  ? "unlimited"
                  : `${b.limits.hardOrderCap ? "up to" : "about"} ${b.limits.ordersPerMonth.toLocaleString("en-US")}`}
              </td>
            </tr>
            {busiest && (
              <tr>
                <td>Busiest month (last 12)</td>
                <td className="num">
                  {busiest.month}: {busiest.orders.toLocaleString("en-US")}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-stone-500">
          Orders are counted by sale date. On a paid plan the order number is a guide: a busy month
          never blocks an import.
        </p>
        {b.portalAvailable && isAdmin && (
          <button
            className="btn-secondary"
            type="button"
            disabled={portal.isPending}
            onClick={() => portal.mutate()}
          >
            Manage payment and invoices
          </button>
        )}
        <ErrorText error={portal.error} />
      </section>

      {!b.checkoutAvailable && (
        <p className="card text-sm">
          Paid plans are not on sale yet. Every shop is on the Free plan for now; the prices below
          are the proposal.
        </p>
      )}
      {b.checkoutAvailable && !isAdmin && (
        <p className="text-sm text-stone-600">
          Ask the shop's owner or an admin to change the plan.
        </p>
      )}
      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="interval"
            checked={interval === "month"}
            onChange={() => setInterval("month")}
          />
          Monthly
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="interval"
            checked={interval === "year"}
            onChange={() => setInterval("year")}
          />
          Yearly (two months free)
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {b.plans.map((p) => (
          <PlanCard
            key={p.key}
            plan={p}
            current={p.key === b.plan.key}
            suggested={p.key === b.suggestedPlan}
            canBuy={b.checkoutAvailable && isAdmin}
            interval={interval}
            busy={checkout.isPending}
            onBuy={() => checkout.mutate(p.key)}
          />
        ))}
      </div>
      <ErrorText error={checkout.error} />
      <p className="text-xs text-stone-500">
        Payments are handled by Paddle, the merchant of record. Seller Books is bookkeeping
        software, not tax advice; the Schedule C worksheet is for you or your tax preparer to check.
      </p>
    </div>
  );
}

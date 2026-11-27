// Plan, usage and upgrade. Paid plans ship dark: until the owner turns Paddle on, the server says
// checkoutAvailable=false and this page says paid plans are not on sale yet (docs/BILLING.md).
import { type BillingDto, formatBytes, type PlanDto } from "@shared/plans";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const limit = (n: number | null) => (n === null ? "unlimited" : String(n));

export function BillingView({ orgId, info }: { orgId: string; info: OrgInfo }) {
  const isAdmin = info.role === "admin" || info.role === "owner";
  const [interval, setInterval] = useState<"month" | "year">("month");
  const returned = new URLSearchParams(window.location.search).get("checkout");
  const b = useQuery({
    queryKey: ["billing", orgId],
    queryFn: () => api<BillingDto>(`/api/orgs/${orgId}/billing`),
  });
  const go = (url: string) => window.location.assign(url);
  const checkout = useMutation({
    mutationFn: (plan: string) =>
      api<{ url: string }>(`/api/orgs/${orgId}/billing/checkout`, {
        method: "POST",
        json: { plan, interval },
      }),
    onSuccess: (r) => go(r.url),
  });
  const portal = useMutation({
    mutationFn: () =>
      api<{ url: string }>(`/api/orgs/${orgId}/billing/portal`, { method: "POST", json: {} }),
    onSuccess: (r) => go(r.url),
  });
  if (b.error) return <ErrorText error={b.error} />;
  if (!b.data) return <p className="text-sm text-stone-600">Loading…</p>;
  const d = b.data;
  return (
    <div className="space-y-4">
      {returned === "success" && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Thanks. Your plan changes as soon as the payment provider confirms it, usually within a
          minute; reload this page if it still shows the old plan.
        </p>
      )}
      <Card title={`Your plan: ${d.plan.name}`}>
        <ul className="space-y-1 text-sm text-stone-700">
          <li>
            Users: {d.usage.members} of {limit(d.limits.members)}
          </li>
          <li>
            AI drafts this month: {d.usage.draftsThisMonth} of {limit(d.limits.draftsPerMonth)}{" "}
            (resets {d.allowanceResetsOn})
          </li>
          <li>
            Evidence: {formatBytes(d.usage.evidenceBytes)} of {formatBytes(d.limits.evidenceBytes)}
          </li>
          <li>Level 2 recording: {d.plan.level2 ? "included" : "not included (read only)"}</li>
        </ul>
        {d.lapsed && (
          <p className="mt-3 text-sm text-amber-800">
            Your subscription is {d.status}. Level 1 limits apply; everything you recorded stays
            readable and downloadable.
          </p>
        )}
        {d.graceUntil && (
          <p className="mt-3 text-sm text-amber-800">
            A renewal failed. Update your payment method before {d.graceUntil.slice(0, 10)} to keep
            your plan.
          </p>
        )}
        {d.cancelAtPeriodEnd && d.currentPeriodEnd && (
          <p className="mt-3 text-sm text-stone-600">
            Cancels on {d.currentPeriodEnd.slice(0, 10)}.
          </p>
        )}
        {isAdmin && d.portalAvailable && (
          <button
            type="button"
            className={`${btnGhostCls} mt-3`}
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
          >
            Manage payment and invoices
          </button>
        )}
        <ErrorText error={portal.error} />
      </Card>

      {!d.checkoutAvailable && (
        <p className="rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
          Paid plans are not on sale yet. Level 1 is free; the Level 2 prices below are what we plan
          to charge.
        </p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-stone-600">Billing:</span>
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={interval === i}
            onClick={() => setInterval(i)}
            className={`rounded px-2 py-1 ${interval === i ? "bg-brand-50 font-medium text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}
          >
            {i === "month" ? "Monthly" : "Annual (10% off)"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {d.plans.map((p) => (
          <PlanCard
            key={p.key}
            plan={p}
            interval={interval}
            current={p.key === d.plan.key}
            canBuy={isAdmin && d.checkoutAvailable && p.purchasable && p.key !== d.plan.key}
            pending={checkout.isPending}
            onBuy={() => checkout.mutate(p.key)}
          />
        ))}
      </div>
      <ErrorText error={checkout.error} />
      {!isAdmin && (
        <p className="text-sm text-stone-600">Only an owner or admin can change the plan.</p>
      )}
      <p className="text-xs text-stone-500">
        Payments are handled by Paddle as merchant of record. Prices exclude sales tax or VAT where
        it applies. A plan buys a self-assessment workspace, not a certification or an assessment.
      </p>
    </div>
  );
}

function PlanCard(props: {
  plan: PlanDto;
  interval: "month" | "year";
  current: boolean;
  canBuy: boolean;
  pending: boolean;
  onBuy: () => void;
}) {
  const { plan: p, interval } = props;
  const price =
    p.priceCents === 0
      ? "Free"
      : interval === "year" && p.annualPriceCents !== null
        ? `${usd(p.annualPriceCents)} a year`
        : `${usd(p.priceCents)} a month`;
  return (
    <Card title={p.name}>
      <p className="text-2xl font-semibold text-stone-900">{price}</p>
      <p className="mt-1 text-sm text-stone-600">{p.description}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
        {p.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {props.current ? (
        <p className="mt-3 text-sm font-medium text-brand-700">Current plan</p>
      ) : (
        props.canBuy && (
          <button
            type="button"
            className={`${btnCls} mt-3`}
            onClick={props.onBuy}
            disabled={props.pending}
          >
            Choose {p.name}
          </button>
        )
      )}
    </Card>
  );
}

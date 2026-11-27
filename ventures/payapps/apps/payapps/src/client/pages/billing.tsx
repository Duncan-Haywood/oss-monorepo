// Billing: current plan, usage against its limits, and upgrade buttons (admins). Checkout is hosted
// by the merchant of record (Paddle), who handles card details, tax and invoices; this page never
// sees a card number.
import type { BillingDto, PlanDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { api, orgPath } from "../lib/api";

const limit = (n: number | null) => (n === null ? "unlimited" : String(n));

function price(p: PlanDto, interval: "month" | "year") {
  if (p.priceCents === 0) return "Free";
  if (interval === "year" && p.annualPriceCents !== null) {
    return `${formatCents(p.annualPriceCents)} / year`;
  }
  return `${formatCents(p.priceCents)} / month`;
}

export function BillingPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/billing" });
  const [interval, setBillingInterval] = useState<"month" | "year">("month");
  const billing = useQuery({
    queryKey: ["billing", orgId],
    queryFn: () => api<BillingDto>(orgPath(orgId, "/billing")),
  });
  const checkout = useMutation({
    mutationFn: (plan: string) =>
      api<{ url: string }>(orgPath(orgId, "/billing/checkout"), {
        method: "POST",
        body: { plan, interval },
      }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>(orgPath(orgId, "/billing/portal"), { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const returned = new URLSearchParams(window.location.search).get("checkout");
  const b = billing.data;
  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link to="/orgs/$orgId" params={{ orgId }} className="underline">
          ← Projects
        </Link>
      </p>
      <section className="card space-y-2">
        <h1 className="text-xl font-semibold">Billing</h1>
        {billing.isLoading && <p>Loading…</p>}
        <ErrorText error={billing.error} />
        {returned === "success" && (
          <p role="status" className="text-sm text-green-800">
            Thanks. Your plan updates here as soon as the payment is confirmed (usually seconds).
          </p>
        )}
        {b && (
          <>
            <p>
              Plan: <strong>{b.plan.name}</strong>
              {b.status !== "none" && b.status !== "comp" && (
                <span className="ml-2 text-sm text-slate-600">({b.status.replace("_", " ")})</span>
              )}
            </p>
            {b.lapsed && (
              <p className="text-sm text-amber-800">
                Your subscription is no longer active, so Free limits apply. Every job stays
                readable and exportable.
              </p>
            )}
            {b.graceUntil && (
              <p className="text-sm text-amber-800">
                The last payment failed. Update your payment method before{" "}
                {new Date(b.graceUntil).toLocaleDateString()} to keep your plan.
              </p>
            )}
            {b.cancelAtPeriodEnd && b.currentPeriodEnd && (
              <p className="text-sm text-slate-600">
                Cancels on {new Date(b.currentPeriodEnd).toLocaleDateString()}.
              </p>
            )}
            <p className="text-sm text-slate-600">
              Active jobs: {b.usage.activeJobs} of {limit(b.limits.activeJobs)} · Users:{" "}
              {b.usage.members} of {limit(b.limits.members)}
            </p>
            {b.portalAvailable && (
              <button
                className="btn"
                type="button"
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
              >
                Manage subscription and invoices
              </button>
            )}
            <ErrorText error={portal.error} />
          </>
        )}
      </section>
      {b && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Plans</h2>
            <label className="text-sm">
              <input
                type="checkbox"
                checked={interval === "year"}
                onChange={(e) => setBillingInterval(e.target.checked ? "year" : "month")}
              />{" "}
              Pay yearly (10% off)
            </label>
          </div>
          {!b.checkoutAvailable && (
            <p className="text-sm text-slate-600">
              Paid plans are not on sale yet.
              {b.attachmentsAvailable
                ? " Everything on the Free plan works today."
                : " Everything on the Free plan works today except attached files, which are not switched on yet."}
            </p>
          )}
          {b.checkoutAvailable && !b.attachmentsAvailable && (
            <p className="text-sm text-slate-600">
              Attached files are not switched on yet on this site; the storage below applies once
              they are.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-4">
            {b.plans.map((p) => (
              <div key={p.key} className="card space-y-2">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-lg">{price(p, interval)}</p>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {p.key === b.plan.key ? (
                  <p className="text-sm text-slate-600">Current plan</p>
                ) : (
                  p.purchasable &&
                  b.checkoutAvailable && (
                    <button
                      className="btn"
                      type="button"
                      disabled={checkout.isPending}
                      onClick={() => checkout.mutate(p.key)}
                    >
                      Choose {p.name}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
          <ErrorText error={checkout.error} />
          <p className="text-xs text-slate-500">
            Prices in USD. Checkout, tax and invoices are handled by our payment provider, Paddle,
            the merchant of record. Only organization admins can change the plan.
          </p>
        </section>
      )}
    </div>
  );
}

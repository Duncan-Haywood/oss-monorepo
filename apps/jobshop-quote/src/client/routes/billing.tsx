// Billing: the shop's plan, this month's RFQ allowance and seats, and upgrade buttons (admins).
// Checkout is hosted by the merchant of record (Paddle), who handles card details, tax and invoices;
// this page never sees a card number. While paid plans are dark the page says so.
import type { BillingDto, PlanDto } from "@shared/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText } from "../components/ui";
import { api, orgApi } from "../lib/api";
import { canAdmin, useOrg, useOrgId } from "./layout";

const limit = (n: number | null) => (n === null ? "unlimited" : String(n));
const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function price(p: PlanDto, interval: "month" | "year") {
  if (p.priceCents === 0) return "Free";
  if (interval === "year" && p.annualPriceCents !== null)
    return `${usd(p.annualPriceCents)} / year`;
  return `${usd(p.priceCents)} / month`;
}

function barColor(used: number) {
  if (used >= 1) return "h-full bg-red-600";
  if (used >= 0.8) return "h-full bg-amber-500";
  return "h-full bg-sky-700";
}

export function BillingPage() {
  const orgId = useOrgId();
  const org = useOrg(orgId);
  const admin = canAdmin(org.data?.role);
  const [interval, setBillingInterval] = useState<"month" | "year">("month");
  const billing = useQuery({
    queryKey: ["billing", orgId],
    queryFn: () => api<BillingDto>(orgApi(orgId, "/billing")),
  });
  const checkout = useMutation({
    mutationFn: (plan: string) =>
      api<{ url: string }>(orgApi(orgId, "/billing/checkout"), {
        method: "POST",
        body: { plan, interval },
      }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>(orgApi(orgId, "/billing/portal"), { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const returned = new URLSearchParams(window.location.search).get("checkout");
  const b = billing.data;
  const allowance = b?.limits.rfqsPerMonth ?? null;
  const used = b && allowance ? b.usage.rfqsThisMonth / allowance : 0;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Billing">
        {billing.isLoading && <p className="text-sm">Loading…</p>}
        <ErrorText error={billing.error} />
        {returned === "success" && (
          <p role="status" className="mb-2 text-sm text-green-800">
            Thanks. Your plan updates here as soon as the payment is confirmed (usually seconds).
          </p>
        )}
        {b && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Plan: <strong>{b.plan.name}</strong>
              {b.status !== "none" && b.status !== "comp" && (
                <span className="ml-2">
                  <Badge tone={b.status === "active" ? "green" : "amber"}>
                    {b.status.replace("_", " ")}
                  </Badge>
                </span>
              )}
            </p>
            {b.lapsed && (
              <p className="text-amber-800">
                Your subscription is no longer active, so early-access limits apply. Every RFQ,
                quote and PDF stays yours to open, edit and send.
              </p>
            )}
            {b.graceUntil && (
              <p className="text-amber-800">
                The last payment failed. Update your payment method before{" "}
                {new Date(b.graceUntil).toLocaleDateString()} to keep your plan.
              </p>
            )}
            {b.cancelAtPeriodEnd && b.currentPeriodEnd && (
              <p className="text-stone-600">
                Cancels on {new Date(b.currentPeriodEnd).toLocaleDateString()}.
              </p>
            )}
            <div>
              <p>
                RFQs read by the AI this month: <strong>{b.usage.rfqsThisMonth}</strong> of{" "}
                {limit(allowance)} (resets {b.allowanceResetsOn}, UTC)
              </p>
              {allowance !== null && (
                <div
                  className="mt-1 h-2 w-full max-w-md overflow-hidden rounded bg-stone-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={allowance}
                  aria-valuenow={b.usage.rfqsThisMonth}
                  aria-label="RFQ allowance used"
                >
                  <div
                    className={barColor(used)}
                    style={{ width: `${Math.min(100, Math.round(used * 100))}%` }}
                  />
                </div>
              )}
              <p className="mt-1 text-xs text-stone-500">
                An RFQ counts once, the first time the AI reads it, for up to 10 drawing pages; a
                bigger package counts once per 10 pages. Re-reading, editing and re-pricing it are
                free (drawings added later count only past each 10 pages), and past the allowance
                you can still enter parts by hand and quote them.
              </p>
            </div>
            <p>
              Users: {b.usage.members} of {limit(b.limits.members)}
              {b.usage.pendingInvitations > 0 && ` (plus ${b.usage.pendingInvitations} invited)`}
            </p>
            {b.portalAvailable && admin && (
              <div>
                <Button
                  variant="secondary"
                  disabled={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  Manage subscription and invoices
                </Button>
              </div>
            )}
            <ErrorText error={portal.error} />
          </div>
        )}
      </Card>
      {b && (
        <Card
          title="Plans"
          actions={
            <label className="text-sm text-stone-700">
              <input
                type="checkbox"
                checked={interval === "year"}
                onChange={(e) => setBillingInterval(e.target.checked ? "year" : "month")}
              />{" "}
              Pay yearly (10% off)
            </label>
          }
        >
          {!b.checkoutAvailable && (
            <p className="mb-3 text-sm text-stone-600">
              Paid plans are not on sale yet. Early access is free and everything in it works today;
              you will be told the final prices before anything is charged.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {b.plans.map((p) => (
              <div
                key={p.key}
                className="flex flex-col gap-2 rounded-md border border-stone-200 p-3"
              >
                <h3 className="font-semibold text-stone-900">{p.name}</h3>
                <p className="text-lg">{price(p, interval)}</p>
                <p className="text-xs text-stone-600">{p.description}</p>
                <ul className="list-disc pl-5 text-sm text-stone-700">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {p.key === b.plan.key ? (
                  <p className="text-sm text-stone-600">Current plan</p>
                ) : (
                  p.purchasable &&
                  b.checkoutAvailable &&
                  admin && (
                    <div>
                      <Button disabled={checkout.isPending} onClick={() => checkout.mutate(p.key)}>
                        Choose {p.name}
                      </Button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
          <ErrorText error={checkout.error} />
          <p className="mt-3 text-xs text-stone-500">
            Prices in USD. Checkout, tax and invoices are handled by our payment provider, Paddle,
            the merchant of record. Only shop owners and admins can change the plan.
          </p>
        </Card>
      )}
    </div>
  );
}

// OWNER: onboarding+settings agent — plan, usage meter, plans grid, checkout + portal.

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Field,
  Input,
  Meter,
  Spinner,
} from "@client/components/ui";
import { api, formatCents, formatDate, orgApi } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import { cn } from "@client/lib/cn";
import type { BillingOverviewDto, CheckoutBody } from "@shared/billing/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, HeartHandshake } from "lucide-react";
import { useState } from "react";
import { ReadOnlyNotice, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail } from "./use-org";

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "success" },
  comp: { label: "Complimentary", tone: "success" },
  past_due: { label: "Payment due", tone: "warning" },
  paused: { label: "Paused", tone: "neutral" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export function BillingSettingsPage() {
  return (
    <SettingsPage
      tab="billing"
      title="Settings"
      description="Simple, cost-based pricing. You pay for the applications we draft — nothing else."
    >
      {({ orgId, org }) => <Billing orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

function Billing({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const canManage = hasRole(org.role, "admin");
  const [promo, setPromo] = useState("");
  const [interval, setBillingInterval] = useState<"month" | "year">("month");
  const billing = useQuery({
    queryKey: ["org", orgId, "billing"],
    queryFn: () => api<BillingOverviewDto>(orgApi(orgId, "/billing")),
  });
  const checkout = useMutation({
    mutationFn: (planKey: CheckoutBody["planKey"]) => {
      const body: CheckoutBody = { planKey, interval };
      if (promo.trim()) body.promoCode = promo.trim();
      return api<{ url: string }>(orgApi(orgId, "/billing/checkout"), {
        method: "POST",
        body: { ...body },
      });
    },
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>(orgApi(orgId, "/billing/portal"), { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  if (billing.isPending) return <Spinner label="Loading your plan" />;
  if (billing.isError) return <ErrorMessage error={billing.error} />;

  const { subscription, plan, usage, plans, provider, graceUntil } = billing.data;
  const limit = usage.limit > 0 ? usage.limit : null;
  const used = usage.applicationDrafts;
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const status = subscription ? STATUS_LABEL[subscription.status] : undefined;
  const hasProvider = Boolean(subscription?.providerCustomerId);
  const currentKey = subscription?.planKey ?? plan?.key;
  const forSale = plans.filter((p) => p.purchasable !== false);

  return (
    <div className="space-y-6">
      {!canManage && <ReadOnlyNotice />}
      {graceUntil && (
        <Alert tone="warning" title="Your last payment didn't go through">
          {new Date(graceUntil).getTime() > Date.now()
            ? `You can keep drafting applications until ${formatDate(graceUntil)}. Update your payment method to avoid an interruption.`
            : "The grace period has ended, so drafting is paused. Update your payment method to keep drafting."}
        </Alert>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Current plan</CardTitle>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-2xl font-semibold text-neutral-900">
                {plan?.name ?? "No plan yet"}
              </p>
              {plan && (
                <p className="text-sm text-neutral-500">
                  {plan.priceCents > 0 ? `${formatCents(plan.priceCents)} per month` : "No charge"}
                  {subscription?.currentPeriodEnd
                    ? ` · ${subscription.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(subscription.currentPeriodEnd)}`
                    : ""}
                </p>
              )}
            </div>
            {plan?.description && <p className="text-sm text-neutral-600">{plan.description}</p>}
            {canManage && hasProvider && (
              <Button
                variant="secondary"
                onClick={() => portal.mutate()}
                loading={portal.isPending}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Manage billing
              </Button>
            )}
            {portal.isError && <ErrorMessage error={portal.error} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month's drafts</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-neutral-600">
              <span className="text-2xl font-semibold text-neutral-900">{used}</span>
              {limit != null
                ? ` of ${limit} included applications drafted`
                : " applications drafted"}
            </p>
            {limit != null && (
              <Meter
                value={used}
                max={limit}
                label="Drafts used"
                valueText={`${used} / ${limit}`}
                tone={ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "brand"}
              />
            )}
            <p className="text-xs text-neutral-500">
              Billing period {usage.periodKey}. Only full application drafts count — searching,
              matching, interviews and edits don't.
              {limit != null && used >= limit
                ? " You've used this month's drafts; new drafts wait until next month or a plan change."
                : ""}
            </p>
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="plans-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="plans-heading" className="text-lg font-semibold text-neutral-900">
              Plans
            </h2>
            <p className="text-sm text-neutral-500">Change or cancel any time.</p>
          </div>
          <fieldset className="flex rounded-lg border border-neutral-200 bg-white p-1 text-sm">
            <legend className="sr-only">Billing interval</legend>
            {(["month", "year"] as const).map((iv) => (
              <label
                key={iv}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 font-medium",
                  interval === iv
                    ? "bg-brand-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-50",
                )}
              >
                <input
                  type="radio"
                  name="interval"
                  value={iv}
                  checked={interval === iv}
                  onChange={() => setBillingInterval(iv)}
                  className="sr-only"
                />
                {iv === "month" ? "Monthly" : "Yearly (save 10%)"}
              </label>
            ))}
          </fieldset>
          {canManage && (
            <div className="w-full sm:w-64">
              <Field label="Promo or partner code" htmlFor="promo">
                <Input
                  id="promo"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder="Optional"
                  autoComplete="off"
                />
              </Field>
            </div>
          )}
        </div>
        {forSale.length === 0 ? (
          <p className="text-sm text-neutral-500">No plans are available right now.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {forSale.map((p) => {
              const current = p.key === currentKey;
              return (
                <Card
                  key={p.key}
                  className={cn(
                    "flex flex-col",
                    current && "border-brand-500 ring-2 ring-brand-100",
                  )}
                >
                  <CardBody className="flex flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-neutral-900">{p.name}</p>
                      {current && <Badge tone="brand">Current</Badge>}
                    </div>
                    <p>
                      <span className="text-3xl font-semibold text-neutral-900">
                        {formatCents(
                          interval === "year" && p.annualPriceCents
                            ? p.annualPriceCents
                            : p.priceCents,
                        )}
                      </span>
                      <span className="text-sm text-neutral-500">
                        {interval === "year" && p.annualPriceCents ? " / year" : " / month"}
                      </span>
                    </p>
                    <p className="text-sm text-neutral-600">{p.description}</p>
                    <ul className="space-y-1.5 text-sm text-neutral-700">
                      <li className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                        <span>
                          <strong>{p.includedApplicationDrafts}</strong> application drafts a month
                        </span>
                      </li>
                      {p.seats ? (
                        <li className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                          Up to {p.seats} team members
                        </li>
                      ) : null}
                      {(p.features ?? []).map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-2">
                      <Button
                        className="w-full"
                        variant={current ? "secondary" : "primary"}
                        disabled={!canManage || current || !provider || checkout.isPending}
                        loading={checkout.isPending && checkout.variables === p.key}
                        onClick={() => {
                          if (p.key !== "comp") checkout.mutate(p.key);
                        }}
                      >
                        {current ? "Your plan" : `Choose ${p.name}`}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
        {!provider && (
          <p className="text-sm text-neutral-500">
            Online payment isn't switched on for this workspace yet. Contact us to change plans.
          </p>
        )}
        {checkout.isError && <ErrorMessage error={checkout.error} />}
      </section>

      <Alert tone="brand" title="How our pricing works">
        <div className="mt-1 flex gap-3">
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="space-y-2">
            <p>
              Prices are set from what it actually costs us to run the AI and keep your data safe,
              plus a modest margin to keep the service going. Each plan simply includes a number of
              application drafts a month.
            </p>
            <p>
              <strong>30-day money-back guarantee:</strong> if Grant Autopilot isn't right for your
              organization, you can get a full refund within 30 days of your first paid subscription
              payment — no questions asked.{" "}
              <a
                href={appPath("/legal/refunds")}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Read the refund policy
              </a>
              .
            </p>
          </div>
        </div>
      </Alert>
    </div>
  );
}

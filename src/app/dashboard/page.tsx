import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import {
  getLeads,
  listDeployHandoffs,
  listUnrepliedInquiries,
  listOrders,
  listOpenCheckoutSessions,
  listMarketingPacksForMonth,
  listCommerceCatalogs,
  listClientVoicePacks,
  listUnpaidCommerceOrders,
} from "@/lib/db";
import { computePipelineHealth, formatUsd } from "@/lib/metrics/pipeline-health";
import type { PipelineHealth } from "@/lib/metrics/pipeline-health";
import { marketingMonthKey } from "@/lib/marketing/monthly-pack";
import { isStripeBootstrapAllowed } from "@/lib/pricing/bootstrap-gate";
import { assessBundlePriceEnvReadiness } from "@/lib/pricing/price-env-readiness";
import { assessStripeCoreEnvReadiness } from "@/lib/pricing/stripe-core-env-readiness";
import { assessResendEmailEnvReadiness } from "@/lib/email/resend-env-readiness";
import { assessAnthropicEnvReadiness } from "@/lib/ai/anthropic-env-readiness";
import { assessOperatorDigestEmailEnvReadiness } from "@/lib/digest/operator-digest-email-env-readiness";
import { assessOperatorAuthEnvReadiness } from "@/lib/auth/operator-auth-env-readiness";
import { assessBrandNameEnvReadiness } from "@/lib/brand/brand-name-env-readiness";
import { assessAppUrlEnvReadiness } from "@/lib/seo/app-url-env-readiness";
import { assessProductionDomainEnvReadiness } from "@/lib/deploy/production-domain-env-readiness";
import { assessVercelTokenEnvReadiness } from "@/lib/deploy/vercel-token-env-readiness";
import { BundlePriceEnvBanner } from "@/components/dashboard/bundle-price-env-banner";
import { StripeCoreEnvBanner } from "@/components/dashboard/stripe-core-env-banner";
import { ResendEnvBanner } from "@/components/dashboard/resend-env-banner";
import { AnthropicEnvBanner } from "@/components/dashboard/anthropic-env-banner";
import { OperatorDigestEmailEnvBanner } from "@/components/dashboard/operator-digest-email-env-banner";
import { OperatorAuthEnvBanner } from "@/components/dashboard/operator-auth-env-banner";
import { BrandNameEnvBanner } from "@/components/dashboard/brand-name-env-banner";
import { AppUrlEnvBanner } from "@/components/dashboard/app-url-env-banner";
import { ProductionDomainEnvBanner } from "@/components/dashboard/production-domain-env-banner";
import { VercelTokenEnvBanner } from "@/components/dashboard/vercel-token-env-banner";
import { DashboardAuthChrome } from "./auth-chrome";

const sections = [
  {
    title: "Lead pipeline",
    description: "Track scraped leads, outreach status, and preview links sent.",
    href: "/dashboard/leads",
  },
  {
    title: "Preview sites",
    description: "Manage pre-built client sites hosted on preview subdomains.",
    href: "/preview/example-bakery",
  },
  {
    title: "Stripe checkout",
    description: "Payment flow for the $500 website package.",
    href: "/checkout",
  },
];

type DashboardPageProps = {
  searchParams: Promise<{ auth?: string }>;
};

export const dynamic = "force-dynamic";

/** Snapshot clock outside the page component (react-hooks/purity). */
async function loadDashboardHealth(): Promise<PipelineHealth> {
  const nowMs = Date.now();
  const marketingMonth = marketingMonthKey(nowMs);
  const [
    leads,
    handoffs,
    inquiries,
    orders,
    openCheckoutSessions,
    marketingPacks,
    commerceCatalogs,
    clientVoicePacks,
    commerceOrders,
  ] = await Promise.all([
    getLeads(),
    listDeployHandoffs(),
    listUnrepliedInquiries(),
    listOrders(),
    listOpenCheckoutSessions(),
    listMarketingPacksForMonth(marketingMonth),
    listCommerceCatalogs(),
    listClientVoicePacks(),
    listUnpaidCommerceOrders(),
  ]);
  return computePipelineHealth({
    leads,
    orders,
    handoffs,
    inquiries,
    openCheckoutSessions,
    marketingPacksThisMonth: marketingPacks,
    commerceCatalogs,
    clientVoicePacks,
    commerceOrders,
    nowMs,
  });
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const health = await loadDashboardHealth();
  const priceEnv = assessBundlePriceEnvReadiness();
  const coreEnv = assessStripeCoreEnvReadiness();
  const resendEnv = assessResendEmailEnvReadiness();
  const anthropicEnv = assessAnthropicEnvReadiness();
  const digestEmailEnv = assessOperatorDigestEmailEnvReadiness();
  const operatorAuthEnv = assessOperatorAuthEnvReadiness();
  const brandNameEnv = assessBrandNameEnvReadiness();
  const appUrlEnv = assessAppUrlEnvReadiness();
  const productionDomainEnv = assessProductionDomainEnvReadiness();
  const vercelTokenEnv = assessVercelTokenEnvReadiness();
  const bootstrapAllowed = isStripeBootstrapAllowed();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <DashboardAuthChrome authNotice={params.auth} />

      <PlaceholderBanner
        title="Internal ops dashboard"
        description="Operator console for lead management, outreach, and sales tracking. Protected when OPERATOR_DASHBOARD_PASSWORD is set."
        docsHref="/docs/launch-checklist"
      />

      <div className="mt-6">
        <OperatorAuthEnvBanner readiness={operatorAuthEnv} />
        <AppUrlEnvBanner readiness={appUrlEnv} />
        <ProductionDomainEnvBanner readiness={productionDomainEnv} />
        <VercelTokenEnvBanner readiness={vercelTokenEnv} />
        <StripeCoreEnvBanner readiness={coreEnv} />
        <BundlePriceEnvBanner
          readiness={priceEnv}
          bootstrapAllowed={bootstrapAllowed}
        />
        <ResendEnvBanner readiness={resendEnv} />
        <BrandNameEnvBanner readiness={brandNameEnv} />
        <AnthropicEnvBanner readiness={anthropicEnv} />
        <OperatorDigestEmailEnvBanner readiness={digestEmailEnv} />
      </div>

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-zinc-600">
        Operator tools for Maris Stella Labs (Local Site Studio). Lead mutations and CSV import
        require a signed operator session when auth is configured.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-zinc-200 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Revenue
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {formatUsd(health.revenueTotalUsd)}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.openHandoffCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Open handoffs
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.openHandoffCount}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.recoveryDueCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Recovery due
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.recoveryDueCount}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {health.abandonedCheckoutCount} abandoned cart
            {health.abandonedCheckoutCount === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.unrepliedInquiryCount > 0
              ? "border-sky-200 bg-sky-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Unreplied inquiries
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.unrepliedInquiryCount}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {health.newInquiryCount > 0
              ? `${health.newInquiryCount} new · reply on Lead pipeline`
              : "new or read awaiting reply"}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.leadsMissingEmailCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Missing email
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.leadsMissingEmailCount}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Full funnel breakdown on{" "}
        <Link href="/dashboard/leads" className="underline underline-offset-2">
          Lead pipeline
        </Link>
        .
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-zinc-200 p-6 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <h2 className="font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

import {
  getLeads,
  listDeployHandoffs,
  listClientInquiries,
  listUnrepliedInquiries,
  listOrders,
  listOpenCheckoutSessions,
  listMarketingPacksForMonth,
  listCommerceCatalogs,
  listClientVoicePacks,
  listUnpaidCommerceOrders,
  listCommerceOrdersRefunded,
  listCommerceOrdersDisputed,
  listCommerceOrdersMissingClientReceipt,
  getSuppressedEmails,
} from "@/lib/db";
import { mergeCommerceOrdersForReview } from "@/lib/commerce";
import { mergeInquiriesForInbox } from "@/lib/inquiries/merge";
import { computePipelineHealth } from "@/lib/metrics/pipeline-health";
import type { PipelineHealth } from "@/lib/metrics/pipeline-health";
import { marketingMonthKey } from "@/lib/marketing/monthly-pack";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { PipelineHealthPanel } from "@/components/dashboard/pipeline-health-panel";
import { SuppressedEmailsPanel } from "@/components/dashboard/suppressed-emails-panel";
import { BundlePriceEnvBanner } from "@/components/dashboard/bundle-price-env-banner";
import { StripeCoreEnvBanner } from "@/components/dashboard/stripe-core-env-banner";
import { ResendEnvBanner } from "@/components/dashboard/resend-env-banner";
import { EmailFromEnvBanner } from "@/components/dashboard/email-from-env-banner";
import { AnthropicEnvBanner } from "@/components/dashboard/anthropic-env-banner";
import { OperatorDigestEmailEnvBanner } from "@/components/dashboard/operator-digest-email-env-banner";
import { OperatorAuthEnvBanner } from "@/components/dashboard/operator-auth-env-banner";
import { BrandNameEnvBanner } from "@/components/dashboard/brand-name-env-banner";
import { CompanyAddressEnvBanner } from "@/components/dashboard/company-address-env-banner";
import { AppUrlEnvBanner } from "@/components/dashboard/app-url-env-banner";
import { ProductionDomainEnvBanner } from "@/components/dashboard/production-domain-env-banner";
import { VercelTokenEnvBanner } from "@/components/dashboard/vercel-token-env-banner";
import { VercelProjectIdEnvBanner } from "@/components/dashboard/vercel-project-id-env-banner";
import { ConvexUrlEnvBanner } from "@/components/dashboard/convex-url-env-banner";
import { ConvexApiSecretEnvBanner } from "@/components/dashboard/convex-api-secret-env-banner";
import { DailyDigestButton } from "@/components/dashboard/daily-digest-button";
import { isStripeBootstrapAllowed } from "@/lib/pricing/bootstrap-gate";
import { isStripeConnectOnboardingAllowed } from "@/lib/commerce/stripe-connect-gate";
import { isMarketingSchedulingAllowed } from "@/lib/marketing/buffer-gate";
import { assessBundlePriceEnvReadiness } from "@/lib/pricing/price-env-readiness";
import { assessStripeCoreEnvReadiness } from "@/lib/pricing/stripe-core-env-readiness";
import { assessResendEmailEnvReadiness } from "@/lib/email/resend-env-readiness";
import { assessEmailFromEnvReadiness } from "@/lib/email/email-from-env-readiness";
import { assessAnthropicEnvReadiness } from "@/lib/ai/anthropic-env-readiness";
import { assessOperatorDigestEmailEnvReadiness } from "@/lib/digest/operator-digest-email-env-readiness";
import { assessOperatorAuthEnvReadiness } from "@/lib/auth/operator-auth-env-readiness";
import { assessBrandNameEnvReadiness } from "@/lib/brand/brand-name-env-readiness";
import { assessCompanyAddressEnvReadiness } from "@/lib/brand/company-address-env-readiness";
import { assessAppUrlEnvReadiness } from "@/lib/seo/app-url-env-readiness";
import { assessProductionDomainEnvReadiness } from "@/lib/deploy/production-domain-env-readiness";
import { assessVercelTokenEnvReadiness } from "@/lib/deploy/vercel-token-env-readiness";
import { assessVercelProjectIdEnvReadiness } from "@/lib/deploy/vercel-project-id-env-readiness";
import {
  assessConvexUrlEnvReadiness,
  isConvexUrlConfigured,
} from "@/lib/convex/convex-url-env-readiness";
import { assessConvexApiSecretEnvReadiness } from "@/lib/convex/convex-api-secret-env-readiness";
import { DashboardAuthChrome } from "../auth-chrome";
import { LeadsClient } from "./leads-client";

export const dynamic = "force-dynamic";

/** Load dashboard aggregates outside the page component so Date.now stays off the render path. */
async function loadLeadsPipelineHealth(): Promise<{
  health: PipelineHealth;
  leads: Awaited<ReturnType<typeof getLeads>>;
  handoffs: Awaited<ReturnType<typeof listDeployHandoffs>>;
  inquiries: Awaited<ReturnType<typeof listClientInquiries>>;
  unrepliedInquiries: Awaited<ReturnType<typeof listUnrepliedInquiries>>;
  orders: Awaited<ReturnType<typeof listOrders>>;
  openCheckoutSessions: Awaited<ReturnType<typeof listOpenCheckoutSessions>>;
  marketingPacks: Awaited<ReturnType<typeof listMarketingPacksForMonth>>;
  commerceCatalogs: Awaited<ReturnType<typeof listCommerceCatalogs>>;
  marketingMonth: string;
  clientVoicePacks: Awaited<ReturnType<typeof listClientVoicePacks>>;
  commerceOrders: Awaited<ReturnType<typeof listUnpaidCommerceOrders>>;
  commerceOrdersRefunded: Awaited<ReturnType<typeof listCommerceOrdersRefunded>>;
  commerceOrdersDisputed: Awaited<ReturnType<typeof listCommerceOrdersDisputed>>;
  commerceOrdersMissingClientReceipt: Awaited<
    ReturnType<typeof listCommerceOrdersMissingClientReceipt>
  >;
  suppressedEmails: Awaited<ReturnType<typeof getSuppressedEmails>>;
}> {
  const nowMs = Date.now();
  const marketingMonth = marketingMonthKey(nowMs);
  const [
    leads,
    handoffs,
    inquiries,
    unrepliedInquiries,
    orders,
    openCheckoutSessions,
    marketingPacks,
    commerceCatalogs,
    clientVoicePacks,
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
    commerceOrdersMissingClientReceipt,
    suppressedEmails,
  ] = await Promise.all([
    getLeads(),
    listDeployHandoffs(),
    listClientInquiries(50),
    listUnrepliedInquiries(),
    listOrders(),
    listOpenCheckoutSessions(),
    listMarketingPacksForMonth(marketingMonth),
    listCommerceCatalogs(),
    listClientVoicePacks(),
    listUnpaidCommerceOrders(),
    listCommerceOrdersRefunded(),
    listCommerceOrdersDisputed(),
    listCommerceOrdersMissingClientReceipt(),
    getSuppressedEmails(),
  ]);
  return {
    leads,
    handoffs,
    inquiries,
    unrepliedInquiries,
    orders,
    openCheckoutSessions,
    marketingPacks,
    commerceCatalogs,
    marketingMonth,
    clientVoicePacks,
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
    commerceOrdersMissingClientReceipt,
    suppressedEmails,
    health: computePipelineHealth({
      leads,
      orders,
      handoffs,
      inquiries: unrepliedInquiries,
      openCheckoutSessions,
      marketingPacksThisMonth: marketingPacks,
      commerceCatalogs,
      clientVoicePacks,
      commerceOrders,
      commerceOrdersRefunded,
      commerceOrdersDisputed,
      commerceOrdersMissingClientReceipt,
      marketingSchedulingEnabled: isMarketingSchedulingAllowed(),
      suppressions: suppressedEmails,
      nowMs,
    }),
  };
}

export default async function LeadsPage() {
  const {
    health,
    leads,
    handoffs,
    inquiries,
    unrepliedInquiries,
    orders,
    openCheckoutSessions,
    marketingPacks,
    commerceCatalogs,
    marketingMonth,
    clientVoicePacks,
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
    commerceOrdersMissingClientReceipt,
    suppressedEmails,
  } = await loadLeadsPipelineHealth();
  // The Commerce payouts panel must also surface orders that were refunded/
  // disputed AFTER already being marked paid out (clawback owed from the
  // client) — listUnpaidCommerceOrders alone excludes every paidOutAt row, so
  // that scenario was invisible on the live dashboard even though the panel's
  // own per-order UI already had text for it (see
  // commerce-payouts-panel-clawback-visibility).
  const commerceOrdersForPayoutsPanel = mergeCommerceOrdersForReview(
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
  );
  // The Website inquiries panel must also surface every currently-unreplied
  // inquiry regardless of age — listClientInquiries(50)'s recent-N page
  // (every status) alone silently drops an unreplied inquiry older than the
  // newest 50 total inquiries once that volume is exceeded, even though
  // pipeline-health's MetricCard hint and the daily digest (both fed from the
  // uncapped listUnrepliedInquiries() below) keep counting it as outstanding
  // (see inquiries-inbox-uncapped-unreplied-merge).
  const inquiriesForInboxPanel = mergeInquiriesForInbox(inquiries, unrepliedInquiries);
  const isConvexActive = isConvexUrlConfigured(process.env.NEXT_PUBLIC_CONVEX_URL);
  const priceEnv = assessBundlePriceEnvReadiness();
  const coreEnv = assessStripeCoreEnvReadiness();
  const resendEnv = assessResendEmailEnvReadiness();
  const emailFromEnv = assessEmailFromEnvReadiness();
  const anthropicEnv = assessAnthropicEnvReadiness();
  const digestEmailEnv = assessOperatorDigestEmailEnvReadiness();
  const operatorAuthEnv = assessOperatorAuthEnvReadiness();
  const brandNameEnv = assessBrandNameEnvReadiness();
  const companyAddressEnv = assessCompanyAddressEnvReadiness();
  const appUrlEnv = assessAppUrlEnvReadiness();
  const productionDomainEnv = assessProductionDomainEnvReadiness();
  const vercelTokenEnv = assessVercelTokenEnvReadiness();
  const vercelProjectIdEnv = assessVercelProjectIdEnvReadiness();
  const convexUrlEnv = assessConvexUrlEnvReadiness();
  const convexApiSecretEnv = assessConvexApiSecretEnvReadiness();
  const bootstrapAllowed = isStripeBootstrapAllowed();
  const connectOnboardingAllowed = isStripeConnectOnboardingAllowed();
  const marketingSchedulingAllowed = isMarketingSchedulingAllowed();

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <DashboardAuthChrome />

      <PlaceholderBanner
        title={isConvexActive ? "Lead pipeline (Convex)" : "Lead pipeline (Local DB)"}
        description={
          isConvexActive
            ? "Counts come from the live Convex database. Persistent across client sessions."
            : "Counts come from the local SQLite database. Persistent across server restarts."
        }
        docsHref="/docs/architecture#data-ingestion"
      />

      <div className="mt-6">
        <OperatorAuthEnvBanner readiness={operatorAuthEnv} />
        <AppUrlEnvBanner readiness={appUrlEnv} />
        <ProductionDomainEnvBanner readiness={productionDomainEnv} />
        <VercelTokenEnvBanner readiness={vercelTokenEnv} />
        <VercelProjectIdEnvBanner readiness={vercelProjectIdEnv} />
        <ConvexUrlEnvBanner readiness={convexUrlEnv} />
        <ConvexApiSecretEnvBanner readiness={convexApiSecretEnv} />
        <StripeCoreEnvBanner readiness={coreEnv} />
        <BundlePriceEnvBanner
          readiness={priceEnv}
          bootstrapAllowed={bootstrapAllowed}
        />
        <ResendEnvBanner readiness={resendEnv} />
        <EmailFromEnvBanner readiness={emailFromEnv} />
        <BrandNameEnvBanner readiness={brandNameEnv} />
        <CompanyAddressEnvBanner readiness={companyAddressEnv} />
        <AnthropicEnvBanner readiness={anthropicEnv} />
        <OperatorDigestEmailEnvBanner readiness={digestEmailEnv} />
      </div>

      <div className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1
            id="dashboard-leads-heading"
            tabIndex={-1}
            className="text-3xl font-bold tracking-tight text-zinc-900 focus:outline-none"
          >
            Lead Pipeline
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Monitor, update, and manage outreach leads and Stripe transactions.
          </p>
        </div>
        <DailyDigestButton />
      </div>

      <div className="mt-8">
        <PipelineHealthPanel health={health} />
        <LeadsClient
          initialLeads={leads}
          initialHandoffs={handoffs}
          initialInquiries={inquiriesForInboxPanel}
          initialCheckoutSessions={openCheckoutSessions}
          initialOrders={orders}
          initialMarketingPacks={marketingPacks}
          initialCommerceCatalogs={commerceCatalogs}
          marketingMonth={marketingMonth}
          initialClientVoicePacks={clientVoicePacks}
          initialCommerceOrders={commerceOrdersForPayoutsPanel}
          initialCommerceOrdersMissingClientReceipt={commerceOrdersMissingClientReceipt}
          connectOnboardingAllowed={connectOnboardingAllowed}
          marketingSchedulingAllowed={marketingSchedulingAllowed}
        />
        <SuppressedEmailsPanel emails={suppressedEmails} />
      </div>
    </main>
  );
}

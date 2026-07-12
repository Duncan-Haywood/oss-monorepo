import {
  getLeads,
  listDeployHandoffs,
  listClientInquiries,
  listOrders,
  listOpenCheckoutSessions,
  listMarketingPacksForMonth,
} from "@/lib/db";
import { computePipelineHealth } from "@/lib/metrics/pipeline-health";
import type { PipelineHealth } from "@/lib/metrics/pipeline-health";
import { marketingMonthKey } from "@/lib/marketing/monthly-pack";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { PipelineHealthPanel } from "@/components/dashboard/pipeline-health-panel";
import { DailyDigestButton } from "@/components/dashboard/daily-digest-button";
import { DashboardAuthChrome } from "../auth-chrome";
import { LeadsClient } from "./leads-client";

export const dynamic = "force-dynamic";

/** Load dashboard aggregates outside the page component so Date.now stays off the render path. */
async function loadLeadsPipelineHealth(): Promise<{
  health: PipelineHealth;
  leads: Awaited<ReturnType<typeof getLeads>>;
  handoffs: Awaited<ReturnType<typeof listDeployHandoffs>>;
  inquiries: Awaited<ReturnType<typeof listClientInquiries>>;
  orders: Awaited<ReturnType<typeof listOrders>>;
  openCheckoutSessions: Awaited<ReturnType<typeof listOpenCheckoutSessions>>;
  marketingPacks: Awaited<ReturnType<typeof listMarketingPacksForMonth>>;
  marketingMonth: string;
}> {
  const nowMs = Date.now();
  const marketingMonth = marketingMonthKey(nowMs);
  const [leads, handoffs, inquiries, orders, openCheckoutSessions, marketingPacks] =
    await Promise.all([
      getLeads(),
      listDeployHandoffs(),
      listClientInquiries(50),
      listOrders(),
      listOpenCheckoutSessions(),
      listMarketingPacksForMonth(marketingMonth),
    ]);
  return {
    leads,
    handoffs,
    inquiries,
    orders,
    openCheckoutSessions,
    marketingPacks,
    marketingMonth,
    health: computePipelineHealth({
      leads,
      orders,
      handoffs,
      inquiries,
      openCheckoutSessions,
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
    orders,
    openCheckoutSessions,
    marketingPacks,
    marketingMonth,
  } = await loadLeadsPipelineHealth();
  const isConvexActive = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

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

      <div className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Lead Pipeline</h1>
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
          initialInquiries={inquiries}
          initialCheckoutSessions={openCheckoutSessions}
          initialOrders={orders}
          initialMarketingPacks={marketingPacks}
          marketingMonth={marketingMonth}
        />
      </div>
    </main>
  );
}

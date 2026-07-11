import { getLeads, listDeployHandoffs } from "@/lib/db";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { DashboardAuthChrome } from "../auth-chrome";
import { LeadsClient } from "./leads-client";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, handoffs] = await Promise.all([getLeads(), listDeployHandoffs()]);
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
      </div>

      <div className="mt-8">
        <LeadsClient initialLeads={leads} initialHandoffs={handoffs} />
      </div>
    </main>
  );
}


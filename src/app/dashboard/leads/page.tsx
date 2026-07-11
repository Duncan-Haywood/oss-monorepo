import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { getLeads, countLeadsByStage } from "@/lib/db";
import type { LeadPipelineStage } from "@/lib/leads/types";

export const dynamic = "force-dynamic";

const pipelineStages: Array<{
  stage: LeadPipelineStage;
  label: string;
  description: string;
}> = [
  { stage: "discovered", label: "Discovered", description: "Businesses found via public data sources" },
  { stage: "site_built", label: "Site built", description: "Preview site generated from category template" },
  { stage: "outreach_sent", label: "Outreach sent", description: "Email sent with preview link" },
  { stage: "discovery_call", label: "Discovery call", description: "Optional call to refine the site" },
  { stage: "paid", label: "Paid", description: "Stripe checkout completed" },
  { stage: "live", label: "Live", description: "Custom domain connected and site published" },
];

export default async function LeadsPage() {
  const leads = await getLeads();
  const counts = await countLeadsByStage();
  const isConvexActive = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <PlaceholderBanner
        title={isConvexActive ? "Lead pipeline (Convex)" : "Lead pipeline (Local DB)"}
        description={
          isConvexActive
            ? "Counts come from the live Convex database. Persistent across client sessions."
            : "Counts come from the local filesystem in-memory database. Falls back to demo catalog until Convex is connected."
        }
        docsHref="/docs/architecture#data-ingestion"
      />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Lead pipeline</h1>
      <p className="mt-3 text-zinc-600">
        Funnel for local business outreach. Leads are persisted in the database.
      </p>

      <div className="mt-10 space-y-4">
        {pipelineStages.map((item) => (
          <div
            key={item.stage}
            className="flex items-center justify-between rounded-xl border border-zinc-200 px-5 py-4 bg-white"
          >
            <div>
              <p className="font-medium text-zinc-900">{item.label}</p>
              <p className="text-sm text-zinc-500">{item.description}</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
              {counts[item.stage] || 0}
            </span>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">Previews in database</h2>
      <ul className="mt-4 space-y-3">
        {leads.map((lead) => (
          <li key={lead.slug}>
            <Link
              href={`/preview/${lead.slug}`}
              className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline"
            >
              {lead.businessName}
            </Link>
            <span className="ml-2 text-sm text-zinc-500">
              {lead.category} · {lead.city}, {lead.state} · recommends {lead.recommendedTier} · stage: <span className="font-semibold text-zinc-700">{lead.stage}</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}


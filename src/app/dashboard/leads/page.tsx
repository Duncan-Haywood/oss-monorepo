import { PlaceholderBanner } from "@/components/placeholder-banner";

const pipelineStages = [
  { stage: "Discovered", count: 0, description: "Businesses found via public data sources" },
  { stage: "Site built", count: 0, description: "Preview site generated from template + scraped info" },
  { stage: "Outreach sent", count: 0, description: "Email sent with preview link" },
  { stage: "Discovery call", count: 0, description: "Optional call to refine the site" },
  { stage: "Paid", count: 0, description: "Stripe checkout completed" },
  { stage: "Live", count: 0, description: "Custom domain connected and site published" },
];

export default function LeadsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <PlaceholderBanner
        title="Lead pipeline (placeholder)"
        description="Future: ingest leads from Google Maps, Facebook, and business directories. No scrapers implemented yet."
        docsHref="/docs/ARCHITECTURE.md#data-ingestion"
      />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Lead pipeline</h1>
      <p className="mt-3 text-zinc-600">
        Kanban-style funnel for local business outreach. Counts are static placeholders.
      </p>

      <div className="mt-10 space-y-4">
        {pipelineStages.map((item) => (
          <div
            key={item.stage}
            className="flex items-center justify-between rounded-xl border border-zinc-200 px-5 py-4"
          >
            <div>
              <p className="font-medium">{item.stage}</p>
              <p className="text-sm text-zinc-500">{item.description}</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

import Link from "next/link";
import type { PipelineHealth } from "@/lib/metrics/pipeline-health";
import { formatUsd } from "@/lib/metrics/pipeline-health";

interface PipelineHealthPanelProps {
  health: PipelineHealth;
}

export function PipelineHealthPanel({ health }: PipelineHealthPanelProps) {
  const maxStage = Math.max(1, ...health.stageFunnel.map((s) => s.count));

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Pipeline health
        </h2>
        <p className="text-xs text-zinc-500">
          Stuck money and funnel gaps — refresh by reloading this page
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Recorded revenue"
          value={formatUsd(health.revenueTotalUsd)}
          hint={`${health.orderCount} order${health.orderCount === 1 ? "" : "s"}`}
        />
        <MetricCard
          label="Open deploy handoffs"
          value={String(health.openHandoffCount)}
          hint={health.openHandoffCount > 0 ? "Paid sites awaiting DNS / Mark live" : "None pending"}
          attention={health.openHandoffCount > 0}
        />
        <MetricCard
          label="Paid, not live"
          value={String(health.paidNotLiveCount)}
          hint="Leads stuck in paid stage"
          attention={health.paidNotLiveCount > 0}
        />
        <MetricCard
          label="Missing email"
          value={String(health.leadsMissingEmailCount)}
          hint="Cannot outreach or receipt"
          attention={health.leadsMissingEmailCount > 0}
        />
      </div>

      {health.newInquiryCount > 0 ? (
        <p className="mt-3 text-xs text-sky-800">
          {health.newInquiryCount} new website inquir
          {health.newInquiryCount === 1 ? "y" : "ies"} — see panel below.
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-zinc-800">Stage funnel</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {health.leadCount} lead{health.leadCount === 1 ? "" : "s"} total
        </p>
        <ul className="mt-3 space-y-2">
          {health.stageFunnel.map((row) => (
            <li key={row.stage} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs font-medium text-zinc-600">
                {row.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-800 transition-[width]"
                  style={{ width: `${Math.round((row.count / maxStage) * 100)}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-semibold tabular-nums text-zinc-900">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {health.leadsMissingEmail.length > 0 ? (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Leads missing email (sample)
          </h3>
          <ul className="mt-2 space-y-1.5">
            {health.leadsMissingEmail.map((lead) => (
              <li
                key={lead.slug}
                className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-700"
              >
                <span>
                  <span className="font-medium">{lead.businessName}</span>{" "}
                  <span className="text-zinc-400">({lead.slug})</span> ·{" "}
                  <code>{lead.stage}</code>
                </span>
                <Link
                  href={`/preview/${lead.slug}`}
                  className="underline underline-offset-2"
                  target="_blank"
                >
                  Preview
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  attention = false,
}: {
  label: string;
  value: string;
  hint: string;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        attention
          ? "border-amber-200 bg-amber-50/60"
          : "border-zinc-100 bg-zinc-50/80"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

import Link from "next/link";
import type { PipelineHealth } from "@/lib/metrics/pipeline-health";
import { formatAbandonedAgeHours, formatUsd } from "@/lib/metrics/pipeline-health";

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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-9">
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
          label="Abandoned carts"
          value={String(health.abandonedCheckoutCount)}
          hint={
            health.oldestAbandonedAgeHours !== null
              ? `Oldest open ${formatAbandonedAgeHours(health.oldestAbandonedAgeHours)}`
              : "No open carts past 2h"
          }
          attention={health.abandonedCheckoutCount > 0}
        />
        <MetricCard
          label="Recovery due"
          value={String(health.recoveryDueCount)}
          hint="Nudge from Abandoned checkouts below"
          attention={health.recoveryDueCount > 0}
        />
        <MetricCard
          label="Unreplied inquiries"
          value={String(health.unrepliedInquiryCount)}
          hint={
            health.unrepliedInquiryCount > 0
              ? [
                  health.newInquiryCount > 0
                    ? `${health.newInquiryCount} new`
                    : null,
                  health.oldestUnrepliedInquiryAgeHours !== null
                    ? `oldest ${formatAbandonedAgeHours(health.oldestUnrepliedInquiryAgeHours)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "new or read, awaiting reply"
              : "Inbox clear"
          }
          attention={health.unrepliedInquiryCount > 0}
        />
        <MetricCard
          label="Missing email"
          value={String(health.leadsMissingEmailCount)}
          hint="Cannot outreach or receipt"
          attention={health.leadsMissingEmailCount > 0}
        />
        <MetricCard
          label="Cold leads"
          value={String(health.coldLeadCount)}
          hint={
            health.oldestColdLeadAgeHours !== null
              ? `Oldest silent ${formatAbandonedAgeHours(health.oldestColdLeadAgeHours)}`
              : "None past Email 3"
          }
          attention={health.coldLeadCount > 0}
        />
        <MetricCard
          label="Snoozed"
          value={String(health.snoozedLeadCount)}
          hint={
            health.soonestSnoozeRemainingHours !== null
              ? `Next back in ${formatAbandonedAgeHours(health.soonestSnoozeRemainingHours)}`
              : "None parked off Work next"
          }
          attention={health.snoozedLeadCount > 0}
        />
      </div>

      {health.unrepliedInquiryCount > 0 ? (
        <p className="mt-3 text-xs text-sky-800">
          {health.unrepliedInquiryCount} unreplied website inquir
          {health.unrepliedInquiryCount === 1 ? "y" : "ies"}
          {health.newInquiryCount > 0
            ? ` (${health.newInquiryCount} still marked new)`
            : ""}{" "}
          — reply from the Website inquiries panel below (or on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>
          ).
        </p>
      ) : null}

      {health.recoveryDueCount > 0 ? (
        <p className="mt-3 text-xs text-amber-900">
          {health.recoveryDueCount} abandoned checkout
          {health.recoveryDueCount === 1 ? "" : "s"} ready for a recovery nudge — use the
          Abandoned checkouts panel (same signals feed Work next).
        </p>
      ) : null}

      {health.coldLeadCount > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          {health.coldLeadCount} lead{health.coldLeadCount === 1 ? "" : "s"} went silent
          through all 3 outreach emails — the follow-up queue won&apos;t resurface{" "}
          {health.coldLeadCount === 1 ? "it" : "them"} again. Manually re-engage or move to a
          closed stage in the lead table below.
        </p>
      ) : null}

      {health.snoozedLeadCount > 0 ? (
        <p className="mt-3 text-xs text-slate-700">
          {health.snoozedLeadCount} lead{health.snoozedLeadCount === 1 ? "" : "s"} parked off
          Work next
          {health.soonestSnoozeRemainingHours !== null
            ? ` — soonest returns in ${formatAbandonedAgeHours(health.soonestSnoozeRemainingHours)}`
            : ""}
          . Unsnooze from the table when the call/booked slot is done; this count is not a second
          priority queue.
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

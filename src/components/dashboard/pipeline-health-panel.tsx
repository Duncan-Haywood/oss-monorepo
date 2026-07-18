import Link from "next/link";
import { leadPreviewPath } from "@/lib/leads/slug-path";
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
          hint={
            health.openHandoffCount > 0
              ? `Paid sites awaiting DNS / Mark live${
                  health.oldestOpenHandoffAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestOpenHandoffAgeHours)}`
                    : ""
                }`
              : "None pending"
          }
          attention={health.openHandoffCount > 0}
        />
        <MetricCard
          label="Paid, not live"
          value={String(health.paidNotLiveCount)}
          hint={
            health.paidNotLiveCount > 0
              ? `See the Paid, not live panel on /dashboard/leads${
                  health.oldestPaidNotLiveAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestPaidNotLiveAgeHours)}`
                    : ""
                }`
              : "None pending"
          }
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
          label="Buy now carts"
          value={String(health.commerceAbandonedCheckoutCount)}
          hint={
            health.commerceRecoveryDueCount > 0
              ? `${health.commerceRecoveryDueCount} recovery due${
                  health.oldestCommerceAbandonedAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestCommerceAbandonedAgeHours)}`
                    : ""
                }`
              : "Commerce SKU checkouts past 2h"
          }
          attention={health.commerceAbandonedCheckoutCount > 0}
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
        <MetricCard
          label="Follow-ups due"
          value={String(health.followUpsDueCount)}
          hint={
            health.oldestFollowUpDueAgeHours !== null
              ? `Oldest since Email ${formatAbandonedAgeHours(health.oldestFollowUpDueAgeHours)}`
              : "Email 2/3 backlog clear"
          }
          attention={health.followUpsDueCount > 0}
        />
        <MetricCard
          label="Marketing packs due"
          value={String(health.marketingPacksDueCount)}
          hint={
            health.marketingPacksDueCount > 0
              ? `${health.marketingPacksDueMonth} Growth/Complete fulfillment${
                  health.oldestMarketingPacksDueAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestMarketingPacksDueAgeHours)}`
                    : ""
                }`
              : `${health.marketingPacksDueMonth} packs complete`
          }
          attention={health.marketingPacksDueCount > 0}
        />
        <MetricCard
          label="MRR paused / canceled"
          value={String(health.recurringEntitlementPausedCount)}
          hint={
            health.recurringEntitlementPausedCount > 0
              ? health.oldestRecurringEntitlementPausedAgeHours !== null
                ? `Oldest pause ${formatAbandonedAgeHours(health.oldestRecurringEntitlementPausedAgeHours)} — chase Billing Portal`
                : "Chase Billing Portal / Manage billing"
              : "Active Growth/Complete/Commerce entitlement"
          }
          attention={health.recurringEntitlementPausedCount > 0}
        />
        <MetricCard
          label="Starter → MRR upsell"
          value={String(health.starterUpsellCandidatesCount)}
          hint={
            health.starterUpsellCandidatesCount > 0
              ? health.oldestStarterUpsellCandidateAgeHours !== null
                ? `Oldest since ${formatAbandonedAgeHours(health.oldestStarterUpsellCandidateAgeHours)} — send Growth/Complete nudge`
                : "Send Growth/Complete upsell nudge"
              : "No Starter-only paid leads to upsell"
          }
          attention={health.starterUpsellCandidatesCount > 0}
        />
        <MetricCard
          label="Commerce catalogs missing"
          value={String(health.commerceCatalogsMissingCount)}
          hint={
            health.commerceCatalogsMissingCount > 0
              ? `Paid Commerce add-on fulfillment${
                  health.oldestCommerceCatalogsMissingAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestCommerceCatalogsMissingAgeHours)}`
                    : ""
                }`
              : "All Commerce catalogs created"
          }
          attention={health.commerceCatalogsMissingCount > 0}
        />
        <MetricCard
          label="Commerce Sync to Stripe"
          value={String(health.commerceCatalogsUnsyncedCount)}
          hint={
            health.commerceCatalogsUnsyncedCount > 0
              ? `Saved catalogs still need Buy now${
                  health.oldestCommerceCatalogsUnsyncedAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestCommerceCatalogsUnsyncedAgeHours)}`
                    : ""
                }`
              : "Saved catalogs synced for Buy now"
          }
          attention={health.commerceCatalogsUnsyncedCount > 0}
        />
        <MetricCard
          label="Voice packs due"
          value={String(health.clientVoicePacksDueCount)}
          hint={
            health.clientVoicePacksDueCount > 0
              ? `Complete phone fulfillment${
                  health.oldestClientVoicePacksDueAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestClientVoicePacksDueAgeHours)}`
                    : ""
                }`
              : "Complete voice packs ready"
          }
          attention={health.clientVoicePacksDueCount > 0}
        />
        <MetricCard
          label="Commerce sales (pass-through)"
          value={formatUsd(health.commerceOrdersRevenueUsd)}
          hint={
            health.commerceOrdersCount > 0
              ? `${health.commerceOrdersCount} Buy now order${health.commerceOrdersCount === 1 ? "" : "s"} still owed to clients — not your revenue · Mark paid out on Commerce payouts panel`
              : "No unpaid Buy now orders"
          }
          attention={health.commerceOrdersCount > 0}
        />
        <MetricCard
          label="Refund clawback needed"
          value={formatUsd(health.commerceOrdersRefundClawbackUsd)}
          hint={
            health.commerceOrdersRefundClawbackCount > 0
              ? `${health.commerceOrdersRefundClawbackCount} Buy now order${health.commerceOrdersRefundClawbackCount === 1 ? "" : "s"} paid out to a client, then refunded by Stripe — claw back from client${
                  health.oldestCommerceOrdersRefundClawbackAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestCommerceOrdersRefundClawbackAgeHours)}`
                    : ""
                }`
              : "No payouts refunded after the fact"
          }
          attention={health.commerceOrdersRefundClawbackCount > 0}
        />
        <MetricCard
          label="Dispute clawback needed"
          value={formatUsd(health.commerceOrdersDisputeClawbackUsd)}
          hint={
            health.commerceOrdersDisputeClawbackCount > 0
              ? `${health.commerceOrdersDisputeClawbackCount} Buy now order${health.commerceOrdersDisputeClawbackCount === 1 ? "" : "s"} paid out to a client, then disputed by the shopper's bank — claw back from client${
                  health.oldestCommerceOrdersDisputeClawbackAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestCommerceOrdersDisputeClawbackAgeHours)}`
                    : ""
                }`
              : "No payouts disputed after the fact"
          }
          attention={health.commerceOrdersDisputeClawbackCount > 0}
        />
        <MetricCard
          label="Bundle revenue refunded"
          value={formatUsd(health.bundleOrdersRefundedUsd)}
          hint={
            health.bundleOrdersRefundedCount > 0
              ? `${health.bundleOrdersRefundedCount} Starter/Growth/Complete order${health.bundleOrdersRefundedCount === 1 ? "" : "s"} refunded by Stripe — already excluded from Recorded revenue${
                  health.oldestBundleOrdersRefundedAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestBundleOrdersRefundedAgeHours)}`
                    : ""
                } — see the Bundle order refunds & disputes panel`
              : "No bundle orders refunded"
          }
          attention={health.bundleOrdersRefundedCount > 0}
        />
        <MetricCard
          label="Bundle revenue disputed"
          value={formatUsd(health.bundleOrdersDisputedUsd)}
          hint={
            health.bundleOrdersDisputedCount > 0
              ? `${health.bundleOrdersDisputedCount} Starter/Growth/Complete order${health.bundleOrdersDisputedCount === 1 ? "" : "s"} disputed by Stripe — already excluded from Recorded revenue${
                  health.oldestBundleOrdersDisputedAgeHours !== null
                    ? ` · oldest ${formatAbandonedAgeHours(health.oldestBundleOrdersDisputedAgeHours)}`
                    : ""
                } — see the Bundle order refunds & disputes panel`
              : "No bundle orders disputed"
          }
          attention={health.bundleOrdersDisputedCount > 0}
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

      {health.commerceRecoveryDueCount > 0 ? (
        <p className="mt-3 text-xs text-emerald-900">
          {health.commerceRecoveryDueCount} abandoned Buy now cart
          {health.commerceRecoveryDueCount === 1 ? "" : "s"} ready for a recovery nudge — use the
          Abandoned Buy now panel on /dashboard/leads (links to preview catalog, not plan checkout).
        </p>
      ) : null}

      {health.coldLeadCount > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          {health.coldLeadCount} lead{health.coldLeadCount === 1 ? "" : "s"} went silent
          through all 3 outreach emails — the follow-up queue won&apos;t resurface{" "}
          {health.coldLeadCount === 1 ? "it" : "them"} again. Use{" "}
          <strong>Re-engage</strong> or <strong>Close</strong> in the Cold leads panel (or
          row actions) below.
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

      {health.followUpsDueCount > 0 ? (
        <p className="mt-3 text-xs text-indigo-900">
          {health.followUpsDueCount} lead{health.followUpsDueCount === 1 ? "" : "s"} due for
          Email 2/3 — send follow-ups from the Due badges on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>{" "}
          (or Work next) before they go cold.
        </p>
      ) : null}

      {health.marketingPacksDueCount > 0 ? (
        <p className="mt-3 text-xs text-emerald-900">
          {health.marketingPacksDueCount} Growth/Complete lead
          {health.marketingPacksDueCount === 1 ? "" : "s"} still need a{" "}
          {health.marketingPacksDueMonth} marketing pack — generate from the Marketing packs
          due panel on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>{" "}
          (sold monthly promise).
        </p>
      ) : null}

      {health.recurringEntitlementPausedCount > 0 ? (
        <p className="mt-3 text-xs text-rose-900">
          {health.recurringEntitlementPausedCount} Growth/Complete/Commerce subscriber
          {health.recurringEntitlementPausedCount === 1 ? "" : "s"} have paused or canceled
          recurring entitlement
          {health.oldestRecurringEntitlementPausedAgeHours !== null
            ? ` (oldest ${formatAbandonedAgeHours(health.oldestRecurringEntitlementPausedAgeHours)})`
            : ""}
          — they drop out of packs/catalog panels; open{" "}
          <strong>Manage billing</strong> on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>{" "}
          so they can update payment or resubscribe (MRR recovery).
        </p>
      ) : null}

      {health.commerceCatalogsMissingCount > 0 ? (
        <p className="mt-3 text-xs text-orange-900">
          {health.commerceCatalogsMissingCount} Commerce add-on lead
          {health.commerceCatalogsMissingCount === 1 ? "" : "s"} still need a catalog — add
          SKUs from the Commerce catalogs missing panel on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>{" "}
          (sold catalog promise).
        </p>
      ) : null}

      {health.commerceCatalogsUnsyncedCount > 0 ? (
        <p className="mt-3 text-xs text-amber-900">
          {health.commerceCatalogsUnsyncedCount} Commerce catalog
          {health.commerceCatalogsUnsyncedCount === 1 ? "" : "s"} still need{" "}
          <strong>Sync to Stripe</strong> so Buy now works — see the Commerce catalogs
          unsynced panel on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>
          .
        </p>
      ) : null}

      {health.clientVoicePacksDueCount > 0 ? (
        <p className="mt-3 text-xs text-violet-900">
          {health.clientVoicePacksDueCount} Complete lead
          {health.clientVoicePacksDueCount === 1 ? "" : "s"} still need a voice FAQ pack —
          generate from the Voice packs due panel on{" "}
          <Link href="/dashboard/leads" className="underline underline-offset-2">
            /dashboard/leads
          </Link>{" "}
          (sold phone promise; Twilio stays separate).
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
        {health.closedLeadCount > 0 ? (
          <p className="mt-3 text-xs text-stone-600">
            {health.closedLeadCount} closed lead
            {health.closedLeadCount === 1 ? "" : "s"} outside the active funnel (cold close /
            not a fit) — filter <strong>Closed</strong> on{" "}
            <Link href="/dashboard/leads" className="underline underline-offset-2">
              /dashboard/leads
            </Link>{" "}
            to review or reopen. Not a second priority queue.
          </p>
        ) : null}
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
                  href={leadPreviewPath(lead.slug)}
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

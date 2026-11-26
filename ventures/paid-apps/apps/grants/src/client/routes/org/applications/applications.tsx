// OWNER: applications UI agent — every application with status, review tier, funder, amount and
// deadline. Polls while any draft is being written or fact-checked.
import { ApplicationStatusBadge, TierBadge } from "@client/components/application/application-view";
import { isBusy } from "@client/components/application/model";
import { useApplications } from "@client/components/application/queries";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { timeAgo } from "@client/components/grants/format";
import { DeadlineLabel } from "@client/components/grants/match-badges";
import { useOrgId } from "@client/components/grants/queries";
import { GuideNextStep } from "@client/components/guide/getting-started";
import {
  buttonClass,
  EmptyState,
  Label,
  PageHeader,
  Select,
  SkeletonCard,
  Table,
  Td,
  Th,
} from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, Search } from "lucide-react";
import * as React from "react";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All applications" },
  {
    value:
      "draft_queued,drafting,verifying,needs_info,in_review,changes_requested,approved,submitting",
    label: "In progress",
  },
  { value: "draft_queued,drafting,verifying", label: "Drafting & fact-checking" },
  { value: "needs_info", label: "Needs info" },
  { value: "in_review,changes_requested", label: "In review" },
  { value: "approved,submitting", label: "Approved / submitting" },
  { value: "submitted", label: "Submitted" },
  { value: "awarded", label: "Awarded" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "failed", label: "Failed" },
];

export function ApplicationsPage() {
  const orgId = useOrgId();
  const [status, setStatus] = React.useState("");
  const q = useApplications(orgId, status);
  const items = q.data?.items ?? [];
  const busy = items.some((a) => isBusy(a.status));
  const filterId = React.useId();

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Drafts are written only from your own facts. Each one is fact-checked and routed to the right level of review."
        actions={
          <Link
            to="/orgs/$orgId/opportunities"
            params={{ orgId }}
            className={buttonClass({ variant: "secondary" })}
          >
            <Search aria-hidden /> Find opportunities
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-64 max-w-full space-y-1.5">
          <Label htmlFor={filterId}>Status</Label>
          <Select id={filterId} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        {busy && (
          <p className="flex items-center gap-1.5 text-sm text-neutral-500" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden /> Updating live
            while drafts are in progress
          </p>
        )}
      </div>

      {q.isPending ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : q.error ? (
        <ApiErrorAlert error={q.error} title="Couldn't load applications" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={status ? "No applications with this status" : "No applications yet"}
          description={
            status
              ? "Try another status filter."
              : "Pick a matched opportunity and click Draft application. The draft cites your own documents for every claim."
          }
          action={
            !status ? (
              <>
                <Link
                  to="/orgs/$orgId/opportunities"
                  params={{ orgId }}
                  className={buttonClass({})}
                >
                  Browse opportunities
                </Link>
                <GuideNextStep orgId={orgId} except="first_draft" className="basis-full" />
              </>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Application</Th>
              <Th>Status</Th>
              <Th>Review</Th>
              <Th className="text-right">Amount</Th>
              <Th>Deadline</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50/60">
                <Td className="min-w-64">
                  <Link
                    to="/orgs/$orgId/applications/$applicationId"
                    params={{ orgId, applicationId: a.id }}
                    className="font-medium text-neutral-900 hover:text-brand-700 hover:underline"
                  >
                    {a.title}
                  </Link>
                  <p className="text-xs text-neutral-500">{a.opportunity?.funderName ?? "—"}</p>
                </Td>
                <Td>
                  <ApplicationStatusBadge status={a.status} />
                </Td>
                <Td>
                  {a.reviewTier ? (
                    <TierBadge tier={a.reviewTier} />
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {formatCents(a.requestedAmountCents)}
                </Td>
                <Td className="whitespace-nowrap">
                  <DeadlineLabel date={a.deadline ?? a.opportunity?.closeDate ?? null} />
                </Td>
                <Td className="whitespace-nowrap text-neutral-500">{timeAgo(a.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

// Approval progress on the application detail page: "Approvals: 1 of 2 — Rosa ✓, waiting for an
// admin". Reads GET /approval-policies/status/:applicationId (the org's approval policy and the
// two-person rule, evaluated for the current version). OWNER: approvals.
import { Badge } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { type ApprovalStatusDto, approvalCountLabel } from "@shared/approvals";
import type { ApplicationStatus } from "@shared/enums";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock } from "lucide-react";

/** Statuses in which approvals are being collected or were just completed. */
export const APPROVAL_STATUSES: ApplicationStatus[] = [
  "in_review",
  "changes_requested",
  "approved",
  "submitting",
];

export const approvalStatusKey = (
  orgId: string,
  applicationId: string,
  versionId?: string | null,
) => ["orgs", orgId, "applications", "detail", applicationId, "approval", versionId ?? ""] as const;

export function useApprovalStatus(
  orgId: string,
  applicationId: string,
  opts: { versionId?: string | null; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: approvalStatusKey(orgId, applicationId, opts.versionId),
    queryFn: () =>
      api<ApprovalStatusDto>(
        orgApi(orgId, `/approval-policies/status/${encodeURIComponent(applicationId)}`),
      ),
    enabled: !!orgId && !!applicationId && (opts.enabled ?? true),
    retry: false,
  });
}

/** The one-line summary, e.g. "Approvals: 1 of 2 — Rosa ✓, waiting for an admin". */
export function approvalSummaryText(s: ApprovalStatusDto): string {
  const names = s.have.map((h) => `${h.name} ✓`);
  const waiting = s.satisfied ? "" : lowerFirst(s.missingDescription);
  const tail = [...names, waiting].filter(Boolean).join(", ");
  return `Approvals: ${Math.min(s.have.length, s.needed)} of ${s.needed}${tail ? ` — ${tail}` : ""}`;
}

const lowerFirst = (s: string) => (s ? `${s[0]?.toLowerCase() ?? ""}${s.slice(1)}` : s);

/** Presentational: render a status DTO. */
export function ApprovalStatusView({
  status,
  className,
}: {
  status: ApprovalStatusDto;
  className?: string;
}) {
  const { satisfied, needed, have } = status;
  return (
    <section
      aria-label="Approvals"
      className={cn(
        "rounded-lg px-4 py-3 text-sm ring-1 ring-inset",
        satisfied ? "bg-success-50 ring-success-200" : "bg-white ring-neutral-200",
        className,
      )}
    >
      <p className="sr-only">{approvalSummaryText(status)}</p>
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <span className="font-medium text-neutral-900">Approvals:</span>
        <Badge tone={satisfied ? "success" : "warning"}>
          {approvalCountLabel(have.length, needed)}
        </Badge>
        {status.twoPersonRule && <Badge tone="info">Two-person rule</Badge>}
      </div>
      <ul className="mt-2 space-y-1" aria-hidden>
        {have.map((h) => (
          <li key={h.userId} className="flex items-center gap-1.5 text-neutral-800">
            <Check className="h-4 w-4 text-success-600" aria-hidden />
            {h.name}
            {h.onBehalfOf && <span className="text-neutral-500">(for {h.onBehalfOf.name})</span>}
          </li>
        ))}
        {!satisfied && (
          <li className="flex items-center gap-1.5 text-neutral-600">
            <Clock className="h-4 w-4 text-warning-600" aria-hidden />
            {status.missingDescription}
          </li>
        )}
      </ul>
      {status.rule.id !== "default" && (
        <p className="mt-2 text-xs text-neutral-500" aria-hidden>
          Rule: {status.rule.name}
        </p>
      )}
    </section>
  );
}

/**
 * Data-bound: shows approval progress while the application is in review. Renders nothing when
 * there is nothing to approve yet, the status is not review-related, or the request fails (the
 * review actions still show their own errors).
 */
export function ApprovalStatus({
  orgId,
  applicationId,
  status,
  versionId,
  className,
}: {
  orgId: string;
  applicationId: string;
  status: ApplicationStatus;
  versionId?: string | null;
  className?: string;
}) {
  const relevant = APPROVAL_STATUSES.includes(status) && !!versionId;
  const q = useApprovalStatus(orgId, applicationId, { versionId, enabled: relevant });
  if (!relevant || !q.data) return null;
  // One approver and none yet: the normal one-click flow, nothing worth showing.
  if (q.data.needed === 1 && q.data.have.length === 0 && q.data.rule.id === "default") return null;
  return <ApprovalStatusView status={q.data} className={className} />;
}

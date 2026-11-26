// OWNER: applications UI agent — applications waiting for a human, soonest deadline first.
import { ApplicationStatusBadge, TierBadge } from "@client/components/application/application-view";
import { useReviewQueue } from "@client/components/application/queries";
import type { ReviewQueueItem } from "@client/components/application/types";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { DeadlineLabel } from "@client/components/grants/match-badges";
import { useOrgId } from "@client/components/grants/queries";
import { GuideNextStep } from "@client/components/guide/getting-started";
import {
  Badge,
  buttonClass,
  EmptyState,
  PageHeader,
  SkeletonCard,
  Table,
  Td,
  Th,
} from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

const deadlineOf = (a: ReviewQueueItem) => a.deadline ?? a.opportunity?.closeDate ?? null;

/** Soonest deadline first; applications without a deadline last. */
export function sortByDeadline(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return [...items].sort((a, b) => {
    const da = deadlineOf(a);
    const db = deadlineOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(da).getTime() - new Date(db).getTime();
  });
}

export function ReviewsPage() {
  const orgId = useOrgId();
  const q = useReviewQueue(orgId);
  const items = sortByDeadline(q.data?.items ?? []);

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Drafts that need a human: check the flags, skim the summary, approve or request changes."
      />
      {q.isPending ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : q.error ? (
        <ApiErrorAlert error={q.error} title="Couldn't load the review queue" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="Nothing waiting for review"
          description="When a draft is fact-checked and needs a human decision, it shows up here."
          action={
            <>
              <Link
                to="/orgs/$orgId/applications"
                params={{ orgId }}
                className={buttonClass({ variant: "secondary" })}
              >
                All applications
              </Link>
              <GuideNextStep orgId={orgId} className="basis-full" />
            </>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Application</Th>
              <Th>Deadline</Th>
              <Th>Flags</Th>
              <Th>Review</Th>
              <Th className="text-right">Amount</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50/60">
                <Td className="min-w-64">
                  <p className="font-medium text-neutral-900">{a.title}</p>
                  <p className="text-xs text-neutral-500">{a.opportunity?.funderName}</p>
                  <div className="mt-1">
                    <ApplicationStatusBadge status={a.status} />
                  </div>
                </Td>
                <Td className="whitespace-nowrap">
                  <DeadlineLabel date={deadlineOf(a)} />
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={a.openBlockers > 0 ? "danger" : "neutral"}>
                      {a.openBlockers} blocker{a.openBlockers === 1 ? "" : "s"}
                    </Badge>
                    <Badge tone={a.openWarnings > 0 ? "warning" : "neutral"}>
                      {a.openWarnings} warning{a.openWarnings === 1 ? "" : "s"}
                    </Badge>
                  </div>
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
                <Td className="text-right">
                  <Link
                    to="/orgs/$orgId/applications/$applicationId"
                    params={{ orgId, applicationId: a.id }}
                    className={buttonClass({ size: "sm" })}
                  >
                    Open<span className="sr-only"> {a.title}</span>
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

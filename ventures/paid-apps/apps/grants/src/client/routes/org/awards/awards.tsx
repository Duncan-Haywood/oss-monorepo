// OWNER: awards UI — every award the org has won, with its next funder report and when it's due.
// Awards are created when an application's outcome is recorded as awarded.

import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { useOrgId } from "@client/components/grants/queries";
import { HrefLink } from "@client/components/layout/href-link";
import {
  Badge,
  EmptyState,
  PageHeader,
  SkeletonCard,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import type { AwardListItem, AwardReportDto } from "@shared/api/awards";
import { Award } from "lucide-react";
import { awardPath, useAwards } from "./queries";

export const REPORT_KIND_LABEL: Record<AwardReportDto["kind"], string> = {
  interim: "Interim report",
  final: "Final report",
  financial: "Financial report",
  other: "Report",
};

const DAY = 86_400_000;

/** "Due in 12 days" / "Overdue by 3 days" / "Due today", relative to `now`. */
export function dueLabel(
  dueAt: string,
  now: Date = new Date(),
): { text: string; tone: "danger" | "warning" | "neutral" } {
  const days = Math.ceil((new Date(dueAt).getTime() - now.getTime()) / DAY);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "danger" };
  if (days === 0) return { text: "Due today", tone: "danger" };
  return {
    text: `Due in ${days} day${days === 1 ? "" : "s"}`,
    tone: days <= 14 ? "warning" : "neutral",
  };
}

export function NextReportCell({ report }: { report: AwardReportDto | null }) {
  if (!report) return <span className="text-neutral-500">All reports submitted</span>;
  const due = dueLabel(report.dueAt);
  return (
    <div className="space-y-1">
      <div className="font-medium text-neutral-900">{REPORT_KIND_LABEL[report.kind]}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {formatDate(report.dueAt)}
        <Badge tone={due.tone}>{due.text}</Badge>
        <StatusBadge status={report.status} />
      </div>
    </div>
  );
}

export function AwardsTable({ orgId, items }: { orgId: string; items: AwardListItem[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Award</Th>
          <Th>Amount</Th>
          <Th>Grant period</Th>
          <Th>Next report</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {items.map((a) => (
          <tr key={a.id} className="align-top">
            <Td>
              <HrefLink
                href={awardPath(orgId, a.id)}
                className="font-medium text-brand-700 hover:underline"
              >
                {a.title}
              </HrefLink>
              <div className="text-xs text-neutral-500">
                {a.funderName}
                {a.grantNumber ? ` · ${a.grantNumber}` : ""}
              </div>
            </Td>
            <Td className="tabular-nums">{formatCents(a.amountCents)}</Td>
            <Td className="text-sm text-neutral-600">
              {a.startDate && a.endDate ? (
                `${formatDate(`${a.startDate}T00:00:00Z`)} – ${formatDate(`${a.endDate}T00:00:00Z`)}`
              ) : (
                <span className="text-warning-700">Add the grant period to schedule reports</span>
              )}
            </Td>
            <Td>
              <NextReportCell report={a.nextReport} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function AwardsPage() {
  const orgId = useOrgId();
  const q = useAwards(orgId);
  const items = q.data?.items ?? [];
  return (
    <div>
      <PageHeader
        title="Awards"
        description="Grants you've won and the reports each funder expects. Reports are drafted only from facts dated in the reporting period."
      />
      {q.isError ? (
        <ApiErrorAlert error={q.error} />
      ) : q.isPending ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Award />}
          title="No awards yet"
          description="When you record an application's outcome as awarded, it shows up here with a report schedule."
        />
      ) : (
        <AwardsTable orgId={orgId} items={items} />
      )}
    </div>
  );
}

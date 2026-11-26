// Fact-base coverage: which topics are missing / thin / good, plus a one-click gap-fill interview.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
} from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { MessageSquarePlus } from "lucide-react";
import { factCategoryLabel } from "./labels";
import { type CoverageItem, useFactSummary, useStartInterview } from "./queries";

const COVERAGE_STYLE: Record<CoverageItem["status"], { label: string; chip: string; dot: string }> =
  {
    missing: {
      label: "Missing",
      chip: "border-danger-200 bg-danger-50 text-danger-800",
      dot: "bg-danger-500",
    },
    thin: {
      label: "Thin",
      chip: "border-warning-200 bg-warning-50 text-warning-800",
      dot: "bg-warning-500",
    },
    good: {
      label: "Good",
      chip: "border-success-200 bg-success-50 text-success-800",
      dot: "bg-success-500",
    },
  };

export function CoveragePanel({ orgId }: { orgId: string }) {
  const summary = useFactSummary(orgId);
  const start = useStartInterview(orgId);
  const coverage = summary.data?.coverage ?? [];
  const gaps = coverage.filter((c) => c.status !== "good").length;
  const order = { missing: 0, thin: 1, good: 2 } as const;

  return (
    <Card data-tour="facts-coverage">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Coverage</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            {summary.isSuccess
              ? gaps === 0
                ? "Every topic funders usually ask about is covered."
                : `${gaps} ${gaps === 1 ? "topic needs" : "topics need"} more facts before drafts can be strong.`
              : "How well your fact base covers what funders ask about."}
          </p>
        </div>
        <Button
          onClick={() => start.mutate({ kind: "follow_up" })}
          loading={start.isPending}
          variant={gaps > 0 ? "primary" : "secondary"}
        >
          {!start.isPending && <MessageSquarePlus className="h-4 w-4" aria-hidden />}
          Fill gaps with an interview
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        <ApiErrorAlert error={start.error} title="Couldn't start the interview" />
        {summary.isPending ? (
          <Spinner label="Checking coverage" />
        ) : summary.isError ? (
          <ApiErrorAlert error={summary.error} title="Couldn't check coverage" />
        ) : coverage.length === 0 ? (
          <p className="text-sm text-neutral-500">No coverage data yet.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2" aria-label="Topic coverage">
              {[...coverage]
                .sort((a, b) => order[a.status] - order[b.status])
                .map((c) => {
                  const st = COVERAGE_STYLE[c.status] ?? COVERAGE_STYLE.thin;
                  return (
                    <li
                      key={c.topic}
                      title={c.question}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                        st.chip,
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", st.dot)} aria-hidden />
                      {c.label ?? factCategoryLabel(c.topic)}
                      <span className="font-normal opacity-80">
                        {st.label} · {c.factCount}
                        {c.confirmedCount != null && c.factCount > 0 && (
                          <span className="sr-only"> ({c.confirmedCount} confirmed)</span>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
            {summary.data.byStatus && (
              <p className="flex flex-wrap gap-2 text-xs text-neutral-500">
                <Badge tone="success">{summary.data.byStatus.confirmed ?? 0} confirmed</Badge>
                <Badge tone="warning">{summary.data.byStatus.proposed ?? 0} need review</Badge>
                <Badge tone="danger">{summary.data.byStatus.rejected ?? 0} rejected</Badge>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

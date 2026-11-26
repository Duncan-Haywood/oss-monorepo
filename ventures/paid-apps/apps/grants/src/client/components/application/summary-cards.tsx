// "For reviewers" (executive summary + key points) and the grounding (fact-check) report card.
import { timeAgo } from "@client/components/grants/format";
import { HelpTip } from "@client/components/guide/help-tip";
import { Badge, Card, CardBody, CardHeader } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { GroundingReport } from "@shared/content";
import { ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";

export function ReviewerSummaryCard({
  summary,
  keyPoints,
}: {
  summary: string;
  keyPoints: string[];
}) {
  return (
    <Card data-tour="app-summary">
      <CardHeader>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> For reviewers
          </p>
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            Executive summary
          </h2>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {summary ? (
          <p className="leading-relaxed text-neutral-800">{summary}</p>
        ) : (
          <p className="text-sm italic text-neutral-500">No executive summary for this version.</p>
        )}
        {keyPoints.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-neutral-700">Key points</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 marker:text-brand-500">
              {keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

type Row = { label: string; value: number; tone: "good" | "warn" | "bad" | "neutral" };

const valueTone = {
  good: "text-success-700",
  warn: "text-warning-700",
  bad: "text-danger-700",
  neutral: "text-neutral-900",
};

export function GroundingCard({ report }: { report: GroundingReport | null | undefined }) {
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">Fact-check</h2>
            <HelpTip term="grounding" />
          </div>
          <Badge tone="neutral">Not checked yet</Badge>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-neutral-500">
            The independent verifier checks every claim against your facts once the draft is ready.
          </p>
        </CardBody>
      </Card>
    );
  }
  const rows: Row[] = [
    { label: "Supported", value: report.supported, tone: "good" },
    {
      label: "Partially supported",
      value: report.partiallySupported,
      tone: report.partiallySupported ? "warn" : "neutral",
    },
    {
      label: "Unsupported",
      value: report.unsupported,
      tone: report.unsupported ? "bad" : "neutral",
    },
    {
      label: "Number mismatches",
      value: report.numericMismatches,
      tone: report.numericMismatches ? "bad" : "neutral",
    },
    { label: "Gaps", value: report.gaps, tone: report.gaps ? "warn" : "neutral" },
    {
      label: "Unconfirmed facts cited",
      value: report.unconfirmedFactCitations,
      tone: report.unconfirmedFactCitations ? "warn" : "neutral",
    },
  ];
  const Icon = report.passed ? ShieldCheck : ShieldAlert;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
            <Icon
              className={cn("h-4 w-4", report.passed ? "text-success-600" : "text-danger-600")}
              aria-hidden
            />
            Fact-check
          </h2>
          <HelpTip term="grounding" />
        </div>
        <Badge tone={report.passed ? "success" : "danger"} dot>
          {report.passed ? "Passed" : "Failed"}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2">
              <dt className="text-neutral-600">{r.label}</dt>
              <dd className={cn("font-semibold tabular-nums", valueTone[r.tone])}>{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-neutral-500">
          {report.factualClaims} factual of {report.totalClaims} claims checked
          {report.checkedAt ? ` · ${timeAgo(report.checkedAt)}` : ""}
        </p>
      </CardBody>
    </Card>
  );
}

// Match score visuals: fit meter (0-100), eligibility badge, likelihood %, expected value.
import { Badge } from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type { MatchDto } from "@shared/api/types";
import type { Eligibility, MatchStatus } from "@shared/enums";
import { CalendarClock } from "lucide-react";
import {
  type DeadlineUrgency,
  deadlineUrgency,
  ELIGIBILITY_LABEL,
  ELIGIBILITY_TONE,
  formatPercent,
  relativeDeadline,
} from "./format";

export function fitTone(score: number) {
  if (score >= 70) return { bar: "bg-success-500", text: "text-success-700", label: "Strong fit" };
  if (score >= 40)
    return { bar: "bg-warning-500", text: "text-warning-700", label: "Moderate fit" };
  return { bar: "bg-neutral-400", text: "text-neutral-600", label: "Weak fit" };
}

export function FitMeter({
  score,
  className,
  showLabel = true,
}: {
  score: number;
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = fitTone(clamped);
  return (
    <div className={cn("min-w-28", className)}>
      {showLabel && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-neutral-600">Fit</span>
          <span className={cn("font-semibold tabular-nums", tone.text)}>{clamped}/100</span>
        </div>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: native <meter> can't be styled consistently across browsers */}
      <div
        role="meter"
        aria-label="Fit score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped} out of 100 (${tone.label.toLowerCase()})`}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
      >
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function EligibilityBadge({ eligibility }: { eligibility: Eligibility }) {
  return <Badge tone={ELIGIBILITY_TONE[eligibility]}>{ELIGIBILITY_LABEL[eligibility]}</Badge>;
}

const MATCH_STATUS_LABEL: Partial<
  Record<MatchStatus, { label: string; tone: "brand" | "neutral" | "info" | "success" }>
> = {
  shortlisted: { label: "Shortlisted", tone: "brand" },
  dismissed: { label: "Dismissed", tone: "neutral" },
  drafting: { label: "Drafting", tone: "info" },
  applied: { label: "Applied", tone: "success" },
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const s = MATCH_STATUS_LABEL[status];
  return s ? <Badge tone={s.tone}>{s.label}</Badge> : null;
}

/** Compact stack of match signals for list rows / cards. */
export function MatchBadges({ match, className }: { match: MatchDto; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <FitMeter score={match.fitScore} />
      <div className="flex flex-wrap items-center gap-1.5">
        <EligibilityBadge eligibility={match.eligibility} />
        <Badge tone="info" title="Estimated probability of award if you apply">
          {formatPercent(match.likelihood)} likely
        </Badge>
      </div>
      <p className="text-xs text-neutral-500">
        Expected value{" "}
        <span className="font-semibold text-neutral-900 tabular-nums">
          {formatCents(match.expectedValueCents)}
        </span>
      </p>
    </div>
  );
}

const urgencyClass: Record<DeadlineUrgency, string> = {
  none: "text-neutral-500",
  past: "text-neutral-500 line-through decoration-neutral-300",
  urgent: "text-danger-700 font-semibold",
  soon: "text-warning-700",
  normal: "text-neutral-700",
};

/** Deadline shown as relative + absolute date; red when it closes within 14 days. */
export function DeadlineLabel({
  date,
  now,
  className,
}: {
  date: string | null | undefined;
  now?: Date;
  className?: string;
}) {
  const urgency = deadlineUrgency(date, now);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm", urgencyClass[urgency], className)}
      data-urgency={urgency}
    >
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        {relativeDeadline(date, now)}
        {date && <span className="font-normal text-neutral-500"> · {formatDate(date)}</span>}
      </span>
    </span>
  );
}

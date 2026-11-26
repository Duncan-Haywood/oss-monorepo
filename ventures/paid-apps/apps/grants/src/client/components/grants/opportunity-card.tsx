// One opportunity in the list: title, funder, award range, deadline urgency and match signals.
import { Badge, Card } from "@client/components/ui";
import { formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import { Building2, Lock } from "lucide-react";
import { formatAwardRange, toPlainText } from "./format";
import { DeadlineLabel, MatchBadges, MatchStatusBadge } from "./match-badges";
import type { OpportunityWithMatch } from "./queries";

/** Funder text rendered as plain text with line breaks preserved. Never interpreted as HTML. */
export function PlainText({
  text,
  className,
  empty = "Not provided.",
}: {
  text: string | null | undefined;
  className?: string;
  empty?: string;
}) {
  const plain = toPlainText(text);
  if (!plain) return <p className={cn("text-sm text-neutral-500 italic", className)}>{empty}</p>;
  return (
    <div className={cn("whitespace-pre-line text-sm text-neutral-700", className)}>{plain}</div>
  );
}

export function OpportunityCard({
  opportunity: o,
  orgId,
  now,
}: {
  opportunity: OpportunityWithMatch;
  orgId: string;
  now?: Date;
}) {
  const summary = toPlainText(o.summary || o.description);
  const dismissed = o.match?.status === "dismissed";
  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        dismissed && "opacity-70",
        "focus-within:ring-2 focus-within:ring-brand-100",
      )}
    >
      <article
        className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_14rem]"
        aria-labelledby={`opp-${o.id}-title`}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {o.status !== "posted" && (
              <Badge tone={o.status === "forecasted" ? "warning" : "neutral"}>
                {o.status === "forecasted"
                  ? "Forecasted"
                  : o.status === "closed"
                    ? "Closed"
                    : "Archived"}
              </Badge>
            )}
            {o.privateToOrgId && (
              <Badge tone="brand" title="Imported by your organization; not visible to others">
                <Lock className="mr-1 h-3 w-3" aria-hidden />
                Private import
              </Badge>
            )}
            {o.match && <MatchStatusBadge status={o.match.status} />}
          </div>
          <h3
            id={`opp-${o.id}-title`}
            className="text-base font-semibold leading-snug text-neutral-900"
          >
            <Link
              to="/orgs/$orgId/opportunities/$opportunityId"
              params={{ orgId, opportunityId: o.id }}
              className="hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {o.title}
            </Link>
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-neutral-600">
            <Building2 className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            <span className="truncate">{o.funderName}</span>
            {o.opportunityNumber && (
              <span className="shrink-0 text-xs text-neutral-500">#{o.opportunityNumber}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-sm font-medium text-neutral-900">
              {formatAwardRange(o.awardFloorCents, o.awardCeilingCents)}
            </span>
            <DeadlineLabel date={o.closeDate} now={now} />
            {!o.closeDate && o.estimatedCloseDate && (
              <span className="text-xs text-neutral-500">
                Est. close {formatDate(o.estimatedCloseDate)}
              </span>
            )}
          </div>
          {summary && <p className="line-clamp-2 text-sm text-neutral-500">{summary}</p>}
        </div>
        <div className="border-t border-neutral-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          {o.match ? (
            <MatchBadges match={o.match} />
          ) : (
            <p className="text-sm text-neutral-500">
              Not scored yet. Use <span className="font-medium">Rescore matches</span> to evaluate
              your fit.
            </p>
          )}
        </div>
      </article>
    </Card>
  );
}

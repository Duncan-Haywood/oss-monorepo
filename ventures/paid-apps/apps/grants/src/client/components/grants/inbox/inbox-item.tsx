// One inbox item: the compact list row and the detail pane (fit, likelihood, expected value,
// deadline, eligibility chips, top reasons with links to the cited facts).
import { Badge, Kbd, type Tone } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type { MatchReason } from "@shared/content";
import {
  type CheckStatus,
  CRITERION_KIND_LABELS,
  type EligibilityOverall,
} from "@shared/eligibility";
import type { InboxItemDto } from "@shared/match-triage";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleCheck, CircleHelp, CircleX, MinusCircle, XCircle } from "lucide-react";
import type * as React from "react";
import { formatAwardRange, formatPercent, toPlainText } from "../format";
import { DeadlineLabel, EligibilityBadge, FitMeter, fitTone } from "../match-badges";
import { topReasons } from "./model";

const OVERALL: Record<EligibilityOverall, { label: string; tone: Tone }> = {
  eligible: { label: "Eligible", tone: "success" },
  likely: { label: "Likely eligible", tone: "info" },
  unknown: { label: "Eligibility unknown", tone: "warning" },
  ineligible: { label: "Not eligible", tone: "danger" },
};

const CHECK: Record<CheckStatus, { label: string; Icon: typeof CircleCheck; tone: Tone }> = {
  met: { label: "met", Icon: CircleCheck, tone: "success" },
  not_met: { label: "not met", Icon: CircleX, tone: "danger" },
  unknown: { label: "unknown", Icon: CircleHelp, tone: "warning" },
};

/** Overall verdict from the eligibility check (else the fit score's estimate), plus one chip per criterion. */
export function EligibilityChips({
  item,
  compact = false,
}: {
  item: InboxItemDto;
  compact?: boolean;
}) {
  const check = item.eligibilityCheck;
  if (!check) {
    return (
      <span className="inline-flex" title="Estimated by the fit score; eligibility not checked yet">
        <EligibilityBadge eligibility={item.eligibility} />
      </span>
    );
  }
  const overall = OVERALL[check.overall];
  if (compact) {
    const counts = (s: CheckStatus) => check.items.filter((c) => c.status === s).length;
    const notMet = counts("not_met");
    const unknown = counts("unknown");
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge tone={overall.tone}>{overall.label}</Badge>
        {notMet > 0 && <Badge tone="danger">{notMet} not met</Badge>}
        {unknown > 0 && <Badge tone="warning">{unknown} to confirm</Badge>}
      </span>
    );
  }
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Eligibility">
      <li>
        <Badge tone={overall.tone}>{overall.label}</Badge>
      </li>
      {check.items.map((c) => {
        const s = CHECK[c.status];
        return (
          <li key={c.criterionId}>
            <Badge tone={s.tone} title={c.text}>
              <s.Icon className="h-3.5 w-3.5" aria-hidden />
              {CRITERION_KIND_LABELS[c.kind]}
              <span className="sr-only">: {s.label}</span>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

const POLARITY: Record<
  MatchReason["polarity"],
  { Icon: typeof CheckCircle2; cls: string; label: string }
> = {
  positive: { Icon: CheckCircle2, cls: "text-success-600", label: "Strength" },
  negative: { Icon: XCircle, cls: "text-danger-600", label: "Concern" },
  neutral: { Icon: MinusCircle, cls: "text-neutral-400", label: "Note" },
};

export function TopReasons({ orgId, reasons }: { orgId: string; reasons: MatchReason[] }) {
  const top = topReasons(reasons);
  if (top.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Top reasons">
      {top.map((r, i) => {
        const p = POLARITY[r.polarity] ?? POLARITY.neutral;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: reasons have no id and never reorder
          <li key={i} className="flex gap-2 text-sm text-neutral-700">
            <p.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", p.cls)} aria-hidden />
            <span>
              <span className="sr-only">{p.label}: </span>
              {r.text}
              {r.factIds.length > 0 && (
                <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                  {r.factIds.map((fid, n) => (
                    <Link
                      key={fid}
                      to="/orgs/$orgId/knowledge/facts"
                      params={{ orgId }}
                      search={{ factId: fid }}
                      className="rounded bg-neutral-100 px-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 hover:underline"
                      title={`Cited fact ${fid}`}
                    >
                      [{n + 1}]<span className="sr-only"> view cited fact {fid}</span>
                    </Link>
                  ))}
                </span>
              )}
            </span>
          </li>
        );
      })}
      {reasons.length > top.length && (
        <li className="pl-6 text-xs text-neutral-500">
          +{reasons.length - top.length} more on the opportunity page
        </li>
      )}
    </ul>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-semibold text-neutral-900 tabular-nums">{children}</dd>
    </div>
  );
}

/** Compact signals for a list row (also the row button's description). */
export function RowSignals({ item, now }: { item: InboxItemDto; now?: Date }) {
  const tone = fitTone(item.fitScore);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
      <span>
        Fit <span className={cn("font-semibold tabular-nums", tone.text)}>{item.fitScore}</span>
      </span>
      <span>
        <span className="font-semibold tabular-nums">{formatPercent(item.likelihood)}</span> likely
      </span>
      <span>
        EV{" "}
        <span className="font-semibold text-neutral-900 tabular-nums">
          {formatCents(item.expectedValueCents)}
        </span>
      </span>
      <DeadlineLabel date={item.opportunity.closeDate} now={now} className="text-xs" />
      <EligibilityChips item={item} compact />
    </span>
  );
}

export function InboxDetail({
  orgId,
  item,
  headingId,
  now,
  actions,
}: {
  orgId: string;
  item: InboxItemDto;
  headingId: string;
  now?: Date;
  actions: React.ReactNode;
}) {
  const o = item.opportunity;
  const summary = toPlainText(o.summary);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-neutral-500">{o.funderName}</p>
        <h2 id={headingId} className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">
          {o.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <DeadlineLabel date={o.closeDate} now={now} />
          <span className="text-sm text-neutral-600">
            {formatAwardRange(o.awardFloorCents, o.awardCeilingCents)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">{actions}</div>

      <div className="space-y-3">
        <FitMeter score={item.fitScore} />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="Likelihood">{formatPercent(item.likelihood)}</Metric>
          <Metric label="Expected value">{formatCents(item.expectedValueCents)}</Metric>
          <Metric label="Suggested ask">{formatCents(item.suggestedAskCents)}</Metric>
          <Metric label="Effort">
            {item.effortHours != null ? `~${Math.round(item.effortHours)} hrs` : "—"}
          </Metric>
        </dl>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Eligibility</h3>
        <EligibilityChips item={item} />
        {!item.eligibilityCheck && (
          <p className="text-xs text-neutral-500">
            Not checked yet. Open the opportunity to run the eligibility check.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Why it matched</h3>
        {item.reasons.length > 0 ? (
          <TopReasons orgId={orgId} reasons={item.reasons} />
        ) : (
          <p className="text-sm text-neutral-500">No reasons recorded.</p>
        )}
      </div>

      {summary && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-800">Summary</h3>
          <p className="line-clamp-6 whitespace-pre-line text-sm text-neutral-600">{summary}</p>
        </div>
      )}
    </div>
  );
}

/** Visible key hint inside a button (the button itself carries aria-keyshortcuts). */
export function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <Kbd aria-hidden className="ml-1 hidden bg-white/80 sm:inline">
      {children}
    </Kbd>
  );
}

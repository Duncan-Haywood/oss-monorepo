// Dashboard building blocks: KPI tiles, attention list, deadlines timeline, top matches,
// knowledge coverage nudge, getting-started checklist and the activity feed.
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Mail,
  MessageSquareText,
  PencilLine,
  Search,
  Send,
  User,
} from "lucide-react";
import type * as React from "react";
import { friendlyError } from "./api-errors";
import type { ActivityItem, AttentionItem, AttentionKind, DeadlineItem } from "./dashboard-model";
import { DraftApplicationButton } from "./draft-application";
import { formatPercent, humanize, timeAgo } from "./format";
import { EligibilityBadge, FitMeter } from "./match-badges";
import type { CoverageItem, MatchWithOpportunity } from "./queries";
import { useStartInterview } from "./queries";

const linkCls =
  "rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Small inline error for one dashboard section, so one failing endpoint never blanks the page. */
export function SectionError({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-neutral-500" role="status">
      <AlertTriangle className="h-4 w-4 text-warning-500" aria-hidden />
      Couldn't load {what} right now.
    </p>
  );
}

// ---------- KPI tiles ----------

export function KpiTile({
  label,
  value,
  sub,
  icon,
  highlight,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  highlight?: boolean;
  /** Optional link wrapper (rendered around the tile content). */
  children?: (content: React.ReactNode) => React.ReactNode;
}) {
  const content = (
    <div
      className={cn(
        "flex h-full items-start justify-between gap-3 rounded-lg border bg-white p-5 shadow-sm transition-shadow",
        highlight ? "border-warning-300 ring-1 ring-warning-200" : "border-neutral-200",
        children && "hover:shadow-md",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
      </div>
      <span
        className={cn(
          "rounded-md p-2",
          highlight ? "bg-warning-50 text-warning-600" : "bg-brand-50 text-brand-600",
        )}
        aria-hidden
      >
        {icon}
      </span>
    </div>
  );
  return children ? children(content) : content;
}

// ---------- needs your attention ----------

const ATTENTION_META: Record<
  AttentionKind,
  {
    label: string;
    tone: "warning" | "info" | "danger" | "brand" | "neutral";
    icon: React.ReactNode;
  }
> = {
  needs_info: {
    label: "Needs info",
    tone: "warning",
    icon: <MessageSquareText className="h-4 w-4" aria-hidden />,
  },
  review: {
    label: "Review",
    tone: "info",
    icon: <ClipboardCheck className="h-4 w-4" aria-hidden />,
  },
  changes_requested: {
    label: "Changes",
    tone: "warning",
    icon: <PencilLine className="h-4 w-4" aria-hidden />,
  },
  failed: {
    label: "Error",
    tone: "danger",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
  },
  manual_submission: {
    label: "Confirm submission",
    tone: "brand",
    icon: <Send className="h-4 w-4" aria-hidden />,
  },
  followup: { label: "Follow-up", tone: "neutral", icon: <Mail className="h-4 w-4" aria-hidden /> },
};

export function AttentionList({
  orgId,
  items,
  loading,
  failed,
}: {
  orgId: string;
  items: AttentionItem[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Needs your attention</CardTitle>
        {items.length > 0 && <Badge tone="warning">{items.length}</Badge>}
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <div className="px-5 py-4">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-neutral-500">
            {failed ? (
              <SectionError what="your to-do items" />
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-success-500" aria-hidden />
                You're all caught up. Nothing is waiting on you.
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.slice(0, 8).map((it) => (
              <AttentionRow key={it.key} orgId={orgId} item={it} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function AttentionRow({ orgId, item }: { orgId: string; item: AttentionItem }) {
  const meta = ATTENTION_META[item.kind];
  const startInterview = useStartInterview(orgId);
  const titleEl = item.applicationId ? (
    <Link
      to="/orgs/$orgId/applications/$applicationId"
      params={{ orgId, applicationId: item.applicationId }}
      className={cn(linkCls, "font-medium text-neutral-900 hover:text-brand-700 hover:underline")}
    >
      {item.title}
    </Link>
  ) : (
    <span className="font-medium text-neutral-900">{item.title}</span>
  );

  let action: React.ReactNode = null;
  if (item.kind === "needs_info" && item.applicationId) {
    const appId = item.applicationId;
    action = (
      <Button
        size="sm"
        loading={startInterview.isPending}
        onClick={() => startInterview.mutate({ kind: "gap_fill", focusApplicationId: appId })}
      >
        Answer questions
      </Button>
    );
  } else if (item.kind === "review") {
    action = (
      <Link
        to="/orgs/$orgId/reviews"
        params={{ orgId }}
        className={cn(linkCls, "text-sm font-medium text-brand-700 hover:underline")}
      >
        Open review queue
      </Link>
    );
  } else if (item.kind === "manual_submission" || item.kind === "followup") {
    action = (
      <Link
        to="/orgs/$orgId/submissions"
        params={{ orgId }}
        className={cn(linkCls, "text-sm font-medium text-brand-700 hover:underline")}
      >
        {item.kind === "manual_submission" ? "Confirm" : "View"}
      </Link>
    );
  } else if (item.applicationId) {
    action = (
      <Link
        to="/orgs/$orgId/applications/$applicationId"
        params={{ orgId, applicationId: item.applicationId }}
        className={cn(linkCls, "text-sm font-medium text-brand-700 hover:underline")}
      >
        Open
      </Link>
    );
  }

  return (
    <li className="flex flex-col items-start gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
      <Badge tone={meta.tone} className="shrink-0 gap-1">
        {meta.icon}
        {meta.label}
      </Badge>
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <p className="text-sm break-words sm:truncate">{titleEl}</p>
        <p className="text-xs text-neutral-500">
          {item.detail}
          {item.date && item.kind !== "followup" && item.kind !== "manual_submission" && (
            <> · due {formatDate(item.date)}</>
          )}
        </p>
        {startInterview.error && (
          <p className="text-xs text-danger-600" role="alert">
            {friendlyError(startInterview.error)}
          </p>
        )}
      </div>
      {action}
    </li>
  );
}

// ---------- upcoming deadlines ----------

export function DeadlinesTimeline({
  orgId,
  items,
  loading,
  failed,
  windowDays = 30,
}: {
  orgId: string;
  items: DeadlineItem[];
  loading: boolean;
  failed: boolean;
  windowDays?: number;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Upcoming deadlines</CardTitle>
        <span className="text-xs text-neutral-500">Next {windowDays} days</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          failed ? (
            <SectionError what="deadlines" />
          ) : (
            <p className="text-sm text-neutral-500">
              No deadlines in the next {windowDays} days.{" "}
              <Link
                to="/orgs/$orgId/opportunities"
                params={{ orgId }}
                className={cn(linkCls, "font-medium text-brand-700 hover:underline")}
              >
                Find grants closing soon
              </Link>
            </p>
          )
        ) : (
          <>
            {/* 30-day track: decorative overview; the list below is the accessible content. */}
            <div className="relative mb-5 h-8" aria-hidden>
              <div className="absolute top-3.5 right-0 left-0 h-1 rounded-full bg-gradient-to-r from-danger-200 via-warning-100 to-neutral-100" />
              <div
                className="absolute top-2 h-4 border-l border-dashed border-danger-300"
                style={{ left: `${(14 / windowDays) * 100}%` }}
              />
              {items.map((d) => (
                <span
                  key={d.key}
                  className={cn(
                    "absolute top-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow",
                    d.days < 14 ? "bg-danger-500" : d.days < 21 ? "bg-warning-500" : "bg-brand-500",
                  )}
                  style={{ left: `${Math.min(100, (d.days / windowDays) * 100)}%` }}
                  title={`${d.title}: ${formatDate(d.date)}`}
                />
              ))}
              <span className="absolute top-6 left-0 text-[10px] text-neutral-500">Today</span>
              <span className="absolute top-6 right-0 text-[10px] text-neutral-500">
                +{windowDays}d
              </span>
            </div>
            <ol className="space-y-2">
              {items.map((d) => (
                <li key={d.key} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex w-14 shrink-0 flex-col items-center rounded-md py-1 text-center",
                      d.days < 14
                        ? "bg-danger-50 text-danger-700"
                        : "bg-neutral-50 text-neutral-700",
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase">
                      {new Intl.DateTimeFormat("en-US", { month: "short" }).format(
                        new Date(d.date),
                      )}
                    </span>
                    <span className="text-lg leading-none font-semibold tabular-nums">
                      {new Date(d.date).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {d.applicationId ? (
                        <Link
                          to="/orgs/$orgId/applications/$applicationId"
                          params={{ orgId, applicationId: d.applicationId }}
                          className={cn(linkCls, "hover:text-brand-700 hover:underline")}
                        >
                          {d.title}
                        </Link>
                      ) : d.opportunityId ? (
                        <Link
                          to="/orgs/$orgId/opportunities/$opportunityId"
                          params={{ orgId, opportunityId: d.opportunityId }}
                          className={cn(linkCls, "hover:text-brand-700 hover:underline")}
                        >
                          {d.title}
                        </Link>
                      ) : (
                        d.title
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {d.kind === "application"
                        ? "Application"
                        : d.status === "shortlisted"
                          ? "Shortlisted grant"
                          : "Strong match, not started"}
                      {d.subtitle && ` · ${d.subtitle}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium tabular-nums",
                      d.days < 14 ? "text-danger-700" : "text-neutral-500",
                    )}
                  >
                    {d.days === 0 ? "Today" : d.days === 1 ? "Tomorrow" : `${d.days} days`}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- top matches ----------

export function TopMatches({
  orgId,
  matches,
  loading,
  failed,
}: {
  orgId: string;
  matches: MatchWithOpportunity[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Top matches</CardTitle>
        <Link
          to="/orgs/$orgId/opportunities"
          params={{ orgId }}
          className={cn(linkCls, "text-sm font-medium text-brand-700 hover:underline")}
        >
          All opportunities
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <div className="px-5 py-4">
            <Spinner />
          </div>
        ) : matches.length === 0 ? (
          <div className="px-5 py-6 text-sm text-neutral-500">
            {failed ? (
              <SectionError what="matches" />
            ) : (
              <>
                No scored matches yet. Matches appear once your fact base has a few confirmed facts
                and new grants are discovered.{" "}
                <Link
                  to="/orgs/$orgId/opportunities"
                  params={{ orgId }}
                  className={cn(linkCls, "font-medium text-brand-700 hover:underline")}
                >
                  Browse opportunities
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {matches.map((m) => (
              <li
                key={m.id}
                className="grid items-center gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
              >
                <div className="min-w-0">
                  <Link
                    to="/orgs/$orgId/opportunities/$opportunityId"
                    params={{ orgId, opportunityId: m.opportunityId }}
                    className={cn(
                      linkCls,
                      "font-medium text-neutral-900 hover:text-brand-700 hover:underline",
                    )}
                  >
                    {m.opportunity.title}
                  </Link>
                  <p className="truncate text-xs text-neutral-500">
                    {m.opportunity.funderName}
                    {m.opportunity.closeDate && ` · closes ${formatDate(m.opportunity.closeDate)}`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <EligibilityBadge eligibility={m.eligibility} />
                    <Badge tone="info">{formatPercent(m.likelihood)} likely</Badge>
                    {m.status === "shortlisted" && <Badge tone="brand">Shortlisted</Badge>}
                  </div>
                </div>
                <div className="space-y-1">
                  <FitMeter score={m.fitScore} />
                  <p className="text-xs text-neutral-500">
                    EV{" "}
                    <span className="font-semibold text-neutral-900">
                      {formatCents(m.expectedValueCents)}
                    </span>
                    {m.suggestedAskCents != null && <> · ask {formatCents(m.suggestedAskCents)}</>}
                  </p>
                </div>
                <DraftApplicationButton
                  orgId={orgId}
                  opportunityId={m.opportunityId}
                  projectId={m.projectId}
                  requestedAmountCents={m.suggestedAskCents}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- knowledge coverage ----------

export function CoverageNudge({
  orgId,
  coverage,
  loading,
  failed,
}: {
  orgId: string;
  coverage: CoverageItem[];
  loading: boolean;
  failed: boolean;
}) {
  const startInterview = useStartInterview(orgId);
  const gaps = coverage.filter((c) => c.status !== "good");
  const good = coverage.length - gaps.length;
  const pct = coverage.length ? Math.round((good / coverage.length) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge coverage</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {loading ? (
          <Spinner />
        ) : failed ? (
          <SectionError what="knowledge coverage" />
        ) : coverage.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Coverage appears once you've added documents or completed an interview.
          </p>
        ) : (
          <>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-neutral-500">
                  {good} of {coverage.length} topics well covered
                </span>
                <span className="font-semibold text-neutral-700">{pct}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-neutral-100"
                role="progressbar"
                aria-label="Knowledge coverage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="h-full rounded-full bg-success-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {gaps.length > 0 ? (
              <>
                <p className="text-sm text-neutral-600">
                  Drafts can only use facts you've provided. These topics are thin or missing:
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {gaps.slice(0, 8).map((g) => (
                    <li key={g.topic}>
                      <Badge
                        tone={g.status === "missing" ? "danger" : "warning"}
                        title={g.question}
                      >
                        {g.label ?? humanize(g.topic)}
                        <span className="sr-only">: {g.status}</span>
                        {g.status === "thin" && (
                          <span className="ml-1 opacity-70">({g.factCount})</span>
                        )}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  className="w-full"
                  loading={startInterview.isPending}
                  onClick={() => startInterview.mutate({ kind: "follow_up" })}
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden />
                  Start an interview
                </Button>
                <p className="text-xs text-neutral-500">
                  A 10-minute conversation fills these gaps. You can talk or type.
                </p>
                {startInterview.error && (
                  <p className="text-xs text-danger-600" role="alert">
                    {friendlyError(startInterview.error)}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Every topic is well covered.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- getting started ----------

export interface SetupStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  to:
    | "/orgs/$orgId/knowledge/documents"
    | "/orgs/$orgId/interviews"
    | "/orgs/$orgId/knowledge/facts"
    | "/orgs/$orgId/opportunities";
  cta: string;
  icon: React.ReactNode;
}

export function buildSetupSteps(s: {
  documents: number;
  interviews: number;
  confirmedFacts: number;
  proposedFacts: number;
  engagedWithOpportunities: boolean;
}): SetupStep[] {
  return [
    {
      key: "documents",
      title: "Upload your documents",
      description: "Annual reports, budgets, program descriptions and past applications.",
      done: s.documents > 0,
      to: "/orgs/$orgId/knowledge/documents",
      cta: "Upload documents",
      icon: <FileText className="h-5 w-5" aria-hidden />,
    },
    {
      key: "interview",
      title: "Do a short interview",
      description: "Tell us what isn't written down. Talk or type; it takes about 10 minutes.",
      done: s.interviews > 0,
      to: "/orgs/$orgId/interviews",
      cta: "Start interview",
      icon: <MessageSquareText className="h-5 w-5" aria-hidden />,
    },
    {
      key: "facts",
      title: "Review your facts",
      description:
        s.proposedFacts > 0
          ? `${s.proposedFacts} extracted fact${s.proposedFacts === 1 ? " is" : "s are"} waiting for confirmation.`
          : "Confirm what we extracted. Drafts only use facts you've confirmed or reviewed.",
      done: s.confirmedFacts > 0,
      to: "/orgs/$orgId/knowledge/facts",
      cta: "Review facts",
      icon: <ClipboardCheck className="h-5 w-5" aria-hidden />,
    },
    {
      key: "opportunities",
      title: "Browse matched grants",
      description: "Shortlist the best fits and start your first draft.",
      done: s.engagedWithOpportunities,
      to: "/orgs/$orgId/opportunities",
      cta: "Browse grants",
      icon: <Search className="h-5 w-5" aria-hidden />,
    },
  ];
}

export function GettingStarted({
  orgId,
  steps,
  variant,
}: {
  orgId: string;
  steps: SetupStep[];
  variant: "hero" | "compact";
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (variant === "hero") {
    return (
      <section
        aria-labelledby="getting-started-title"
        className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8"
      >
        <h2 id="getting-started-title" className="text-xl font-semibold text-neutral-900">
          Let's get your first grant application ready
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Grant Autopilot writes applications using only what you tell it, from your documents and
          interviews, so every claim can be traced back to a source. Four steps to get started:
        </p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "flex flex-col rounded-lg border bg-white p-4",
                s === next
                  ? "border-brand-300 shadow-sm ring-1 ring-brand-100"
                  : "border-neutral-200",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    s.done ? "bg-success-100 text-success-700" : "bg-brand-100 text-brand-700",
                  )}
                  aria-hidden
                >
                  {s.done ? <CheckCircle2 className="h-5 w-5" /> : s.icon}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Step {i + 1}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
              </div>
              <p className="mt-3 font-medium text-neutral-900">{s.title}</p>
              <p className="mt-1 flex-1 text-sm text-neutral-500">{s.description}</p>
              <Link
                to={s.to}
                params={{ orgId }}
                className={cn(
                  linkCls,
                  "mt-4 inline-flex items-center gap-1 text-sm font-medium",
                  s === next ? "text-brand-700" : "text-neutral-600",
                  "hover:underline",
                )}
              >
                {s.done ? "Open" : s.cta}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Getting started</CardTitle>
        <span className="text-xs text-neutral-500">
          {doneCount}/{steps.length} done
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-neutral-100">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                to={s.to}
                params={{ orgId }}
                className={cn(
                  linkCls,
                  "flex items-center gap-3 px-5 py-3 text-sm hover:bg-neutral-50",
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-neutral-300" aria-hidden />
                )}
                <span
                  className={cn(
                    "flex-1",
                    s.done ? "text-neutral-500 line-through" : "font-medium text-neutral-800",
                  )}
                >
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------- recent activity ----------

export function ActivityFeed({
  items,
  loading,
  failed,
  now,
}: {
  items: ActivityItem[];
  loading: boolean;
  failed: boolean;
  now?: Date;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          failed ? (
            <SectionError what="recent activity" />
          ) : (
            <p className="text-sm text-neutral-500">Activity will show up here as you work.</p>
          )
        ) : (
          <ol className="relative space-y-4 border-l border-neutral-200 pl-5">
            {items.map((a) => (
              <li key={a.id} className="relative">
                <span
                  className={cn(
                    "absolute top-0.5 -left-[1.95rem] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white",
                    a.actor === "user"
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-brand-100 text-brand-700",
                  )}
                  aria-hidden
                >
                  {a.actor === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </span>
                <p className="text-sm font-medium text-neutral-800">
                  {a.label}
                  {a.actor === "autopilot" && (
                    <Badge tone="brand" className="ml-1.5 align-middle">
                      Autopilot
                    </Badge>
                  )}
                </p>
                {a.detail && <p className="truncate text-xs text-neutral-600">{a.detail}</p>}
                <p className="text-xs text-neutral-500">
                  <time dateTime={a.createdAt}>{timeAgo(a.createdAt, now)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

// The personalized top of the org home: greeting header, next best actions, the 90-day deadline
// strip and the pipeline value tile (the automation level is the AutomationChip under the header). Data: GET /api/orgs/:orgId/home (services/home).
// Everything shown comes from this org's own profile and records.
import { HrefLink } from "@client/components/layout/href-link";
import { Card, CardBody, CardHeader, CardTitle, Spinner } from "@client/components/ui";
import { api, formatCents, formatDate, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type {
  CalendarEntry,
  HomeCalendar,
  HomeGreeting,
  HomePlanDto,
  NextActionKind,
  NextBestAction,
  PipelineValue,
} from "@shared/api/home";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FilePlus2,
  FileUp,
  IdCard,
  ListChecks,
  MessageSquareText,
  PencilLine,
  Radar,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type * as React from "react";
import { SectionError } from "./dashboard-widgets";
import { formatPercent } from "./format";

const linkCls =
  "rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const homeKey = (orgId: string) => ["orgs", orgId, "home"] as const;

export const useHomePlan = (orgId: string) =>
  useQuery({
    queryKey: homeKey(orgId),
    queryFn: () => api<HomePlanDto>(orgApi(orgId, "/home")),
    enabled: !!orgId,
  });

// ---------- copy helpers (pure) ----------

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function timeOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/** Where the org works, from its own profile: service areas first, then city/state. */
export function whereLabel(g: Pick<HomeGreeting, "serviceAreas" | "location">): string | null {
  if (g.serviceAreas.length > 0) return joinList(g.serviceAreas.slice(0, 2));
  return g.location;
}

/** "We're watching for workforce development and construction trades grants in Gallup, NM." */
export function watchStatement(g: Pick<HomeGreeting, "focusAreas" | "serviceAreas" | "location">) {
  const focus = joinList(g.focusAreas.slice(0, 3));
  const where = whereLabel(g);
  if (!focus) {
    return where
      ? `Add your focus areas in settings so we know which grants to watch for in ${where}.`
      : "Add your focus areas in settings so we know which grants to watch for.";
  }
  return `We're watching for ${focus} grants${where ? ` in ${where}` : ""}.`;
}

// ---------- header ----------

export function PlanHeader({
  greeting,
  fallbackOrgName,
  firstRun,
  now,
  actions,
}: {
  greeting: HomeGreeting | undefined;
  /** From GET /orgs/:orgId while (or if) the plan is unavailable. */
  fallbackOrgName: string | undefined;
  firstRun: boolean;
  now: Date;
  actions?: React.ReactNode;
}) {
  const orgName = greeting?.orgName ?? fallbackOrgName;
  const first = greeting?.firstName;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {orgName ? (
            <>
              Good {timeOfDay(now)}
              {first ? `, ${first}` : ""}, here's <span className="text-brand-700">{orgName}</span>
              's grant plan
            </>
          ) : (
            <span>Dashboard</span>
          )}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          {greeting
            ? firstRun
              ? `${watchStatement(greeting)} Add your documents and we'll start drafting from your own facts.`
              : watchStatement(greeting)
            : firstRun
              ? "Welcome to Grant Autopilot. Let's set up your knowledge base."
              : "Here's what's happening with your grants."}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- next best actions ----------

const ACTION_ICON: Record<NextActionKind, React.ReactNode> = {
  upload_documents: <FileUp className="h-4 w-4" aria-hidden />,
  onboarding_interview: <MessageSquareText className="h-4 w-4" aria-hidden />,
  confirm_submission: <Send className="h-4 w-4" aria-hidden />,
  answer_questions: <CircleHelp className="h-4 w-4" aria-hidden />,
  review_draft: <ClipboardCheck className="h-4 w-4" aria-hidden />,
  revise_draft: <PencilLine className="h-4 w-4" aria-hidden />,
  fill_gap: <MessageSquareText className="h-4 w-4" aria-hidden />,
  confirm_facts: <ListChecks className="h-4 w-4" aria-hidden />,
  add_uei: <IdCard className="h-4 w-4" aria-hidden />,
  start_draft: <FilePlus2 className="h-4 w-4" aria-hidden />,
  new_matches: <Sparkles className="h-4 w-4" aria-hidden />,
};

export function NextBestActionsCard({
  actions,
  greeting,
  loading,
  failed,
}: {
  actions: NextBestAction[];
  greeting: HomeGreeting | undefined;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next best actions</CardTitle>
        {actions.length > 0 && (
          <span className="text-xs text-neutral-500">Ranked by deadline and impact</span>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <div className="px-5 py-4">
            <Spinner />
          </div>
        ) : actions.length === 0 ? (
          <div className="px-5 py-6 text-sm text-neutral-500">
            {failed ? (
              <SectionError what="your grant plan" />
            ) : (
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-500" aria-hidden />
                <span>
                  You're caught up.{" "}
                  {greeting
                    ? `${watchStatement(greeting)} New matches will show up here.`
                    : "New matches will show up here."}
                </span>
              </p>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-neutral-100">
            {actions.map((a, i) => (
              <ActionRow key={a.id} action={a} rank={i + 1} />
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function ActionRow({ action: a, rank }: { action: NextBestAction; rank: number }) {
  const titleId = `nba-${a.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center",
        a.priority === "high" && "border-l-4 border-l-warning-400 pl-4",
      )}
      data-kind={a.kind}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          a.priority === "high" ? "bg-warning-50 text-warning-700" : "bg-brand-50 text-brand-700",
        )}
        aria-hidden
      >
        {ACTION_ICON[a.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p id={titleId} className="text-sm font-medium break-words text-neutral-900">
          <span className="sr-only">{rank}. </span>
          {a.title}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">{a.reason}</p>
      </div>
      <HrefLink
        href={a.href}
        aria-describedby={titleId}
        className={cn(
          linkCls,
          "inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline",
        )}
      >
        {a.cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </HrefLink>
    </li>
  );
}

// ---------- 90-day deadline strip ----------

const entryTone = (days: number) =>
  days < 14
    ? "text-danger-700 bg-danger-50"
    : days < 30
      ? "text-warning-700 bg-warning-50"
      : "text-neutral-700 bg-neutral-50";

function entryKindLabel(e: CalendarEntry): string {
  if (e.kind === "application") return "Application";
  return e.status === "shortlisted" ? "Shortlisted grant" : "Strong match";
}

export function DeadlineCalendarStrip({
  calendar,
  greeting,
  opportunitiesHref,
  loading,
  failed,
  perMonth = 4,
}: {
  calendar: HomeCalendar | undefined;
  greeting: HomeGreeting | undefined;
  opportunitiesHref: string;
  loading: boolean;
  failed: boolean;
  perMonth?: number;
}) {
  const windowDays = calendar?.windowDays ?? 90;
  const entries = calendar?.months.flatMap((m) => m.entries) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden />
          Deadline calendar
        </CardTitle>
        <span className="text-xs text-neutral-500">Next {windowDays} days</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner />
        ) : !calendar ? (
          failed ? (
            <SectionError what="your deadline calendar" />
          ) : null
        ) : calendar.total === 0 ? (
          <p className="flex items-start gap-2 text-sm text-neutral-500">
            <Radar className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
            <span>
              No deadlines in the next {windowDays} days.{" "}
              {greeting ? `${watchStatement(greeting)} ` : ""}
              <HrefLink
                href={opportunitiesHref}
                className={cn(linkCls, "font-medium text-brand-700 hover:underline")}
              >
                Browse open grants
              </HrefLink>
            </span>
          </p>
        ) : (
          <>
            {/* Decorative 90-day track; the month lists below are the accessible content. */}
            <div className="relative mb-5 h-8" aria-hidden>
              <div className="absolute top-3.5 right-0 left-0 h-1 rounded-full bg-gradient-to-r from-danger-200 via-warning-100 to-neutral-100" />
              {entries.map((e) => (
                <span
                  key={e.id}
                  className={cn(
                    "absolute top-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow",
                    e.daysLeft < 14
                      ? "bg-danger-500"
                      : e.daysLeft < 30
                        ? "bg-warning-500"
                        : "bg-brand-500",
                  )}
                  style={{
                    left: `${Math.min(100, Math.max(0, (e.daysLeft / windowDays) * 100))}%`,
                  }}
                  title={`${e.title}: ${formatDate(e.date)}`}
                />
              ))}
              <span className="absolute top-6 left-0 text-[10px] text-neutral-500">Today</span>
              <span className="absolute top-6 right-0 text-[10px] text-neutral-500">
                +{windowDays}d
              </span>
            </div>
            <div
              className={cn(
                "grid gap-4 sm:grid-cols-2",
                calendar.months.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
              )}
            >
              {calendar.months.map((m) => (
                <section key={m.month} aria-label={m.label} className="min-w-0">
                  <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-neutral-800">
                    {m.label}
                    <span className="text-xs font-normal text-neutral-500">
                      {m.entries.length === 0
                        ? "Nothing due"
                        : `${m.entries.length} deadline${m.entries.length === 1 ? "" : "s"}`}
                    </span>
                  </h3>
                  {m.entries.length > 0 && (
                    <ol className="space-y-2">
                      {m.entries.slice(0, perMonth).map((e) => (
                        <li key={e.id} className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex w-11 shrink-0 flex-col items-center rounded-md py-1 text-center",
                              entryTone(e.daysLeft),
                            )}
                          >
                            <span className="text-base leading-none font-semibold tabular-nums">
                              {new Date(e.date).getDate()}
                            </span>
                            <span className="text-[10px]">
                              {e.daysLeft === 0 ? "today" : `${e.daysLeft}d`}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <HrefLink
                              href={e.href}
                              className={cn(
                                linkCls,
                                "block truncate text-sm font-medium text-neutral-900 hover:text-brand-700 hover:underline",
                              )}
                            >
                              {e.title}
                            </HrefLink>
                            <span className="block truncate text-xs text-neutral-500">
                              {entryKindLabel(e)} · {e.funderName}
                            </span>
                          </span>
                        </li>
                      ))}
                      {m.entries.length > perMonth && (
                        <li className="text-xs text-neutral-500">
                          +{m.entries.length - perMonth} more in {m.label.split(" ")[0]}
                        </li>
                      )}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- pipeline value ----------

export function PipelineValueTile({
  pipeline,
  greeting,
  loading,
}: {
  pipeline: PipelineValue | undefined;
  greeting: HomeGreeting | undefined;
  loading: boolean;
}) {
  const inPlay = pipeline ? pipeline.shortlistedCount + pipeline.draftingCount : 0;
  const focus = greeting?.focusAreas[0];
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-500">Pipeline value</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
            {loading ? "…" : formatCents(pipeline?.expectedValueCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {!pipeline
              ? "Expected value of shortlisted and drafting grants"
              : inPlay > 0
                ? `Expected value of ${inPlay} shortlisted or drafting grant${inPlay === 1 ? "" : "s"}`
                : `Shortlist ${focus ? `a ${focus} grant` : "a grant"} to start building your pipeline`}
          </p>
        </div>
        <span className="rounded-md bg-brand-50 p-2 text-brand-600" aria-hidden>
          <TrendingUp className="h-5 w-5" />
        </span>
      </div>
      {pipeline && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Awarded to date</dt>
            <dd className="font-semibold text-neutral-900 tabular-nums">
              {formatCents(pipeline.awardedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Win rate</dt>
            <dd className="font-semibold text-neutral-900 tabular-nums">
              {pipeline.winRate == null ? (
                <span className="font-normal text-neutral-500">No outcomes yet</span>
              ) : (
                <>
                  {formatPercent(pipeline.winRate)}{" "}
                  <span className="text-xs font-normal text-neutral-500">
                    ({pipeline.awardedCount} of {pipeline.awardedCount + pipeline.declinedCount})
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

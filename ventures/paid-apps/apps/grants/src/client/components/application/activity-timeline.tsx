// Application activity timeline: what the AI did and what people did at each step, newest last.
// "Who decided?" summary on top, All / AI / Human filter, cursor-paginated (Load more).
// Data: GET /applications/:id/timeline (counts and labels only, never draft text).

import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { timeAgo } from "@client/components/grants/format";
import { Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import { cn } from "@client/lib/cn";
import type {
  TimelineActor,
  TimelineDetailValue,
  TimelineEvent,
  TimelineResponse,
} from "@shared/api/timeline";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Clock, Cog, History, Rocket, Sparkles, User } from "lucide-react";
import * as React from "react";
import { appKeys } from "./queries";

export type TimelineFilter = "all" | "ai" | "human";

const FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI" },
  { value: "human", label: "Human" },
];

/** AI includes autopilot (automation acting for the org); system waits show under All only. */
export function matchesFilter(e: TimelineEvent, f: TimelineFilter): boolean {
  if (f === "all") return true;
  if (f === "ai") return e.actor.type === "ai" || e.actor.type === "autopilot";
  return e.actor.type === "human";
}

export const timelineKey = (orgId: string, applicationId: string) =>
  [...appKeys.detail(orgId, applicationId), "timeline"] as const;

export function useApplicationTimeline(orgId: string, applicationId: string) {
  return useInfiniteQuery({
    queryKey: timelineKey(orgId, applicationId),
    queryFn: ({ pageParam }) =>
      api<TimelineResponse>(
        orgApi(
          orgId,
          `/applications/${encodeURIComponent(applicationId)}/timeline${
            pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""
          }`,
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!orgId && !!applicationId,
  });
}

const ACTOR_STYLE: Record<
  TimelineActor["type"],
  { icon: typeof User; label: string; ring: string }
> = {
  ai: { icon: Sparkles, label: "AI", ring: "bg-accent-50 text-accent-700 ring-accent-200" },
  human: { icon: User, label: "Person", ring: "bg-info-50 text-info-700 ring-info-200" },
  autopilot: {
    icon: Rocket,
    label: "Autopilot",
    ring: "bg-success-50 text-success-700 ring-success-200",
  },
  system: { icon: Cog, label: "System", ring: "bg-neutral-50 text-neutral-600 ring-neutral-200" },
};

function ActorIcon({ actor, kind }: { actor: TimelineActor; kind?: string }) {
  const style = ACTOR_STYLE[actor.type];
  const Icon = kind?.startsWith("wait.") ? Clock : style.icon;
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
        style.ring,
      )}
      data-actor={actor.type}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function actorLabel(a: TimelineActor): string {
  if (a.type === "human") return a.name ?? "A teammate";
  if (a.type === "ai") return a.name ? `AI · ${a.name}` : "AI";
  return ACTOR_STYLE[a.type].label;
}

const DETAIL_LABEL: Record<string, string> = {
  versionNumber: "Version",
  factsCited: "Facts cited",
  sections: "Sections",
  gaps: "Gaps",
  model: "Model",
  note: "Note",
  requestedBy: "Requested by",
  passed: "Passed",
  claims: "Claims",
  factualClaims: "Factual claims",
  supported: "Supported",
  unsupported: "Unsupported",
  numericMismatches: "Number mismatches",
  flags: "Flags",
  blockers: "Blockers",
  warnings: "Warnings",
  flagKinds: "Flag types",
  missing: "Missing details",
  durationMs: "Waited",
  tier: "Review level",
  reasons: "Why",
  decision: "Decision",
  hasComments: "Left comments",
  rating: "Rating",
  sectionKey: "Section",
  tags: "Tags",
  channel: "Channel",
  status: "Status",
  sha256: "SHA-256",
  approvedBy: "Approved by",
  calls: "Calls",
  cost: "Cost",
  purposes: "Purposes",
  models: "Models",
  format: "Format",
  outcome: "Outcome",
  flagKind: "Flag type",
  severity: "Severity",
};
/** Shown elsewhere in the row or internal. */
const HIDDEN_DETAIL = new Set(["open", "endedAt", "lastAt", "costMicros", "stage", "action"]);

function formatDetail(key: string, v: TimelineDetailValue): string | null {
  if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  if (key === "durationMs" && typeof v === "number") {
    const min = Math.round(v / 60_000);
    return min < 1 ? "under a minute" : min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => x.replace(/_/g, " ")).join(", ");
  return typeof v === "string" && key !== "sha256" && key !== "model"
    ? v.replace(/_/g, " ")
    : String(v);
}

function EventDetail({ detail }: { detail: TimelineEvent["detail"] }) {
  const rows = Object.entries(detail ?? {})
    .filter(([k]) => !HIDDEN_DETAIL.has(k))
    .map(([k, v]) => [DETAIL_LABEL[k] ?? k, formatDetail(k, v)] as const)
    .filter((r): r is readonly [string, string] => r[1] !== null);
  if (rows.length === 0) return null;
  return (
    <details className="mt-1 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none hover:text-neutral-700">Details</summary>
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="font-medium text-neutral-600">{k}</dt>
            <dd className="break-all text-neutral-700">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}

function TimelineItem({ event, last }: { event: TimelineEvent; last: boolean }) {
  const open = event.detail?.open === true;
  return (
    <li className="relative flex gap-3 pb-5" data-kind={event.kind}>
      {!last && (
        <span
          aria-hidden
          className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-neutral-200"
        />
      )}
      <ActorIcon actor={event.actor} kind={event.kind} />
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm text-neutral-900">
          {event.summary}
          {open && (
            <span className="ml-2 rounded-full bg-warning-50 px-1.5 py-0.5 text-xs font-medium text-warning-800 ring-1 ring-inset ring-warning-200">
              Now
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          <span>{actorLabel(event.actor)}</span>
          <span aria-hidden> · </span>
          <time dateTime={event.at} title={new Date(event.at).toLocaleString()}>
            {timeAgo(event.at)}
          </time>
          {event.link && (
            <>
              <span aria-hidden> · </span>
              <a
                href={appPath(event.link)}
                className="text-brand-700 hover:underline"
                {...(event.link.startsWith("/api/") ? { download: "" } : {})}
              >
                {event.link.startsWith("/api/") ? "Package" : "Open"}
              </a>
            </>
          )}
        </p>
        <EventDetail detail={event.detail} />
      </div>
    </li>
  );
}

export function ActivityTimeline({
  orgId,
  applicationId,
}: {
  orgId: string;
  applicationId: string;
}) {
  const q = useApplicationTimeline(orgId, applicationId);
  const [filter, setFilter] = React.useState<TimelineFilter>("all");
  const events = React.useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const shown = events.filter((e) => matchesFilter(e, filter));
  const who = q.data?.pages[0]?.whoDecided ?? [];

  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
          <History className="h-4 w-4 text-neutral-500" aria-hidden /> Activity
        </h2>
        {/* biome-ignore lint/a11y/useSemanticElements: a segmented control of toggle buttons */}
        <div
          role="group"
          aria-label="Show activity by"
          className="inline-flex rounded-md bg-neutral-100 p-0.5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                filter === f.value
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {q.isPending ? (
          <div className="space-y-3" role="status" aria-label="Loading activity">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : q.error ? (
          <ApiErrorAlert error={q.error} title="Couldn't load the activity timeline" />
        ) : (
          <>
            {who.length > 0 && (
              <section
                aria-labelledby="who-decided"
                className="rounded-lg bg-neutral-50 px-3 py-2.5"
              >
                <h3
                  id="who-decided"
                  className="text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Who decided?
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-neutral-900">
                  {who.map((s, i) => {
                    const Icon = ACTOR_STYLE[s.actor.type].icon;
                    return (
                      <React.Fragment key={s.step}>
                        {i > 0 && (
                          <span aria-hidden className="text-neutral-400">
                            ·
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            s.pending && "text-neutral-500 italic",
                          )}
                          data-step={s.step}
                        >
                          <Icon className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
                          {s.label}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </p>
              </section>
            )}
            {shown.length === 0 ? (
              <EmptyState
                icon={<History />}
                title={events.length === 0 ? "No activity yet" : "Nothing to show for this filter"}
                description={
                  events.length === 0
                    ? "Drafting, checks, reviews and submissions will appear here."
                    : filter === "ai"
                      ? "The AI and autopilot haven't done anything on the loaded activity."
                      : "No one from your team has acted on this application yet."
                }
              />
            ) : (
              <ol aria-label="Activity timeline" className="pt-1">
                {shown.map((e, i) => (
                  <TimelineItem key={e.id} event={e} last={i === shown.length - 1} />
                ))}
              </ol>
            )}
            {q.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={q.isFetchingNextPage}
                  onClick={() => void q.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// OWNER: grants UI agent — org home: the org's personalized grant plan (greeting, next best
// actions, 90-day deadlines, pipeline value), then KPIs, to-dos, deadlines, matches, coverage, activity.
import { AutomationChip } from "@client/components/automation/automation-chip";
import type { AutomationSettingsSource } from "@client/components/automation/levels";
import {
  buildAttention,
  buildKpis,
  buildUpcomingDeadlines,
  normalizeActivity,
  topMatches,
} from "@client/components/grants/dashboard-model";
import {
  DeadlineCalendarStrip,
  NextBestActionsCard,
  PipelineValueTile,
  PlanHeader,
  useHomePlan,
} from "@client/components/grants/dashboard-plan";
import {
  ActivityFeed,
  AttentionList,
  CoverageNudge,
  DeadlinesTimeline,
  KpiTile,
  TopMatches,
} from "@client/components/grants/dashboard-widgets";
import {
  useApplicationList,
  useDashboardSummary,
  useDocumentList,
  useFactSummary,
  useInterviewList,
  useMatches,
  useOrgId,
  useOrgSummary,
  usePendingFollowups,
  useSubmissionList,
} from "@client/components/grants/queries";
import { GettingStartedChecklist } from "@client/components/guide/getting-started";
import { ShareUpdateCard } from "@client/components/updates/quick-update";
import { formatCents } from "@client/lib/api";
import { Link } from "@tanstack/react-router";
import { Award, ClipboardCheck, FilePenLine, Search, Send } from "lucide-react";

const tileLink =
  "block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function DashboardPage() {
  const orgId = useOrgId();
  const now = new Date();

  const org = useOrgSummary(orgId);
  const home = useHomePlan(orgId);
  const dashboard = useDashboardSummary(orgId);
  const applications = useApplicationList(orgId);
  const matches = useMatches(orgId);
  const submissions = useSubmissionList(orgId);
  const followups = usePendingFollowups(orgId);
  const facts = useFactSummary(orgId);
  const documents = useDocumentList(orgId);
  const interviews = useInterviewList(orgId);

  const apps = applications.data?.items;
  const kpis = buildKpis(dashboard.data, apps, now);
  const kpisLoading = dashboard.isPending && applications.isPending;

  const attention = buildAttention({
    applications: apps,
    submissions: submissions.data?.items,
    followups: followups.data?.items,
    now,
  });
  const deadlines = buildUpcomingDeadlines({
    dashboard: dashboard.data,
    applications: apps,
    matches: matches.data?.items,
    now,
  });
  const best = topMatches(matches.data?.items, 5, now);
  const activity = normalizeActivity(dashboard.data?.recentActivity);

  // First run: nothing uploaded, interviewed or drafted yet (and those lists actually loaded).
  const firstRun =
    documents.isSuccess &&
    applications.isSuccess &&
    documents.data.items.length === 0 &&
    applications.data.items.length === 0 &&
    (interviews.data?.items.length ?? 0) === 0;

  const orgName = org.data?.org.name;
  const plan = home.data;
  // GET /orgs/:orgId also returns settings (typed loosely here: the summary query only needs the name).
  const orgData: { org: unknown; settings?: AutomationSettingsSource } | undefined = org.data;
  const reviewsWaiting = attention.filter((a) => a.kind === "review").length;

  return (
    <div className="space-y-6">
      <PlanHeader
        greeting={plan?.greeting}
        fallbackOrgName={orgName}
        firstRun={plan?.firstRun ?? firstRun}
        now={now}
        actions={
          <Link
            to="/orgs/$orgId/opportunities"
            params={{ orgId }}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Search className="h-4 w-4" aria-hidden />
            Find grants
          </Link>
        }
      />

      <AutomationChip
        orgId={orgId}
        settings={orgData?.settings}
        waiting={attention.length}
        reviews={reviewsWaiting}
        className="-mt-3"
      />

      <GettingStartedChecklist orgId={orgId} />

      <section aria-label="Your grant plan" className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <NextBestActionsCard
            actions={plan?.nextBestActions ?? []}
            greeting={plan?.greeting}
            loading={home.isPending}
            failed={home.isError}
          />
          <PipelineValueTile
            pipeline={plan?.pipelineValue}
            greeting={plan?.greeting}
            loading={home.isPending}
          />
        </div>
        <DeadlineCalendarStrip
          calendar={plan?.calendar}
          greeting={plan?.greeting}
          opportunitiesHref={`/orgs/${orgId}/opportunities`}
          loading={home.isPending}
          failed={home.isError}
        />
      </section>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Awarded to date"
          value={kpisLoading ? "…" : formatCents(kpis.awardedCents)}
          sub={
            kpis.awardedCount > 0
              ? `${kpis.awardedCount} grant${kpis.awardedCount === 1 ? "" : "s"} won`
              : "No awards recorded yet"
          }
          icon={<Award className="h-5 w-5" />}
        />
        <KpiTile
          label="Submitted this month"
          value={kpisLoading ? "…" : kpis.submittedThisMonth}
          sub={new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}
          icon={<Send className="h-5 w-5" />}
        >
          {(content) => (
            <Link to="/orgs/$orgId/submissions" params={{ orgId }} className={tileLink}>
              {content}
            </Link>
          )}
        </KpiTile>
        <KpiTile
          label="Pending reviews"
          value={kpisLoading ? "…" : kpis.pendingReviews}
          sub={kpis.pendingReviews > 0 ? "Open the review queue →" : "Nothing waiting"}
          icon={<ClipboardCheck className="h-5 w-5" />}
          highlight={kpis.pendingReviews > 0}
        >
          {(content) => (
            <Link
              to="/orgs/$orgId/reviews"
              params={{ orgId }}
              className={tileLink}
              aria-label={`Pending reviews: ${kpis.pendingReviews}. Open the review queue`}
            >
              {content}
            </Link>
          )}
        </KpiTile>
        <KpiTile
          label="Applications in progress"
          value={kpisLoading ? "…" : kpis.inProgress}
          sub="Drafting, fact-checking or in review"
          icon={<FilePenLine className="h-5 w-5" />}
        >
          {(content) => (
            <Link to="/orgs/$orgId/applications" params={{ orgId }} className={tileLink}>
              {content}
            </Link>
          )}
        </KpiTile>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <AttentionList
            orgId={orgId}
            items={attention}
            loading={applications.isPending && submissions.isPending}
            failed={applications.isError && submissions.isError && followups.isError}
          />
          <TopMatches
            orgId={orgId}
            matches={best}
            loading={matches.isPending}
            failed={matches.isError}
          />
          <DeadlinesTimeline
            orgId={orgId}
            items={deadlines}
            loading={applications.isPending && matches.isPending}
            failed={applications.isError && matches.isError && dashboard.isError}
          />
        </div>
        <div className="space-y-6">
          <ShareUpdateCard orgId={orgId} />
          <CoverageNudge
            orgId={orgId}
            coverage={facts.data?.coverage ?? []}
            loading={facts.isPending}
            failed={facts.isError}
          />
          <ActivityFeed
            items={activity}
            loading={dashboard.isPending}
            failed={dashboard.isError}
            now={now}
          />
        </div>
      </div>
    </div>
  );
}

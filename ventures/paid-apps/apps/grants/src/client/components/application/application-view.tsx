// The application detail screen: header (deadline, amount, status, review tier + why), submission
// panel, reviewer summary, flags, the cited draft section by section, and the review sidebar.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { timeAgo } from "@client/components/grants/format";
import { DeadlineLabel } from "@client/components/grants/match-badges";
import { HelpTip } from "@client/components/guide/help-tip";
import { TakeTourButton } from "@client/components/guide/tour";
import { APPLICATION_REVIEW_TOUR } from "@client/components/guide/tours";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  SkeletonCard,
  toast,
} from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useCurrentOrg } from "@client/lib/session";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, History, Loader2 } from "lucide-react";
import * as React from "react";
import { ApprovalStatus } from "./approval-status";
import { AttachmentsPanel } from "./attachments-panel";
import type { CitationContext } from "./claims";
import { FlagsPanel, jumpTo } from "./flags-panel";
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  citationNumbers,
  EDITABLE_STATUSES,
  isBusy,
  openFlagCounts,
  paragraphText,
  requirementFor,
  TIER_INFO,
  tierReasonSentences,
  verdictMap,
} from "./model";
import { useRegenerate } from "./queries";
import { CostLine, FeedbackWidget, OutcomeCard, ReviewActions } from "./review-actions";
import { SectionCard } from "./section-card";
import { SubmissionsPanel } from "./submissions-panel";
import { GroundingCard, ReviewerSummaryCard } from "./summary-cards";
import type { ApplicationDetail, VersionSummary } from "./types";

export function ApplicationStatusBadge({ status }: { status: ApplicationDetail["status"] }) {
  return (
    <Badge tone={APPLICATION_STATUS_TONE[status]} dot={!isBusy(status)}>
      {isBusy(status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {APPLICATION_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: ApplicationDetail["reviewTier"] }) {
  if (!tier) return null;
  const info = TIER_INFO[tier];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function BackToApplications({ orgId }: { orgId: string }) {
  return (
    <Link
      to="/orgs/$orgId/applications"
      params={{ orgId }}
      className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All applications
    </Link>
  );
}

function ApplicationHeader({ app, orgId }: { app: ApplicationDetail; orgId: string }) {
  const deadline = app.deadline ?? app.opportunity.closeDate;
  const sentences = tierReasonSentences(app.reviewTierReason);
  const tier = app.reviewTier ? TIER_INFO[app.reviewTier] : null;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ApplicationStatusBadge status={app.status} />
        <TierBadge tier={app.reviewTier} />
        <HelpTip term="review_tier" />
        <span className="ml-auto">
          <TakeTourButton tour={APPLICATION_REVIEW_TOUR} autoStart={app.currentVersion !== null} />
        </span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{app.title}</h1>
      <p className="text-neutral-600">
        {app.opportunity.funderName}
        <span className="text-neutral-400"> · </span>
        <Link
          to="/orgs/$orgId/opportunities/$opportunityId"
          params={{ orgId, opportunityId: app.opportunity.id }}
          className="inline-flex items-center gap-1 text-brand-700 hover:underline"
        >
          {app.opportunity.title} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </p>
      <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Deadline</dt>
          <dd className="mt-1">
            <DeadlineLabel date={deadline} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Requesting
          </dt>
          <dd className="mt-1 font-medium text-neutral-900">
            {app.requestedAmountCents ? formatCents(app.requestedAmountCents) : "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Status</dt>
          <dd className="mt-1 text-neutral-900">{APPLICATION_STATUS_LABEL[app.status]}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Updated</dt>
          <dd className="mt-1 text-neutral-900">{timeAgo(app.updatedAt)}</dd>
        </div>
      </dl>
      {tier && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm ring-1 ring-inset",
            app.reviewTier === "full_review"
              ? "bg-warning-50 text-warning-950 ring-warning-200"
              : app.reviewTier === "auto"
                ? "bg-success-50 text-success-950 ring-success-200"
                : "bg-brand-50 text-brand-950 ring-brand-200",
          )}
        >
          <p className="font-semibold">Review level: {tier.label}</p>
          <p className="mt-0.5">{sentences.length > 0 ? sentences.join(" ") : tier.description}</p>
        </div>
      )}
    </header>
  );
}

function StatusBanner({
  app,
  orgId,
  canEdit,
}: {
  app: ApplicationDetail;
  orgId: string;
  canEdit: boolean;
}) {
  const regen = useRegenerate(orgId, app.id);
  switch (app.status) {
    case "draft_queued":
    case "drafting":
      return (
        <Alert tone="info" title="Drafting from your fact base…">
          The drafter only uses facts from your documents and interviews, and cites each one. This
          page updates on its own.
        </Alert>
      );
    case "verifying":
      return (
        <Alert tone="info" title="Fact-checking every claim…">
          An independent verifier is checking each claim, number and date against the cited facts.
        </Alert>
      );
    case "needs_info": {
      const { blockers } = openFlagCounts(app.flags);
      return (
        <Alert tone="warning" title="Needs information from your team">
          {blockers > 0
            ? `Answer or resolve the ${blockers} blocking flag${blockers === 1 ? "" : "s"} below and the draft continues.`
            : "Some questions couldn't be answered from your facts. Add the missing information to continue."}
        </Alert>
      );
    }
    case "changes_requested":
      return (
        <Alert tone="info" title="Changes requested">
          A reviewer asked for changes. The drafter revises automatically; you can also edit
          sections yourself.
        </Alert>
      );
    case "failed":
      return (
        <div className="space-y-2">
          <Alert
            tone="danger"
            title="Something went wrong with this application"
            action={
              canEdit && app.currentVersion ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={regen.isPending}
                  onClick={() =>
                    regen.mutate({}, { onSuccess: () => toast.success("Drafting again") })
                  }
                >
                  Try drafting again
                </Button>
              ) : undefined
            }
          >
            {app.lastError ?? "The pipeline stopped unexpectedly."}
          </Alert>
          <ApiErrorAlert error={regen.error} title="Couldn't restart drafting" />
        </div>
      );
    case "withdrawn":
      return (
        <Alert tone="neutral" title="Withdrawn">
          {app.outcomeNotes ?? "This application was withdrawn and won't be submitted."}
        </Alert>
      );
    default:
      return null;
  }
}

function VersionsCard({
  versions,
  currentId,
}: {
  versions: VersionSummary[];
  currentId: string | null;
}) {
  if (versions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
          <History className="h-4 w-4 text-neutral-500" aria-hidden /> Versions
        </h2>
        <span className="text-xs text-neutral-500">{versions.length}</span>
      </CardHeader>
      <CardBody>
        <ol className="space-y-1.5 text-sm">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2"
              aria-current={v.id === currentId ? "true" : undefined}
            >
              <span
                className={cn(
                  v.id === currentId ? "font-semibold text-neutral-900" : "text-neutral-600",
                )}
              >
                Version {v.versionNumber}
                <span className="font-normal text-neutral-500">
                  {" "}
                  · {v.authorType === "user" ? "edited by a person" : "drafted by AI"}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                {v.id === currentId && <Badge tone="brand">Current</Badge>}
                {timeAgo(v.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

export function ApplicationDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading application">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    </div>
  );
}

export function ApplicationView({ app, orgId }: { app: ApplicationDetail; orgId: string }) {
  const { can } = useCurrentOrg();
  const canEdit = can("editor") && EDITABLE_STATUSES.includes(app.status);
  const canReview = can("reviewer");
  const version = app.currentVersion;
  const sections = version?.content.sections ?? [];

  const ctx = React.useMemo<CitationContext>(
    () => ({
      orgId,
      numbers: citationNumbers(version?.content),
      facts: new Map(app.citedFacts.map((f) => [f.id, f])),
      verdicts: verdictMap(version?.groundingReport),
    }),
    [orgId, version, app.citedFacts],
  );
  const sectionTitles = React.useMemo(
    () => new Map(sections.map((s) => [s.key, s.title])),
    [sections],
  );
  const sectionTexts = React.useMemo(
    () =>
      version
        ? sections.map((s) => ({
            key: s.key,
            title: s.title,
            versionId: version.id,
            text: s.paragraphs.map(paragraphText).join("\n\n"),
          }))
        : [],
    [sections, version],
  );

  return (
    <div className="space-y-6">
      <BackToApplications orgId={orgId} />
      <ApplicationHeader app={app} orgId={orgId} />
      <StatusBanner app={app} orgId={orgId} canEdit={canEdit} />
      <SubmissionsPanel
        submissions={app.submissions}
        orgId={orgId}
        canConfirm={can("reviewer")}
        sectionTexts={sectionTexts}
      />
      <AttachmentsPanel orgId={orgId} applicationId={app.id} canEdit={can("editor")} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {version ? (
            <>
              <ReviewerSummaryCard
                summary={version.executiveSummary}
                keyPoints={version.keyPoints}
              />
              <FlagsPanel
                flags={app.flags}
                sectionTitles={sectionTitles}
                orgId={orgId}
                applicationId={app.id}
                canResolve={can("editor")}
              />
              <section
                aria-labelledby="draft-heading"
                data-tour="app-citations"
                className="space-y-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="draft-heading"
                    className="text-lg font-semibold tracking-tight text-neutral-900"
                  >
                    Draft{" "}
                    <span className="text-sm font-normal text-neutral-500">
                      · version {sectionVersionLabel(app)}
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Numbers in brackets are citations — hover or focus one to see the source.
                  </p>
                </div>
                {sections.length > 1 && (
                  <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
                    {sections.map((s) => (
                      <a
                        key={s.key}
                        href={`#section-${s.key}`}
                        onClick={(e) => {
                          e.preventDefault();
                          jumpTo(`section-${s.key}`);
                        }}
                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
                      >
                        {s.title}
                      </a>
                    ))}
                  </nav>
                )}
                {sections.map((s) => (
                  <SectionCard
                    key={`${version.id}-${s.key}`}
                    section={s}
                    requirement={requirementFor(app.opportunity, s.key)}
                    ctx={ctx}
                    applicationId={app.id}
                    canEdit={canEdit}
                  />
                ))}
              </section>
            </>
          ) : (
            <Card>
              <CardBody className="space-y-3">
                <p className="font-medium text-neutral-900">
                  {isBusy(app.status) ? "Your draft is on its way" : "No draft yet"}
                </p>
                <p className="text-sm text-neutral-500">
                  {isBusy(app.status)
                    ? "Drafting usually takes a minute or two. Every claim will cite your own facts."
                    : "This application doesn't have a draft version."}
                </p>
                {isBusy(app.status) && <Skeleton className="h-24 w-full" />}
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-6" aria-label="Review and status">
          <ApprovalStatus
            orgId={orgId}
            applicationId={app.id}
            status={app.status}
            versionId={app.currentVersionId}
          />
          <ReviewActions app={app} orgId={orgId} canReview={canReview} />
          <OutcomeCard app={app} orgId={orgId} canEdit={can("editor")} />
          <GroundingCard report={version?.groundingReport} />
          {version && canReview && (
            <FeedbackWidget
              orgId={orgId}
              applicationId={app.id}
              sections={sections.map((s) => ({ key: s.key, title: s.title }))}
            />
          )}
          <VersionsCard versions={app.versions} currentId={app.currentVersionId} />
          <CostLine orgId={orgId} app={app} />
        </aside>
      </div>
    </div>
  );
}

function sectionVersionLabel(app: ApplicationDetail) {
  return (
    app.versions.find((v) => v.id === app.currentVersionId)?.versionNumber ??
    app.currentVersion?.versionNumber ??
    "—"
  );
}

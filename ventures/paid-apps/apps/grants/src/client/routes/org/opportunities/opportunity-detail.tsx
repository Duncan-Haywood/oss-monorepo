// OWNER: grants UI agent — one opportunity: listing details, requirements, match panel, actions.
import { AddToCalendarButton } from "@client/components/calendar/add-to-calendar";
import { EligibilityChecklist } from "@client/components/eligibility/eligibility-checklist";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { DraftApplicationForm } from "@client/components/grants/draft-application";
import { formatAwardRange, formatPercent, humanize } from "@client/components/grants/format";
import {
  DeadlineLabel,
  EligibilityBadge,
  FitMeter,
  MatchStatusBadge,
} from "@client/components/grants/match-badges";
import { PlainText } from "@client/components/grants/opportunity-card";
import {
  type OpportunityWithMatch,
  useConfirmSubmissionEmail,
  useOpportunity,
  useOrgId,
  useProjects,
  useRescoreMatches,
  useUpdateMatchStatus,
} from "@client/components/grants/queries";
import { HelpTip } from "@client/components/guide/help-tip";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
} from "@client/components/ui";
import { ApiError, formatCents, formatDate } from "@client/lib/api";
import type { MatchDto } from "@shared/api/types";
import type { MatchReason, RequirementSection } from "@shared/content";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  EyeOff,
  Lock,
  MinusCircle,
  Paperclip,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

export function OpportunityDetailPage() {
  const orgId = useOrgId();
  const { opportunityId = "" } = useParams({ strict: false }) as { opportunityId?: string };
  const opp = useOpportunity(orgId, opportunityId);

  if (opp.isPending) return <Spinner label="Loading opportunity" />;
  if (opp.error) {
    return (
      <div className="space-y-4">
        <BackLink orgId={orgId} />
        {opp.error instanceof ApiError && opp.error.status === 404 ? (
          <EmptyState
            title="Opportunity not found"
            description="It may have been removed from the catalog, or it was imported by another organization."
          />
        ) : (
          <ApiErrorAlert error={opp.error} title="Couldn't load this opportunity" />
        )}
      </div>
    );
  }
  return <OpportunityDetail orgId={orgId} opportunity={opp.data} />;
}

function BackLink({ orgId }: { orgId: string }) {
  return (
    <Link
      to="/orgs/$orgId/opportunities"
      params={{ orgId }}
      className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All opportunities
    </Link>
  );
}

function OpportunityDetail({
  orgId,
  opportunity: o,
}: {
  orgId: string;
  opportunity: OpportunityWithMatch;
}) {
  const projects = useProjects(orgId);
  const req = o.requirements;
  const sections = req?.sections ?? [];
  const closed = o.status === "closed" || o.status === "archived";

  return (
    <div className="space-y-6">
      <BackLink orgId={orgId} />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            tone={
              o.status === "posted" ? "success" : o.status === "forecasted" ? "warning" : "neutral"
            }
          >
            {o.status === "posted" ? "Open" : humanize(o.status)}
          </Badge>
          {o.privateToOrgId && (
            <Badge tone="brand">
              <Lock className="mr-1 h-3 w-3" aria-hidden /> Private to your organization
            </Badge>
          )}
          {o.match && <MatchStatusBadge status={o.match.status} />}
          {o.costSharingRequired && <Badge tone="warning">Cost share required</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{o.title}</h1>
        <p className="text-neutral-600">
          {o.funderName}
          {o.opportunityNumber && (
            <span className="text-neutral-500"> · Opportunity #{o.opportunityNumber}</span>
          )}
        </p>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Deadline
            </dt>
            <dd className="mt-1">
              <DeadlineLabel date={o.closeDate} />
              {o.closeDate && !closed && (
                <AddToCalendarButton orgId={orgId} opportunityId={o.id} className="mt-2" />
              )}
              {!o.closeDate && (o.estimatedCloseDate || o.estimatedPostDate) && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {o.estimatedPostDate && `Expected to post ${formatDate(o.estimatedPostDate)}`}
                  {o.estimatedPostDate && o.estimatedCloseDate && " · "}
                  {o.estimatedCloseDate && `estimated close ${formatDate(o.estimatedCloseDate)}`}
                </p>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Award range
            </dt>
            <dd className="mt-1 font-medium text-neutral-900">
              {formatAwardRange(o.awardFloorCents, o.awardCeilingCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Total funding · awards
            </dt>
            <dd className="mt-1 text-neutral-900">
              {formatCents(o.totalFundingCents)}
              {o.expectedAwards != null && ` · ~${o.expectedAwards} awards`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Source</dt>
            <dd className="mt-1">
              {o.sourceUrl ? (
                <a
                  href={o.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                >
                  View original listing <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-neutral-500">{humanize(o.source)}</span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About this grant</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {o.summary && <PlainText text={o.summary} className="font-medium text-neutral-800" />}
              {o.description && o.description !== o.summary && <PlainText text={o.description} />}
              {!o.summary && !o.description && (
                <PlainText text="" empty="No description provided by the funder." />
              )}
              {(o.geographicScope || o.categories.length > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {o.geographicScope && <Badge tone="info">{o.geographicScope}</Badge>}
                  {o.categories.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Eligibility</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <PlainText
                text={o.eligibilityText}
                empty="The funder did not publish eligibility details."
              />
              {o.applicantTypes.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Eligible applicant types
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {o.applicantTypes.map((t) => (
                      <Badge key={t}>{humanize(t)}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {req && req.eligibilityCriteria.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                  {req.eligibilityCriteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <EligibilityChecklist orgId={orgId} opportunityId={o.id} />

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Application requirements</CardTitle>
              {req && !req.complete && (
                <Badge tone="warning" title="Parsed from the listing summary, not the full RFP">
                  Partial — from listing
                </Badge>
              )}
            </CardHeader>
            <CardBody className="space-y-4">
              {sections.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Requirements haven't been parsed yet. The drafter will use a standard proposal
                  structure; uploading the full RFP via{" "}
                  <span className="font-medium">Import a grant</span> gives better results.
                </p>
              ) : (
                <ol className="space-y-3">
                  {sections.map((s, i) => (
                    <RequirementItem key={s.key} section={s} index={i + 1} />
                  ))}
                </ol>
              )}
              {req && req.attachments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-neutral-800">Attachments</h4>
                  <ul className="space-y-1 text-sm">
                    {req.attachments.map((a) => (
                      <li key={a.name} className="flex items-start gap-2">
                        <Paperclip
                          className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400"
                          aria-hidden
                        />
                        <span>
                          <span className="font-medium text-neutral-800">{a.name}</span>
                          {a.required ? (
                            <span className="text-danger-600"> (required)</span>
                          ) : (
                            <span className="text-neutral-500"> (optional)</span>
                          )}
                          {a.description && (
                            <span className="text-neutral-500"> — {a.description}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {req?.submissionInstructions && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-neutral-800">How to submit</h4>
                  <PlainText text={req.submissionInstructions} />
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Your match and actions">
          <MatchPanel orgId={orgId} match={o.match} />
          {o.privateToOrgId && o.submissionEmail && (
            <SubmissionEmailCard
              orgId={orgId}
              opportunityId={o.id}
              email={o.submissionEmail}
              verified={o.submissionEmailVerified}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle>Start an application</CardTitle>
            </CardHeader>
            <CardBody>
              {o.match?.status === "drafting" || o.match?.status === "applied" ? (
                <div className="space-y-3">
                  <Alert tone="info">
                    {o.match.status === "applied"
                      ? "You've already applied to this grant."
                      : "An application for this grant is already in progress."}
                  </Alert>
                  <Link
                    to="/orgs/$orgId/applications"
                    params={{ orgId }}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Go to applications →
                  </Link>
                </div>
              ) : closed ? (
                <Alert tone="warning">This opportunity is closed to new applications.</Alert>
              ) : (
                <DraftApplicationForm
                  orgId={orgId}
                  opportunityId={o.id}
                  match={o.match}
                  projects={projects.data?.items ?? []}
                />
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RequirementItem({ section: s, index }: { section: RequirementSection; index: number }) {
  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-neutral-900">
          <span className="mr-1 text-neutral-500">{index}.</span>
          {s.title}
        </p>
        <div className="flex flex-wrap gap-1">
          {s.kind !== "narrative" && <Badge>{humanize(s.kind)}</Badge>}
          {!s.required && <Badge>Optional</Badge>}
          {s.wordLimit != null && (
            <Badge tone="info">{s.wordLimit.toLocaleString()} words max</Badge>
          )}
          {s.charLimit != null && (
            <Badge tone="info">{s.charLimit.toLocaleString()} characters max</Badge>
          )}
        </div>
      </div>
      {s.prompt && <PlainText text={s.prompt} className="mt-1 text-neutral-600" />}
      {s.guidance && (
        <p className="mt-2 text-xs text-neutral-500">
          <span className="font-medium">Reviewer guidance:</span> {s.guidance}
        </p>
      )}
    </li>
  );
}

const POLARITY: Record<
  MatchReason["polarity"],
  { icon: typeof CheckCircle2; cls: string; label: string }
> = {
  positive: { icon: CheckCircle2, cls: "text-success-600", label: "Strength" },
  negative: { icon: XCircle, cls: "text-danger-600", label: "Concern" },
  neutral: { icon: MinusCircle, cls: "text-neutral-400", label: "Note" },
};

function MatchPanel({ orgId, match }: { orgId: string; match: MatchDto | null }) {
  const update = useUpdateMatchStatus(orgId);
  const rescore = useRescoreMatches(orgId);

  if (!match) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your match</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-neutral-600">
            This grant hasn't been scored against your organization yet.
          </p>
          <Button variant="secondary" onClick={() => rescore.mutate()} loading={rescore.isPending}>
            {!rescore.isPending && <RefreshCw className="h-4 w-4" aria-hidden />}
            Score my fit
          </Button>
          {rescore.isSuccess && (
            <p className="text-sm text-success-700" role="status">
              Scoring started — check back in a minute.
            </p>
          )}
          <ApiErrorAlert error={rescore.error} title="Couldn't start scoring" />
        </CardBody>
      </Card>
    );
  }

  const shortlisted = match.status === "shortlisted";
  const dismissed = match.status === "dismissed";
  const locked = match.status === "drafting" || match.status === "applied";
  const setStatus = (status: MatchDto["status"]) => update.mutate({ matchId: match.id, status });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>Your match</CardTitle>
        <EligibilityBadge eligibility={match.eligibility} />
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-1">
          <FitMeter score={match.fitScore} className="flex-1" />
          <HelpTip term="fit_score" />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Metric
            label={
              <>
                Likelihood <HelpTip term="likelihood" />
              </>
            }
            value={formatPercent(match.likelihood)}
          />
          <Metric
            label={
              <>
                Expected value <HelpTip term="expected_value" />
              </>
            }
            value={formatCents(match.expectedValueCents)}
          />
          <Metric label="Suggested ask" value={formatCents(match.suggestedAskCents)} />
          <Metric
            label="Effort"
            value={
              match.effortHours != null ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />~
                  {Math.round(match.effortHours)} hrs
                </span>
              ) : (
                "—"
              )
            }
          />
        </dl>

        {match.reasons.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-neutral-800">Why</h4>
            <ul className="space-y-2">
              {match.reasons.map((r, i) => {
                const p = POLARITY[r.polarity] ?? POLARITY.neutral;
                const Icon = p.icon;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: reasons have no id and never reorder
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${p.cls}`} aria-hidden />
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
            </ul>
          </div>
        )}

        {!locked && (
          <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
            <Button
              variant={shortlisted ? "primary" : "secondary"}
              size="sm"
              aria-pressed={shortlisted}
              loading={update.isPending && update.variables?.status !== "dismissed"}
              onClick={() => setStatus(shortlisted ? "new" : "shortlisted")}
            >
              {shortlisted ? (
                <BookmarkCheck className="h-4 w-4" aria-hidden />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden />
              )}
              {shortlisted ? "Shortlisted" : "Shortlist"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={dismissed}
              loading={update.isPending && update.variables?.status === "dismissed"}
              onClick={() => setStatus(dismissed ? "new" : "dismissed")}
            >
              <EyeOff className="h-4 w-4" aria-hidden />
              {dismissed ? "Restore" : "Dismiss"}
            </Button>
          </div>
        )}
        <ApiErrorAlert error={update.error} title="Couldn't update this match" />
        {match.scoredAt && (
          <p className="text-xs text-neutral-500">Scored {formatDate(match.scoredAt)}</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Imported grants: emails read from a page/RFP are untrusted until a person confirms them. */
function SubmissionEmailCard({
  orgId,
  opportunityId,
  email,
  verified,
}: {
  orgId: string;
  opportunityId: string;
  email: string;
  verified: boolean;
}) {
  const confirm = useConfirmSubmissionEmail(orgId, opportunityId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Submission email</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <p className="break-all font-medium text-neutral-900">{email}</p>
        {verified ? (
          <p className="flex items-center gap-1.5 text-success-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Confirmed — applications can be emailed
            here.
          </p>
        ) : (
          <>
            <Alert tone="warning">
              We read this address from the imported page. Check it against the funder's official
              site before confirming — we won't email an application to it until you do.
            </Alert>
            <Button
              size="sm"
              variant="secondary"
              loading={confirm.isPending}
              onClick={() => confirm.mutate(email)}
            >
              Confirm this address
            </Button>
          </>
        )}
        <ApiErrorAlert
          error={confirm.error}
          title="Couldn't confirm the address"
          messages={{
            email_changed:
              "The submission email changed since you opened this page. Review the new address and confirm again.",
          }}
        />
      </CardBody>
    </Card>
  );
}

function Metric({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-neutral-900 tabular-nums">{value}</dd>
    </div>
  );
}

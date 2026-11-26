// OWNER: awards UI — one award: terms, the report schedule, and the report editor. Reports reuse
// the application claim rendering (numbered citations, verifier highlights), add a promised-vs-
// achieved table, and send unanswered metrics to a report check-in interview.
import { type CitationContext, ParagraphView } from "@client/components/application/claims";
import { paragraphsFromDrafts } from "@client/components/application/edit-model";
import { citationNumbers, paragraphText, verdictMap } from "@client/components/application/model";
import { GroundingCard } from "@client/components/application/summary-cards";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { useOrgId } from "@client/components/grants/queries";
import { HrefLink } from "@client/components/layout/href-link";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  PageHeader,
  SkeletonCard,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  toast,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type {
  AwardDetail,
  AwardReportDetail,
  AwardReportDto,
  ComparisonStatus,
  PromiseComparison,
  ReportContent,
} from "@shared/api/awards";
import type { DraftSection, Paragraph } from "@shared/content";
import { Link, useParams } from "@tanstack/react-router";
import { Download, MessagesSquare, Pencil, Send, Sparkles } from "lucide-react";
import * as React from "react";
import { dueLabel, REPORT_KIND_LABEL } from "./awards";
import {
  reportApi,
  useAward,
  useDraftReport,
  useReport,
  useSubmitReport,
  useUpdateAward,
  useUpdateReport,
} from "./queries";

const day = (d: string | null) => (d ? formatDate(`${d}T00:00:00Z`) : "—");

// ------------------------------------------------------------------------------- citations

/** Comparisons as claims so they share citation numbers and verdicts ("cmp.<goalId>"). */
function comparisonClaims(content: ReportContent): Paragraph {
  return {
    id: "cmp.p1",
    claims: content.comparisons
      .filter((c) => c.status !== "unknown" && c.achieved)
      .map((c) => ({
        id: `cmp.${c.goalId}`,
        text: c.achieved ?? "",
        kind: "factual" as const,
        factIds: c.factIds,
      })),
  };
}

export function reportCitationContext(orgId: string, report: AwardReportDetail): CitationContext {
  const content = report.versionContent ?? { sections: [], comparisons: [] };
  const numbers = citationNumbers({
    sections: [
      ...content.sections,
      { key: "cmp", title: "", paragraphs: [comparisonClaims(content)], gaps: [] },
    ],
  });
  return {
    orgId,
    numbers,
    facts: new Map(report.citedFacts.map((f) => [f.id, f])),
    verdicts: verdictMap(report.groundingReport),
  };
}

// ------------------------------------------------------------------------------- comparisons

const STATUS_INFO: Record<
  ComparisonStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  met: { label: "Met", tone: "success" },
  partially_met: { label: "Partly met", tone: "warning" },
  not_met: { label: "Not met", tone: "danger" },
  unknown: { label: "No result on file", tone: "neutral" },
};

export function PromisedVsAchievedTable({
  comparisons,
  ctx,
}: {
  comparisons: PromiseComparison[];
  ctx: CitationContext;
}) {
  if (comparisons.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No goals were found in the original application to compare against.
      </p>
    );
  }
  return (
    <Table aria-label="Promised vs. achieved">
      <thead>
        <tr>
          <Th>Promised in the application</Th>
          <Th>Achieved this period</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {comparisons.map((c) => {
          const info = STATUS_INFO[c.status];
          return (
            <tr key={c.goalId} data-goal={c.goalId} className="align-top">
              <Td className="max-w-xs text-neutral-700">{c.promised}</Td>
              <Td className="max-w-sm">
                {c.achieved ? (
                  <ParagraphView
                    paragraph={{
                      id: `cmp.${c.goalId}.p`,
                      claims: [
                        {
                          id: `cmp.${c.goalId}`,
                          text: c.achieved,
                          kind: "factual",
                          factIds: c.factIds,
                        },
                      ],
                    }}
                    ctx={ctx}
                  />
                ) : (
                  <span className="text-sm italic text-neutral-500">
                    No fact dated in this period shows the result yet.
                  </span>
                )}
              </Td>
              <Td>
                <Badge tone={info.tone}>{info.label}</Badge>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

// ------------------------------------------------------------------------------- gaps

export function ReportGaps({
  orgId,
  report,
}: {
  orgId: string;
  report: Pick<AwardReportDetail, "gaps" | "checkinInterview">;
}) {
  if (report.gaps.length === 0) return null;
  const interview = report.checkinInterview;
  return (
    <Alert
      tone="warning"
      title={`${report.gaps.length} question${report.gaps.length === 1 ? "" : "s"} only your team can answer`}
      action={
        interview && interview.status === "active" ? (
          <Link
            to="/orgs/$orgId/interviews/$interviewId"
            params={{ orgId, interviewId: interview.id }}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <MessagesSquare aria-hidden /> Answer in a check-in
          </Link>
        ) : undefined
      }
    >
      <p>
        The report leaves these blank rather than guess. Answer them in the report check-in, then
        re-draft: new facts from the check-in count for this period.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {report.gaps.map((g) => (
          <li key={`${g.sectionKey}:${g.question}`}>{g.question}</li>
        ))}
      </ul>
    </Alert>
  );
}

// ------------------------------------------------------------------------------- sections

function ReportSectionCard({
  section,
  ctx,
  canEdit,
  onSave,
  saving,
}: {
  section: DraftSection;
  ctx: CitationContext;
  canEdit: boolean;
  onSave: (paragraphs: Paragraph[]) => Promise<unknown>;
  saving: boolean;
}) {
  const [drafts, setDrafts] = React.useState<string[] | null>(null);
  const headingId = `report-section-${section.key}`;
  return (
    <Card>
      <CardHeader>
        <h3 id={headingId} className="text-base font-semibold text-neutral-900">
          {section.title}
        </h3>
        {canEdit && !drafts && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${section.title}`}
            onClick={() => setDrafts(section.paragraphs.map(paragraphText))}
          >
            <Pencil aria-hidden /> Edit
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {drafts ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const paragraphs = paragraphsFromDrafts(section.paragraphs, drafts, section.key);
              void onSave(paragraphs).then(() => setDrafts(null));
            }}
          >
            {drafts.map((text, i) => (
              <Field
                key={section.paragraphs[i]?.id ?? `${headingId}-new`}
                label={`Paragraph ${i + 1}`}
                htmlFor={`${headingId}-p${i}`}
              >
                <Textarea
                  id={`${headingId}-p${i}`}
                  rows={4}
                  value={text}
                  onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? e.target.value : d)))}
                />
              </Field>
            ))}
            <p className="text-xs text-neutral-500">
              Saving re-runs the fact-check. New sentences with numbers need a citation.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDrafts(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : section.paragraphs.length ? (
          section.paragraphs.map((p) => <ParagraphView key={p.id} paragraph={p} ctx={ctx} />)
        ) : (
          <p className="text-sm italic text-neutral-500">Nothing drafted yet for this section.</p>
        )}
      </CardBody>
    </Card>
  );
}

export function ReportSections({
  report,
  ctx,
  canEdit,
  onSaveSection,
  saving = false,
}: {
  report: AwardReportDetail;
  ctx: CitationContext;
  canEdit: boolean;
  onSaveSection: (key: string, paragraphs: Paragraph[]) => Promise<unknown>;
  saving?: boolean;
}) {
  const sections = report.versionContent?.sections ?? [];
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <ReportSectionCard
          key={s.key}
          section={s}
          ctx={ctx}
          canEdit={canEdit}
          saving={saving}
          onSave={(paragraphs) => onSaveSection(s.key, paragraphs)}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------- report panel

function SubmitDialog({
  open,
  onClose,
  onSubmit,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (ref: string) => void;
  saving: boolean;
}) {
  const [ref, setRef] = React.useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark report as submitted"
      description="Record how you sent it. Pending reminders for this report stop."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => onSubmit(ref)}>
            Mark submitted
          </Button>
        </>
      }
    >
      <Field
        label="Reference (optional)"
        htmlFor="report-ref"
        hint="Portal confirmation number, email subject…"
      >
        <Input id="report-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function ReportPanel({
  orgId,
  awardId,
  reportId,
}: {
  orgId: string;
  awardId: string;
  reportId: string;
}) {
  const q = useReport(orgId, awardId, reportId);
  const draft = useDraftReport(orgId, awardId, reportId);
  const update = useUpdateReport(orgId, awardId, reportId);
  const submit = useSubmitReport(orgId, awardId, reportId);
  const [submitOpen, setSubmitOpen] = React.useState(false);
  if (q.isError) return <ApiErrorAlert error={q.error} />;
  if (!q.data) return <SkeletonCard />;
  const report = q.data;
  const ctx = reportCitationContext(orgId, report);
  const submitted = report.status === "submitted";
  const due = dueLabel(report.dueAt);
  return (
    <section aria-labelledby="report-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="report-heading" className="text-lg font-semibold text-neutral-900">
            {REPORT_KIND_LABEL[report.kind]}
          </h2>
          <p className="text-sm text-neutral-500">
            Period {day(report.periodStart)} – {day(report.periodEnd)} · due{" "}
            {formatDate(report.dueAt)} {!submitted && <Badge tone={due.tone}>{due.text}</Badge>}
          </p>
          {submitted && (
            <p className="text-sm text-success-700">
              Submitted {formatDate(report.submittedAt)}
              {report.submittedRef ? ` · ${report.submittedRef}` : ""}
            </p>
          )}
        </div>
        {!submitted && (
          <div className="flex flex-wrap gap-2">
            <Button
              loading={draft.isPending}
              onClick={() =>
                draft.mutate(undefined, {
                  onSuccess: () => toast({ title: "Report drafted", tone: "success" }),
                })
              }
            >
              <Sparkles aria-hidden /> {report.versionContent ? "Re-draft" : "Draft report"}
            </Button>
            {report.versionContent && (
              <a
                href={reportApi(orgId, awardId, reportId, "/export?format=docx")}
                className={buttonClass({ variant: "secondary" })}
                download
              >
                <Download aria-hidden /> Word
              </a>
            )}
            <Button variant="outline" onClick={() => setSubmitOpen(true)}>
              <Send aria-hidden /> Mark submitted
            </Button>
          </div>
        )}
      </div>
      {draft.isError && <ApiErrorAlert error={draft.error} />}
      {update.isError && <ApiErrorAlert error={update.error} />}
      {!report.versionContent ? (
        <Alert tone="info" title="Not drafted yet">
          The draft uses outcome and metric facts dated in this period, compares them with what the
          application promised, and leaves anything unknown as a question for your team.
        </Alert>
      ) : (
        <>
          <ReportGaps orgId={orgId} report={report} />
          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Promised vs. achieved
                  </h3>
                </CardHeader>
                <CardBody>
                  <PromisedVsAchievedTable
                    comparisons={report.versionContent.comparisons}
                    ctx={ctx}
                  />
                </CardBody>
              </Card>
              <ReportSections
                report={report}
                ctx={ctx}
                canEdit={!submitted}
                saving={update.isPending}
                onSaveSection={(key, paragraphs) =>
                  update.mutateAsync({ section: { key, paragraphs } })
                }
              />
            </div>
            <GroundingCard report={report.groundingReport} />
          </div>
        </>
      )}
      <SubmitDialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        saving={submit.isPending}
        onSubmit={(ref) =>
          submit.mutate(ref, {
            onSuccess: () => {
              setSubmitOpen(false);
              toast({ title: "Report marked as submitted", tone: "success" });
            },
          })
        }
      />
    </section>
  );
}

// ------------------------------------------------------------------------------- terms + schedule

function TermsCard({ orgId, award }: { orgId: string; award: AwardDetail }) {
  const update = useUpdateAward(orgId, award.id);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    startDate: award.startDate ?? "",
    endDate: award.endDate ?? "",
    grantNumber: award.grantNumber ?? "",
    termsNotes: award.termsNotes,
  });
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-neutral-900">Terms</h2>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        )}
      </CardHeader>
      <CardBody>
        {editing ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(
                {
                  startDate: form.startDate || null,
                  endDate: form.endDate || null,
                  grantNumber: form.grantNumber.trim() || null,
                  termsNotes: form.termsNotes,
                },
                { onSuccess: () => setEditing(false) },
              );
            }}
          >
            <Field label="Grant start" htmlFor="award-start">
              <Input
                id="award-start"
                type="date"
                value={form.startDate}
                onChange={set("startDate")}
              />
            </Field>
            <Field label="Grant end" htmlFor="award-end">
              <Input id="award-end" type="date" value={form.endDate} onChange={set("endDate")} />
            </Field>
            <Field label="Grant number" htmlFor="award-number" className="sm:col-span-2">
              <Input id="award-number" value={form.grantNumber} onChange={set("grantNumber")} />
            </Field>
            <Field
              label="Terms and reporting requirements"
              htmlFor="award-terms"
              className="sm:col-span-2"
            >
              <Textarea
                id="award-terms"
                rows={4}
                value={form.termsNotes}
                onChange={set("termsNotes")}
              />
            </Field>
            {update.isError && (
              <div className="sm:col-span-2">
                <ApiErrorAlert error={update.error} />
              </div>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" loading={update.isPending}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Funder</dt>
              <dd className="font-medium text-neutral-900">{award.funderName}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Amount</dt>
              <dd className="font-medium tabular-nums text-neutral-900">
                {formatCents(award.amountCents)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Grant period</dt>
              <dd className="text-neutral-900">
                {award.startDate && award.endDate
                  ? `${day(award.startDate)} – ${day(award.endDate)}`
                  : "Not set: add it to schedule reports"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Grant number</dt>
              <dd className="text-neutral-900">{award.grantNumber ?? "—"}</dd>
            </div>
            {award.termsNotes && (
              <div className="sm:col-span-2">
                <dt className="text-neutral-500">Terms</dt>
                <dd className="whitespace-pre-wrap text-neutral-900">{award.termsNotes}</dd>
              </div>
            )}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

export function ReportSchedule({
  reports,
  selectedId,
  onSelect,
}: {
  reports: AwardReportDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No reports scheduled. Add the grant period above.</p>
    );
  }
  return (
    <Table aria-label="Report schedule">
      <thead>
        <tr>
          <Th>Report</Th>
          <Th>Period</Th>
          <Th>Due</Th>
          <Th>Status</Th>
          <Th>
            <span className="sr-only">Open</span>
          </Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {reports.map((r) => (
          <tr key={r.id} className={cn(r.id === selectedId && "bg-brand-50/60")}>
            <Td className="font-medium text-neutral-900">{REPORT_KIND_LABEL[r.kind]}</Td>
            <Td className="text-sm text-neutral-600">
              {day(r.periodStart)} – {day(r.periodEnd)}
            </Td>
            <Td className="text-sm">{formatDate(r.dueAt)}</Td>
            <Td>
              <StatusBadge status={r.status} />
            </Td>
            <Td className="text-right">
              <Button
                variant={r.id === selectedId ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={r.id === selectedId}
                onClick={() => onSelect(r.id)}
              >
                {r.id === selectedId ? "Open" : "View"}
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function AwardDetailPage() {
  const orgId = useOrgId();
  const { awardId = "" } = useParams({ strict: false }) as { awardId?: string };
  const q = useAward(orgId, awardId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const award = q.data;
  const reportId =
    selected ??
    award?.reports.find((r) => r.status !== "submitted")?.id ??
    award?.reports[0]?.id ??
    null;
  if (q.isError) return <ApiErrorAlert error={q.error} />;
  if (!award) return <SkeletonCard />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<HrefLink href={`/orgs/${encodeURIComponent(orgId)}/awards`}>Awards</HrefLink>}
        title={award.title}
        description={`${award.funderName} · ${formatCents(award.amountCents)}`}
        actions={
          award.application ? (
            <Link
              to="/orgs/$orgId/applications/$applicationId"
              params={{ orgId, applicationId: award.application.id }}
              className={buttonClass({ variant: "secondary" })}
            >
              Original application
            </Link>
          ) : undefined
        }
      />
      <TermsCard key={award.updatedAt} orgId={orgId} award={award} />
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-neutral-900">Report schedule</h2>
        </CardHeader>
        <CardBody>
          <ReportSchedule reports={award.reports} selectedId={reportId} onSelect={setSelected} />
        </CardBody>
      </Card>
      {reportId && (
        <ReportPanel key={reportId} orgId={orgId} awardId={award.id} reportId={reportId} />
      )}
    </div>
  );
}

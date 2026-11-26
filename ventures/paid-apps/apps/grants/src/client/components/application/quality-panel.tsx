// Funder rubric score for the current draft: per-criterion meters, strengths, gaps and
// suggestions. Restructure / emphasize / clarify suggestions can be selected and applied (a grounded
// redraft of that section, fact-checked again); missing-evidence suggestions are questions for the
// team and open a gap-fill interview instead. Advisory only: it never blocks submission.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { Alert, Badge, Button, Checkbox, Meter, Skeleton, toast } from "@client/components/ui";
import type {
  CriterionScore,
  QualityReportDto,
  QualitySuggestion,
  QualitySuggestionKind,
  SectionQuality,
} from "@shared/quality";
import { Gauge, MessagesSquare, Wand2 } from "lucide-react";
import * as React from "react";
import { useApplyQuality, useQualityInterview, useQualityReport } from "./quality-queries";

export const SUGGESTION_KIND_LABEL: Record<QualitySuggestionKind, string> = {
  restructure: "Restructure",
  emphasize: "Emphasize",
  clarify: "Clarify",
  missing_evidence: "Missing evidence",
};

const score = (n: number | null, max: number) => (n === null ? "—" : `${n.toFixed(1)} / ${max}`);

export function QualityPanel({
  orgId,
  applicationId,
  currentVersionId,
  canEdit,
}: {
  orgId: string;
  applicationId: string;
  currentVersionId: string | null;
  canEdit: boolean;
}) {
  const q = useQualityReport(orgId, applicationId, currentVersionId);
  return (
    <section
      aria-labelledby="quality-heading"
      className="rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
        <h2
          id="quality-heading"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900"
        >
          <Gauge className="h-4 w-4 text-neutral-500" aria-hidden /> Funder rubric score
        </h2>
        <Badge tone="neutral">Advisory · never blocks submission</Badge>
      </div>
      <div className="space-y-4 px-5 py-4">
        {!currentVersionId ? (
          <p className="text-sm text-neutral-500">
            Scores appear once the first draft has been fact-checked.
          </p>
        ) : q.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : q.error ? (
          <ApiErrorAlert error={q.error} title="Couldn't load the rubric score" />
        ) : !q.data ? (
          <p className="text-sm text-neutral-500" role="status">
            Scoring this draft against the funder's criteria… This can take a minute.
          </p>
        ) : (
          <QualityReportView
            key={q.data.versionId}
            data={q.data}
            orgId={orgId}
            applicationId={applicationId}
            canEdit={canEdit}
          />
        )}
      </div>
    </section>
  );
}

export function QualityReportView({
  data,
  orgId,
  applicationId,
  canEdit,
}: {
  data: QualityReportDto;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const { report } = data;
  return (
    <div className="space-y-5">
      <Meter
        label="Overall (weighted by the funder's criteria)"
        value={report.overallScore ?? 0}
        max={report.maxScore}
        valueText={score(report.overallScore, report.maxScore)}
      />
      {!data.current && (
        <Alert tone="info" title="Scored an earlier version">
          The current draft is being scored. Suggestions can be applied once it is.
        </Alert>
      )}
      {report.droppedSuggestions > 0 && (
        <p className="text-xs text-neutral-500">
          {report.droppedSuggestions} suggestion
          {report.droppedSuggestions === 1 ? " was" : "s were"} left out because{" "}
          {report.droppedSuggestions === 1 ? "it" : "they"} relied on facts or figures that aren't
          in your fact base.
        </p>
      )}
      {report.sections.map((s) => (
        <SectionQualityView
          key={s.sectionKey}
          section={s}
          max={report.maxScore}
          orgId={orgId}
          applicationId={applicationId}
          canEdit={canEdit && data.current}
        />
      ))}
    </div>
  );
}

function SectionQualityView({
  section,
  max,
  orgId,
  applicationId,
  canEdit,
}: {
  section: SectionQuality;
  max: number;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const apply = useApplyQuality(orgId, applicationId);
  const headingId = React.useId();
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const applicable = section.criteria.some((c) =>
    c.suggestions.some((s) => s.kind !== "missing_evidence"),
  );

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-neutral-200 p-4"
      data-section-key={section.sectionKey}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-semibold text-neutral-900">
          {section.title}
        </h3>
        <span className="text-sm font-medium tabular-nums text-neutral-700">
          {score(section.score, max)}
        </span>
      </div>
      {section.status === "failed" && (
        <p className="text-sm text-neutral-500">This section couldn't be scored this time.</p>
      )}
      {section.status === "skipped" && (
        <p className="text-sm text-neutral-500">Attachments aren't scored.</p>
      )}
      {section.criteria.map((c) => (
        <CriterionView
          key={c.criterion}
          criterion={c}
          max={max}
          selected={selected}
          onToggle={toggle}
          orgId={orgId}
          applicationId={applicationId}
          canEdit={canEdit}
        />
      ))}
      {canEdit && applicable && (
        <div className="space-y-2 border-t border-neutral-100 pt-3">
          <ApiErrorAlert error={apply.error} title="Couldn't apply the suggestions" />
          <Button
            size="sm"
            disabled={selected.size === 0}
            loading={apply.isPending}
            onClick={() =>
              apply.mutate(
                { sectionKey: section.sectionKey, suggestionIds: [...selected] },
                {
                  onSuccess: () => {
                    setSelected(new Set());
                    toast.success("Redrafted with your chosen suggestions and fact-checked again");
                  },
                },
              )
            }
          >
            <Wand2 aria-hidden /> Apply selected suggestions
          </Button>
          <p className="text-xs text-neutral-500">
            The drafter revises this section using only your facts; every claim is checked again.
          </p>
        </div>
      )}
    </section>
  );
}

function CriterionView({
  criterion: c,
  max,
  selected,
  onToggle,
  orgId,
  applicationId,
  canEdit,
}: {
  criterion: CriterionScore;
  max: number;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-2" data-criterion={c.criterion}>
      <Meter
        label={c.criterion}
        value={c.score}
        max={max}
        valueText={`${c.score} / ${max}`}
        size="sm"
      />
      {c.rationale && <p className="text-sm text-neutral-700">{c.rationale}</p>}
      {(c.strengths.length > 0 || c.gaps.length > 0) && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {c.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-success-700">
                Strengths
              </p>
              <ul className="ml-4 list-disc text-neutral-700">
                {c.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {c.gaps.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-warning-700">Gaps</p>
              <ul className="ml-4 list-disc text-neutral-700">
                {c.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {c.suggestions.length > 0 && (
        <ul className="space-y-1.5" aria-label={`Suggestions for ${c.criterion}`}>
          {c.suggestions.map((s) => (
            <SuggestionItem
              key={s.id}
              suggestion={s}
              checked={selected.has(s.id)}
              onToggle={onToggle}
              orgId={orgId}
              applicationId={applicationId}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionItem({
  suggestion: s,
  checked,
  onToggle,
  orgId,
  applicationId,
  canEdit,
}: {
  suggestion: QualitySuggestion;
  checked: boolean;
  onToggle: (id: string, on: boolean) => void;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const id = React.useId();
  const interview = useQualityInterview(orgId, applicationId);
  const facts = s.factIds.length
    ? ` · uses ${s.factIds.length} fact${s.factIds.length === 1 ? "" : "s"}`
    : "";
  const label = (
    <>
      <Badge tone={s.kind === "missing_evidence" ? "warning" : "brand"}>
        {SUGGESTION_KIND_LABEL[s.kind]}
      </Badge>{" "}
      <span className="text-neutral-800">{s.text}</span>
      <span className="text-xs text-neutral-500">{facts}</span>
    </>
  );
  if (s.kind === "missing_evidence") {
    return (
      <li className="rounded-md bg-warning-50/60 px-2.5 py-2 text-sm" data-suggestion-id={s.id}>
        <p>{label}</p>
        <p className="mt-1 text-xs text-neutral-600">
          No fact on file covers this, so it can't be drafted. Answer it and the drafter can use it.
        </p>
        {canEdit && (
          <Button
            size="xs"
            variant="outline"
            className="mt-1.5"
            loading={interview.isPending}
            onClick={() => interview.mutate([s.id])}
          >
            <MessagesSquare aria-hidden /> Answer in an interview
          </Button>
        )}
        <ApiErrorAlert error={interview.error} title="Couldn't start the interview" />
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 text-sm" data-suggestion-id={s.id}>
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={!canEdit}
        onChange={(e) => onToggle(s.id, e.target.checked)}
      />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </li>
  );
}

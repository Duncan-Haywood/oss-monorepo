import type { AffirmationsResponse } from "@shared/affirmation";
import type { QualityChecklistResponse } from "@shared/quality";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { OrgInfo, ScoreResponse } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, STATUS_LABEL } from "../ui";
import { DeadlineList } from "./Affirmations";

export function Dashboard({
  orgId,
  info,
  onOpenControls,
  onOpenAffirmations,
  onOpenQuality,
}: {
  orgId: string;
  info: OrgInfo;
  onOpenControls: () => void;
  onOpenAffirmations: () => void;
  onOpenQuality: () => void;
}) {
  const level = info.profile.targetLevel === 1 ? 1 : 2;
  const score = useQuery({
    queryKey: ["score", orgId, level],
    queryFn: () => api<ScoreResponse>(`/api/orgs/${orgId}/score?level=${level}`),
  });
  const affirmations = useQuery({
    queryKey: ["affirmations", orgId],
    queryFn: () => api<AffirmationsResponse>(`/api/orgs/${orgId}/affirmations`),
  });
  // Only fetched on the plan that records ISO 9001; other plans get a one-line pointer.
  const quality = useQuery({
    queryKey: ["quality", orgId],
    queryFn: () => api<QualityChecklistResponse>(`/api/orgs/${orgId}/quality`),
    enabled: info.plan.quality,
  });
  // The target level's record, or the other level's when only that one is recorded.
  const recorded = affirmations.data?.schedules.filter((s) => s.last) ?? [];
  const schedule = recorded.find((s) => s.level === level) ?? recorded[0];
  const v = info.library.verification;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        {info.org.name} · Level {level} self-assessment
      </h1>
      {!v.verifiedAgainstOfficialText && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The requirement text in this workspace was transcribed from NIST/DoD public-domain sources
          on {v.transcribedOn} and has not yet been proofread against the official publications.
          Check the wording against NIST SP 800-171 Rev. 2 / SP 800-171A before you rely on it.
        </p>
      )}
      <ErrorText error={score.error} />
      {score.data?.level2 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="SPRS score (self-assessed)">
            {score.data.level2.score === null ? (
              <p className="text-sm text-stone-700">
                No score yet: mark <strong>CA.L2-3.12.4 (system security plan)</strong> implemented.
                The DoD Assessment Methodology produces no score without an SSP. Working figure:{" "}
                {score.data.level2.provisionalScore}.
              </p>
            ) : (
              <p className="text-4xl font-semibold text-brand-700">
                {score.data.level2.score}
                <span className="text-base font-normal text-stone-500"> / 110</span>
              </p>
            )}
            <p className="mt-2 text-xs text-stone-500">
              Range 110 to {score.data.level2.minScore}. {score.data.level2.unassessed}{" "}
              requirement(s) not yet assessed are counted as not implemented.
            </p>
          </Card>
          <Card title="Status">
            <ul className="space-y-1 text-sm">
              {Object.entries(score.data.level2.counts).map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{STATUS_LABEL[k as keyof typeof STATUS_LABEL]}</span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="POA&M rules (32 CFR 170.21)">
            {score.data.conditional?.allMet ? (
              <p className="text-sm text-emerald-800">All 110 requirements are recorded as met.</p>
            ) : score.data.conditional?.meetsPoamRules ? (
              <p className="text-sm text-emerald-800">
                Your open gaps are all of a kind that may be on a POA&M and the score is at least
                88.
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-sm text-stone-700">
                {score.data.conditional?.blockers.slice(0, 6).map((b) => (
                  <li key={b.nistId + b.reason}>
                    {b.nistId === "*" ? "" : `${b.nistId}: `}
                    {b.reason}
                  </li>
                ))}
                {(score.data.conditional?.blockers.length ?? 0) > 6 && (
                  <li>…and {(score.data.conditional?.blockers.length ?? 0) - 6} more</li>
                )}
              </ul>
            )}
            <p className="mt-2 text-xs text-stone-500">
              A planning check only. Your affirming official makes the self-assessment and
              affirmation in SPRS.
            </p>
          </Card>
        </div>
      )}
      {score.data?.level1 && (
        <Card title="Level 1 requirements met">
          <p className="text-4xl font-semibold text-brand-700">
            {score.data.level1.met}
            <span className="text-base font-normal text-stone-500">
              {" "}
              / {score.data.level1.total}
            </span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Level 1 has no points and no POA&M: every requirement must be met.
          </p>
        </Card>
      )}
      <Card
        title="SPRS affirmation (32 CFR 170.22)"
        actions={
          <button type="button" className={btnGhostCls} onClick={onOpenAffirmations}>
            {schedule?.last ? "Affirmations" : "Record one"}
          </button>
        }
      >
        {schedule?.last ? (
          <>
            <p className="mb-2 text-sm text-stone-700">
              Level {schedule.level}: last affirmed in SPRS on {schedule.last.affirmedOn}.
            </p>
            <DeadlineList schedule={schedule} />
          </>
        ) : (
          <p className="text-sm text-stone-600">
            No affirmation recorded for Level {level}. After your self-assessment, your affirming
            official affirms in SPRS, then again every year; record each one here and this card
            shows when the next is due.
          </p>
        )}
      </Card>
      <IsoCard info={info} data={quality.data} error={quality.error} onOpen={onOpenQuality} />
      <button type="button" className={btnCls} onClick={onOpenControls}>
        Work through the controls
      </button>
    </div>
  );
}

/** ISO 9001 progress beside the CMMC figures: the same shops often need both. */
function IsoCard({
  info,
  data,
  error,
  onOpen,
}: {
  info: OrgInfo;
  data: QualityChecklistResponse | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const r = data?.readiness;
  return (
    <Card
      title="ISO 9001:2015 self-check"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          {info.plan.quality ? "Open checklist" : "Read the clauses"}
        </button>
      }
    >
      {!info.plan.quality ? (
        <p className="text-sm text-stone-600">
          The clause checklist reuses your CMMC evidence (a training record counts for 7.2 too).
          Every plan can read it; recording status and owners needs the Level 2 + Quality plan.
        </p>
      ) : (
        <>
          <ErrorText error={error} />
          {!r && !error && <p className="text-sm text-stone-600">Loading…</p>}
          {r && r.percentInPlace === null && (
            <p className="text-sm text-stone-600">
              No clause assessed yet. Start with 4.3 (scope) and 7.5 (documented information).
            </p>
          )}
          {r && r.percentInPlace !== null && (
            <>
              <p className="text-4xl font-semibold text-brand-700">
                {r.percentInPlace}%
                <span className="text-base font-normal text-stone-500">
                  {" "}
                  of applicable clauses in place
                </span>
              </p>
              <p className="mt-2 text-sm text-stone-700">
                {r.gaps} gap{r.gaps === 1 ? "" : "s"}, {r.partial} partly in place, {r.notAssessed}{" "}
                not assessed.
              </p>
              {r.openWithoutOwner.length > 0 && (
                <p className="mt-1 text-sm text-amber-800">
                  {r.openWithoutOwner.length} open clause
                  {r.openWithoutOwner.length === 1 ? " has" : "s have"} no owner:{" "}
                  {r.openWithoutOwner.slice(0, 8).join(", ")}
                  {r.openWithoutOwner.length > 8 ? "…" : ""}.
                </p>
              )}
              {r.inPlaceWithoutEvidence.length > 0 && (
                <p className="mt-1 text-sm text-amber-800">
                  In place with no evidence file: {r.inPlaceWithoutEvidence.join(", ")}.
                </p>
              )}
            </>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Your own check before a registrar's audit. Only an accredited certification body
            certifies.
          </p>
        </>
      )}
    </Card>
  );
}

import { type AffirmationsResponse, addDays } from "@shared/affirmation";
import type { CalibrationCheck, GaugeDue } from "@shared/calibration";
import { fmtDuration, type IncidentAttention } from "@shared/incidents";
import {
  AUDIT_WARNING_DAYS,
  CA_WARNING_DAYS,
  type QualityAttention,
} from "@shared/internal-audits";
import { TRAINING_DUE_SOON_DAYS, TRAINING_INFO, type TrainingAttention } from "@shared/personnel";
import type { QualityChecklistResponse } from "@shared/quality";
import type { ReviewState } from "@shared/security-policies";
import { SUPPLIER_DUE_SOON_DAYS, type SupplierAttention } from "@shared/suppliers";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ObjectiveConflictView, OrgInfo, ScoreResponse } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, STATUS_LABEL } from "../ui";
import { DeadlineList } from "./Affirmations";

export function Dashboard({
  orgId,
  info,
  onOpenControls,
  onOpenAffirmations,
  onOpenQuality,
  onOpenPolicies,
  onOpenPeople,
  onOpenSuppliers,
  onOpenIncidents,
  onOpenDocuments,
  onOpenAudits,
  onOpenGauges,
}: {
  orgId: string;
  info: OrgInfo;
  onOpenControls: () => void;
  onOpenAffirmations: () => void;
  onOpenQuality: () => void;
  onOpenPolicies: () => void;
  onOpenPeople: () => void;
  onOpenSuppliers: () => void;
  onOpenIncidents: () => void;
  onOpenDocuments: () => void;
  onOpenAudits: () => void;
  onOpenGauges: () => void;
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
  // Policies are a Level 2 record (NIST SP 800-171); Level 1 orgs get no card.
  const policies = useQuery({
    queryKey: ["policies", orgId],
    queryFn: () => api<PolicyCounts>(`/api/orgs/${orgId}/policies`),
    enabled: level === 2,
  });
  // Training is a Level 2 record too (AT.L2-3.2.1 to 3.2.3).
  const people = useQuery({
    queryKey: ["people", orgId],
    queryFn: () => api<TrainingSummary>(`/api/orgs/${orgId}/people`),
    enabled: level === 2,
  });
  // Incidents are recorded on every plan: the 72-hour clock is not a paid feature.
  const incidents = useQuery({
    queryKey: ["incidents", orgId],
    queryFn: () => api<IncidentSummary>(`/api/orgs/${orgId}/incidents`),
    refetchInterval: 60_000,
  });
  // Suppliers are recorded on every plan (FCI-only Level 1 flow-down included).
  const suppliers = useQuery({
    queryKey: ["suppliers", orgId],
    queryFn: () => api<SupplierSummary>(`/api/orgs/${orgId}/suppliers`),
  });
  // Document reviews, audits and corrective actions are recorded on the quality plan only.
  const documents = useQuery({
    queryKey: ["documents", orgId],
    queryFn: () => api<DocumentReviewSummary>(`/api/orgs/${orgId}/documents`),
    enabled: info.plan.quality,
  });
  const audits = useQuery({
    queryKey: ["audits", orgId],
    queryFn: () => api<AuditSummary>(`/api/orgs/${orgId}/audits`),
    enabled: info.plan.quality,
  });
  // Gauge calibration (ISO 9001 7.1.5) is recorded on the quality plan only, like the dates above.
  const gauges = useQuery({
    queryKey: ["gauges", orgId],
    queryFn: () => api<GaugeSummary>(`/api/orgs/${orgId}/gauges`),
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
      <ObjectiveConflicts
        conflicts={
          score.data?.level2?.objectiveConflicts ?? score.data?.level1?.objectiveConflicts ?? []
        }
      />
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
      {level === 2 && (
        <PoliciesCard data={policies.data} error={policies.error} onOpen={onOpenPolicies} />
      )}
      {level === 2 && (
        <TrainingCard data={people.data} error={people.error} onOpen={onOpenPeople} />
      )}
      <IncidentsCard data={incidents.data} error={incidents.error} onOpen={onOpenIncidents} />
      <SuppliersCard data={suppliers.data} error={suppliers.error} onOpen={onOpenSuppliers} />
      <IsoCard info={info} data={quality.data} error={quality.error} onOpen={onOpenQuality} />
      {info.plan.quality && (
        <QualityDatesCard
          orgId={orgId}
          documents={documents.data}
          audits={audits.data}
          error={documents.error ?? audits.error}
          onOpenDocuments={onOpenDocuments}
          onOpenAudits={onOpenAudits}
        />
      )}
      {info.plan.quality && (
        <CalibrationCard
          orgId={orgId}
          data={gauges.data}
          error={gauges.error}
          onOpen={onOpenGauges}
        />
      )}
      <button type="button" className={btnCls} onClick={onOpenControls}>
        Work through the controls
      </button>
    </div>
  );
}

/** The slice of GET /policies the dashboard reads (services/security-policies, PolicyList). */
interface PolicyCounts {
  items: {
    family: string;
    name: string;
    policy: { reviewDue: string | null } | null;
    review: ReviewState;
  }[];
  counts: { total: number; written: number; inForce: number; dueSoon: number; overdue: number };
}

/** Written security policies and their reviews: what is overdue first, then what falls due soon. */
export function PoliciesCard({
  data,
  error,
  onOpen,
}: {
  data: PolicyCounts | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const c = data?.counts;
  const late = (data?.items ?? [])
    .filter((i) => (i.review === "overdue" || i.review === "due_soon") && i.policy?.reviewDue)
    .sort((a, b) => (a.policy?.reviewDue ?? "").localeCompare(b.policy?.reviewDue ?? ""));
  return (
    <Card
      title="Security policies"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          {c && c.written > 0 ? "Policies" : "Write one"}
        </button>
      }
    >
      <ErrorText error={error} />
      {!c && !error && <p className="text-sm text-stone-600">Loading…</p>}
      {c && c.written === 0 && (
        <p className="text-sm text-stone-600">
          No policy written yet. Each NIST SP 800-171 family starts from a template with its
          requirements in their official wording and your accepted implementation statements as
          procedures.
        </p>
      )}
      {c && c.written > 0 && (
        <>
          <p className="text-4xl font-semibold text-brand-700">
            {c.inForce}
            <span className="text-base font-normal text-stone-500">
              {" "}
              / {c.total} families with an approved policy
            </span>
          </p>
          {c.written > c.inForce && (
            <p className="mt-2 text-sm text-stone-700">
              {c.written - c.inForce} more in draft, not yet approved.
            </p>
          )}
          {late.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {late.map((i) => (
                <li
                  key={i.family}
                  className={i.review === "overdue" ? "text-red-800" : "text-amber-800"}
                >
                  {i.name} ({i.family}): review {i.review === "overdue" ? "was due" : "due"}{" "}
                  {i.policy?.reviewDue}
                </li>
              ))}
            </ul>
          ) : (
            c.inForce > 0 && (
              <p className="mt-2 text-sm text-emerald-800">
                No review overdue or due within 60 days.
              </p>
            )
          )}
        </>
      )}
    </Card>
  );
}

/** The slice of GET /incidents the dashboard reads (services/incidents, incidentList). */
interface IncidentSummary {
  now: string;
  items: { id: string; closedOn: string | null }[];
  attention: IncidentAttention[];
}

const incidentText = (a: IncidentAttention, now: string) => {
  if (a.stage !== "report") return `${a.title}: give the report number to your higher tier`;
  if (!a.due) return a.title;
  const left = Date.parse(a.due) - Date.parse(now);
  return a.overdue
    ? `${a.title}: 72 hours ran out ${fmtDuration(-left)} ago, report now`
    : `${a.title}: report to DIBNet within ${fmtDuration(left)}`;
};

/** Incidents that need someone now: a 72-hour report not yet filed, or a sub's higher tier untold. */
export function IncidentsCard({
  data,
  error,
  onOpen,
}: {
  data: IncidentSummary | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const open = data?.items.filter((i) => !i.closedOn).length ?? 0;
  return (
    <Card
      title="Cyber incidents (DFARS 252.204-7012)"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          {data && data.items.length > 0 ? "Incidents" : "Record an incident"}
        </button>
      }
    >
      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-stone-600">Loading…</p>}
      {data && data.attention.length > 0 && (
        <ul className="space-y-1 text-sm">
          {data.attention.map((a) => (
            <li
              key={a.incidentId}
              className={a.overdue ? "font-semibold text-red-800" : "text-amber-900"}
            >
              {incidentText(a, data.now)}
            </li>
          ))}
        </ul>
      )}
      {data && data.attention.length === 0 && (
        <p className="text-sm text-stone-600">
          {data.items.length === 0
            ? "No incidents recorded. Found one? Record it at once: a covered incident is reported at dibnet.dod.mil within 72 hours of discovery."
            : `${open} open, none with a report or a higher-tier notice outstanding.`}
        </p>
      )}
    </Card>
  );
}

/** The slice of GET /suppliers the dashboard reads (services/suppliers, supplierList). */
interface SupplierSummary {
  check: { total: number; flowdown: number; ready: number };
  attention: SupplierAttention[];
}

const SUPPLIER_LINES = 8;

const supplierText = (a: SupplierAttention) => {
  if (a.state === "unknown" || !a.through) return `${a.name}: status or a date not recorded`;
  if (a.state === "not_current" && a.through)
    return `${a.name}: not current since ${addDays(a.through, 1)}`;
  return `${a.name}: current through ${a.through}`;
};

/** Suppliers the clause applies to: not current first, then running out soon, then incomplete. */
export function SuppliersCard({
  data,
  error,
  onOpen,
}: {
  data: SupplierSummary | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const items = data?.attention ?? [];
  const late = items.filter((a) => a.state === "not_current").length;
  const soon = items.filter((a) => a.state === "due_soon").length;
  const unknown = items.length - late - soon;
  return (
    <Card
      title="Suppliers (DFARS 252.204-7021)"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          {data && data.check.total > 0 ? "Suppliers" : "Add suppliers"}
        </button>
      }
    >
      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-stone-600">Loading…</p>}
      {data && data.check.total === 0 && (
        <p className="text-sm text-stone-600">
          No suppliers recorded. Add the subcontractors and suppliers you send FCI or CUI to, and
          this card shows whose CMMC status or affirmation is running out.
        </p>
      )}
      {data && data.check.total > 0 && data.check.flowdown === 0 && (
        <p className="text-sm text-stone-600">
          {data.check.total} {data.check.total === 1 ? "supplier" : "suppliers"} recorded, none
          getting FCI or CUI under a subcontract the clause applies to.
        </p>
      )}
      {data && data.check.flowdown > 0 && (
        <>
          <p className="text-4xl font-semibold text-brand-700">
            {data.check.ready}
            <span className="text-base font-normal text-stone-500">
              {" "}
              / {data.check.flowdown} with no open gap
            </span>
          </p>
          <p className="mt-2 text-sm text-stone-700">
            {late} not current, {soon} running out within {SUPPLIER_DUE_SOON_DAYS} days, {unknown}{" "}
            with the status or a date missing.
          </p>
          {items.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {items.slice(0, SUPPLIER_LINES).map((a) => (
                <li
                  key={a.supplierId}
                  className={
                    a.state === "not_current"
                      ? "text-red-800"
                      : a.state === "due_soon"
                        ? "text-amber-800"
                        : "text-stone-700"
                  }
                >
                  {supplierText(a)}
                </li>
              ))}
              {items.length > SUPPLIER_LINES && (
                <li className="text-stone-600">…and {items.length - SUPPLIER_LINES} more</li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-800">
              Every supplier the clause applies to is current for more than {SUPPLIER_DUE_SOON_DAYS}{" "}
              days.
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Current-through dates are in the calendar file on the Affirmations tab, as a count per
            date with no names.
          </p>
        </>
      )}
    </Card>
  );
}

/** The slice of GET /people the dashboard reads (services/personnel, personnelRecords). */
interface TrainingSummary {
  refreshMonths: number;
  check: { active: number };
  attention: TrainingAttention[];
}

/** How many lines the card shows before "and N more". */
const TRAINING_LINES = 8;

const attentionText = (a: TrainingAttention) => {
  const label = TRAINING_INFO[a.training].label.toLowerCase();
  if (a.state === "missing") return `${a.name}: no ${label} date recorded`;
  return `${a.name}: ${label} ${a.state === "overdue" ? "was due" : "due"} ${a.dueOn}`;
};

/** Training refreshers: overdue first, then due within 30 days, then people with no date. */
export function TrainingCard({
  data,
  error,
  onOpen,
}: {
  data: TrainingSummary | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const items = data?.attention ?? [];
  const overdue = items.filter((a) => a.state === "overdue").length;
  const soon = items.filter((a) => a.state === "due_soon").length;
  const missing = items.length - overdue - soon;
  return (
    <Card
      title="Training (3.2.1 to 3.2.3)"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          {data && data.check.active > 0 ? "People" : "Add people"}
        </button>
      }
    >
      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-stone-600">Loading…</p>}
      {data && data.check.active === 0 && (
        <p className="text-sm text-stone-600">
          No current people recorded. Add everyone who uses the systems in scope, or import a
          roster, and this card shows whose training is due.
        </p>
      )}
      {data && data.check.active > 0 && (
        <>
          <p className="text-sm text-stone-700">
            {data.check.active} current {data.check.active === 1 ? "person" : "people"}, refresher
            every {data.refreshMonths} months. {overdue} overdue, {soon} due within{" "}
            {TRAINING_DUE_SOON_DAYS} days, {missing} with no date recorded.
          </p>
          {items.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {items.slice(0, TRAINING_LINES).map((a) => (
                <li
                  key={`${a.personId}-${a.training}`}
                  className={
                    a.state === "overdue"
                      ? "text-red-800"
                      : a.state === "due_soon"
                        ? "text-amber-800"
                        : "text-stone-700"
                  }
                >
                  {attentionText(a)}
                </li>
              ))}
              {items.length > TRAINING_LINES && (
                <li className="text-stone-600">…and {items.length - TRAINING_LINES} more</li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-800">
              Every training that applies is recorded and none falls due within{" "}
              {TRAINING_DUE_SOON_DAYS} days.
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Refresher dates are in the calendar file on the Affirmations tab, as a count per date
            with no names.
          </p>
        </>
      )}
    </Card>
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

/** The slice of GET /documents the dashboard reads (services/documents, documentList). */
interface DocumentReviewSummary {
  today: string;
  items: unknown[];
  needingReview: { documentId: string; docNumber: string; title: string; reviewDue: string }[];
}

/** The slice of GET /audits the dashboard reads (services/internal-audits, auditProgramme). */
interface AuditSummary {
  audits: unknown[];
  correctiveActions: unknown[];
  attention: QualityAttention[];
}

const QUALITY_LINES = 8;

const QUALITY_KIND_TEXT: Record<QualityAttention["kind"], [string, string]> = {
  audit: ["planned for", "planned for"],
  ca_action: ["action was due", "action due"],
  ca_check: ["effectiveness check was due", "effectiveness check due"],
};

/**
 * ISO 9001 dates that need someone: document reviews, internal audits and corrective actions that
 * are overdue (oldest first), then those falling due soon. One list across the three, so the
 * quality manager sees the next thing to do without opening two tabs.
 */
export function QualityDatesCard({
  orgId,
  documents,
  audits,
  error,
  onOpenDocuments,
  onOpenAudits,
}: {
  orgId: string;
  documents: DocumentReviewSummary | undefined;
  audits: AuditSummary | undefined;
  error: unknown;
  onOpenDocuments: () => void;
  onOpenAudits: () => void;
}) {
  const today = documents?.today;
  const lines = [
    ...(documents?.needingReview ?? []).map((d) => ({
      key: `doc-${d.documentId}`,
      overdue: today !== undefined && d.reviewDue < today,
      due: d.reviewDue,
      text: `${d.docNumber} ${d.title}: review ${today !== undefined && d.reviewDue < today ? "was due" : "due"} ${d.reviewDue}`,
    })),
    ...(audits?.attention ?? []).map((a) => {
      const [late, soon] = QUALITY_KIND_TEXT[a.kind];
      return {
        key: `${a.kind}-${a.id}`,
        overdue: a.state === "overdue",
        due: a.due,
        text: `${a.label}: ${a.state === "overdue" ? late : soon} ${a.due}${a.kind === "audit" && a.state === "overdue" ? ", not marked done" : ""}`,
      };
    }),
  ].sort(
    (a, b) =>
      (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) ||
      a.due.localeCompare(b.due) ||
      a.text.localeCompare(b.text),
  );
  const overdue = lines.filter((l) => l.overdue).length;
  const loading = (!documents || !audits) && !error;
  const empty =
    documents !== undefined &&
    audits !== undefined &&
    documents.items.length === 0 &&
    audits.audits.length === 0 &&
    audits.correctiveActions.length === 0;
  return (
    <Card
      title="ISO 9001 dates"
      actions={
        <span className="flex gap-2">
          <button type="button" className={btnGhostCls} onClick={onOpenDocuments}>
            Documents
          </button>
          <button type="button" className={btnGhostCls} onClick={onOpenAudits}>
            Audits
          </button>
        </span>
      }
    >
      <ErrorText error={error} />
      {loading && <p className="text-sm text-stone-600">Loading…</p>}
      {empty && (
        <p className="text-sm text-stone-600">
          No controlled document, internal audit or corrective action recorded yet. Their review,
          audit and due dates show here and go into the calendar file.
        </p>
      )}
      {!loading && !empty && documents && audits && (
        <>
          {lines.length === 0 ? (
            <p className="text-sm text-emerald-800">
              Nothing overdue. No document review due within 60 days, no audit planned within{" "}
              {AUDIT_WARNING_DAYS} days, no corrective action due within {CA_WARNING_DAYS} days.
            </p>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                {overdue > 0 ? `${overdue} overdue, ` : ""}
                {lines.length - overdue} due soon.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {lines.slice(0, QUALITY_LINES).map((l) => (
                  <li key={l.key} className={l.overdue ? "text-red-800" : "text-amber-800"}>
                    {l.text}
                  </li>
                ))}
              </ul>
              {lines.length > QUALITY_LINES && (
                <p className="mt-1 text-xs text-stone-500">
                  and {lines.length - QUALITY_LINES} more on the Documents and Audits tabs.
                </p>
              )}
            </>
          )}
          <p className="mt-2 text-xs text-stone-500">
            <a className="underline" href={`/api/orgs/${orgId}/affirmations/calendar.ics`}>
              The calendar file
            </a>{" "}
            has these dates as counts per day (no titles), beside the CMMC ones.
          </p>
        </>
      )}
    </Card>
  );
}

/** The slice of GET /gauges the dashboard reads (services/calibration, gaugeList). */
interface GaugeSummary {
  today: string;
  items: unknown[];
  check: CalibrationCheck;
  due: GaugeDue[];
  dueSoonDays: number;
}

const CALIBRATION_LINES = 8;

/**
 * Gauges that need the lab: overdue first (oldest first), then due soon, then never calibrated, the
 * Gauges tab's recall list cut to a few lines, plus out-of-tolerance results with no impact record.
 */
export function CalibrationCard({
  orgId,
  data,
  error,
  onOpen,
}: {
  orgId: string;
  data: GaugeSummary | undefined;
  error: unknown;
  onOpen: () => void;
}) {
  const c = data?.check;
  const text = (d: GaugeDue) =>
    d.state === "overdue"
      ? `${d.tag} ${d.description}: calibration was due ${d.dueOn}`
      : d.state === "due_soon"
        ? `${d.tag} ${d.description}: calibration due ${d.dueOn}`
        : `${d.tag} ${d.description}: in use, never calibrated`;
  return (
    <Card
      title="Gauge calibration"
      actions={
        <button type="button" className={btnGhostCls} onClick={onOpen}>
          Gauges
        </button>
      }
    >
      <ErrorText error={error} />
      {!data && !error && <p className="text-sm text-stone-600">Loading…</p>}
      {data && c && data.items.length === 0 && (
        <p className="text-sm text-stone-600">
          No gauge recorded yet. List the calipers, micrometers and other gauges used to accept
          parts on the Gauges tab; their calibration due dates show here and go into the calendar
          file.
        </p>
      )}
      {data && c && data.items.length > 0 && (
        <>
          {data.due.length === 0 && c.openOutOfTolerance === 0 ? (
            <p className="text-sm text-emerald-800">
              {c.inUse} {c.inUse === 1 ? "gauge" : "gauges"} in use, none overdue or due within{" "}
              {data.dueSoonDays} days.
            </p>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                {c.inUse} in use: {c.overdue} overdue, {c.dueSoon} due within {data.dueSoonDays}{" "}
                days, {c.never} never calibrated.
              </p>
              {c.openOutOfTolerance > 0 && (
                <p className="mt-1 text-sm text-red-800">
                  {c.openOutOfTolerance} out-of-tolerance{" "}
                  {c.openOutOfTolerance === 1 ? "result has" : "results have"} no record of what it
                  meant for parts measured since the last good calibration.
                </p>
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {data.due.slice(0, CALIBRATION_LINES).map((d) => (
                  <li
                    key={d.gaugeId}
                    className={d.state === "due_soon" ? "text-amber-800" : "text-red-800"}
                  >
                    {text(d)}
                  </li>
                ))}
              </ul>
              {data.due.length > CALIBRATION_LINES && (
                <p className="mt-1 text-xs text-stone-500">
                  and {data.due.length - CALIBRATION_LINES} more on the Gauges tab's recall list.
                </p>
              )}
            </>
          )}
          <p className="mt-2 text-xs text-stone-500">
            <a className="underline" href={`/api/orgs/${orgId}/affirmations/calendar.ics`}>
              The calendar file
            </a>{" "}
            has the due dates as a count of gauges per day (no gauge ids or names).
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * 32 CFR 170.24(b)(2): a requirement is NOT MET when any applicable objective is not satisfied, so a
 * requirement recorded as implemented with an objective marked "Not met" is scored as not met.
 */
function ObjectiveConflicts({ conflicts }: { conflicts: readonly ObjectiveConflictView[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p>
        {conflicts.length} requirement(s) are marked implemented or not applicable but have an
        assessment objective marked <strong>Not met</strong>. A requirement is met only when every
        objective is met (32 CFR 170.24(b)(2)), so they are scored as not met. Correct the status or
        re-assess the objective:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {conflicts.slice(0, 8).map((c) => (
          <li key={c.id}>
            {c.id}: objective {c.objectives.join(", ")}
          </li>
        ))}
        {conflicts.length > 8 && <li>…and {conflicts.length - 8} more</li>}
      </ul>
    </div>
  );
}

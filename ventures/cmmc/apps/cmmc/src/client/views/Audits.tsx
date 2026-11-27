// ISO 9001 internal audits (clause 9.2) and the corrective-action log (clause 10.2): the audit
// programme with each audit's scope, auditor and findings, a corrective action opened from a
// finding, and its cause, action and effectiveness check. Checks run on the server
// (@shared/internal-audits); this view shows them and drives the records.
import type {
  AuditStatus,
  AuditTiming,
  CaSource,
  CaStage,
  ClauseCoverage,
  FindingKind,
  QualityIssue,
  QualityProgrammeCheck,
} from "@shared/internal-audits";
import { ISO9001_CLAUSES } from "@shared/quality";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Member, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface FindingItem {
  id: string;
  auditId: string;
  kind: FindingKind;
  clauseId: string | null;
  description: string;
  evidence: string;
  correctiveActionId: string | null;
  correctiveActionRef: string | null;
}

export interface AuditItem {
  id: string;
  title: string;
  clauseIds: string[];
  process: string;
  plannedOn: string;
  auditorUserId: string | null;
  auditorName: string;
  status: AuditStatus;
  completedOn: string | null;
  summary: string;
  timing: AuditTiming;
  findings: FindingItem[];
}

export interface CaItem {
  id: string;
  ref: string;
  source: CaSource;
  findingId: string | null;
  auditId: string | null;
  clauseId: string | null;
  nonconformity: string;
  containment: string;
  rootCause: string;
  action: string;
  ownerUserId: string | null;
  raisedOn: string;
  dueOn: string | null;
  completedOn: string | null;
  verifyDueOn: string | null;
  verifiedOn: string | null;
  verifiedByName: string;
  effective: boolean | null;
  verificationNotes: string;
  closedOn: string | null;
  stage: CaStage;
  issues: QualityIssue[];
}

export interface AuditsResponse {
  today: string;
  audits: AuditItem[];
  correctiveActions: CaItem[];
  coverage: ClauseCoverage[];
  check: QualityProgrammeCheck;
  findingKinds: { key: FindingKind; label: string }[];
  sources: { key: CaSource; label: string }[];
  stages: { key: CaStage; label: string }[];
  coverageMonths: number;
}

const clauseNo = (id: string | null) =>
  id ? (ISO9001_CLAUSES.find((c) => c.id === id)?.number ?? id) : "";

const TIMING_TONE: Record<AuditTiming, string> = {
  none: "",
  upcoming: "text-stone-600",
  due_soon: "text-amber-900",
  overdue: "font-medium text-red-800",
};
const STAGE_TONE: Record<CaStage, string> = {
  cause: "bg-amber-50 text-amber-900",
  action: "bg-amber-50 text-amber-900",
  verify: "bg-blue-50 text-blue-900",
  not_effective: "bg-red-50 text-red-800",
  closed: "bg-green-50 text-green-800",
};

const EMPTY_AUDIT = {
  title: "",
  clauseIds: [] as string[],
  process: "",
  plannedOn: "",
  auditorUserId: null as string | null,
  auditorName: "",
};

const EMPTY_CA = {
  source: "process" as CaSource,
  clauseId: null as string | null,
  nonconformity: "",
  containment: "",
  rootCause: "",
  action: "",
  ownerUserId: null as string | null,
  raisedOn: "",
  dueOn: null as string | null,
  completedOn: null as string | null,
  verifyDueOn: null as string | null,
};

export function AuditsView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canRecord = info.plan.quality && info.role !== "viewer";
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["audits", orgId],
    queryFn: () => api<AuditsResponse>(`/api/orgs/${orgId}/audits`),
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const memberList = members.data?.items ?? [];
  const nameOf = (id: string | null) => memberList.find((m) => m.userId === id)?.name ?? "";
  const refresh = () => qc.invalidateQueries({ queryKey: ["audits", orgId] });
  const [open, setOpen] = useState<string | null>(null);
  const [auditForm, setAuditForm] = useState(EMPTY_AUDIT);
  const [editingCa, setEditingCa] = useState<CaItem | null>(null);
  const [caForm, setCaForm] = useState(EMPTY_CA);
  const [verifying, setVerifying] = useState<CaItem | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const data = list.data;

  const addAudit = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/audits`, {
        method: "POST",
        json: {
          ...auditForm,
          auditorName: auditForm.auditorUserId ? undefined : auditForm.auditorName,
        },
      }),
    onSuccess: () => {
      setAuditForm(EMPTY_AUDIT);
      refresh();
    },
  });
  const auditAct = useMutation({
    mutationFn: (a: { id: string; act: "cancel" | "delete" }) =>
      a.act === "delete"
        ? api(`/api/orgs/${orgId}/audits/${a.id}`, { method: "DELETE" })
        : api(`/api/orgs/${orgId}/audits/${a.id}/cancel`, { method: "POST", json: {} }),
    onSuccess: refresh,
  });
  const openCa = useMutation({
    mutationFn: (f: FindingItem) =>
      api(`/api/orgs/${orgId}/audits/${f.auditId}/findings/${f.id}/corrective-action`, {
        method: "POST",
        json: {},
      }),
    onSuccess: refresh,
  });
  const saveCa = useMutation({
    mutationFn: () =>
      editingCa
        ? api(`/api/orgs/${orgId}/corrective-actions/${editingCa.id}`, {
            method: "PATCH",
            json: caForm,
          })
        : api(`/api/orgs/${orgId}/corrective-actions`, { method: "POST", json: caForm }),
    onSuccess: () => {
      setEditingCa(null);
      setCaForm(EMPTY_CA);
      refresh();
    },
  });
  const removeCa = useMutation({
    mutationFn: (id: string) =>
      api(`/api/orgs/${orgId}/corrective-actions/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const startCaEdit = (ca: CaItem) => {
    setEditingCa(ca);
    setCaForm({
      source: ca.source,
      clauseId: ca.clauseId,
      nonconformity: ca.nonconformity,
      containment: ca.containment,
      rootCause: ca.rootCause,
      action: ca.action,
      ownerUserId: ca.ownerUserId,
      raisedOn: ca.raisedOn,
      dueOn: ca.dueOn,
      completedOn: ca.completedOn,
      verifyDueOn: ca.verifyDueOn,
    });
  };

  const gaps = data?.check.issues.filter((i) => i.kind === "gap") ?? [];
  const soon = data?.check.issues.filter((i) => i.kind === "soon") ?? [];
  const notes = data?.check.issues.filter((i) => i.kind === "note") ?? [];
  const actions = data?.correctiveActions.filter((c) => showClosed || c.stage !== "closed") ?? [];
  const caById = new Map((data?.correctiveActions ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {!info.plan.quality && (
        <Card title="Read only on this plan">
          <p className="text-sm text-stone-700">
            Keeping the audit programme and corrective-action log needs the Level 2 + Quality plan.
            Everything recorded stays readable.{" "}
            {isAdmin ? (
              <button type="button" className="underline" onClick={onUpgrade}>
                See plans
              </button>
            ) : (
              "Ask an admin of this organization to upgrade."
            )}
          </p>
        </Card>
      )}
      <Card title="Internal audit programme (ISO 9001 9.2)">
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Plan each internal audit by the clauses or the process it covers, who audits it and when.
          Record what it found; a nonconformity opens a corrective action below. An auditor who owns
          a clause on the ISO 9001 checklist should not audit it. The standard sets no interval:
          this page counts a clause covered when it was audited in the last{" "}
          {data?.coverageMonths ?? 12} months or an audit of it is planned, a common choice.
        </p>
        <p className="mb-3 text-xs text-stone-500">
          A record-keeping aid, not a certification: it does not make a quality system conform to
          ISO 9001 or AS9100, and no ISO text is reproduced.
        </p>
        {data && (
          <p className="mb-2 text-sm font-medium text-stone-800">
            {data.check.clauses.covered} of {data.check.clauses.applicable} applicable clauses
            covered; {data.check.audits.done} audits done, {data.check.audits.planned} planned
            {data.check.audits.overdue > 0 && `, ${data.check.audits.overdue} overdue`};{" "}
            {data.check.correctiveActions.open} corrective actions open.
          </p>
        )}
        <IssueList issues={gaps} tone="text-red-800" />
        <IssueList issues={soon} tone="text-amber-900" />
        <IssueList issues={notes} tone="text-stone-600" />
        {data && data.audits.length === 0 && (
          <p className="text-sm text-stone-600">No audits on the programme yet.</p>
        )}
        {data && data.audits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Audit</th>
                  <th className="pr-2">Scope</th>
                  <th className="pr-2">Auditor</th>
                  <th className="pr-2">Date</th>
                  <th className="pr-2">Findings</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.audits.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-2 pr-2">
                      {a.title}
                      <p className="text-xs text-stone-500">
                        {a.status === "planned"
                          ? "Planned"
                          : a.status === "done"
                            ? "Done"
                            : "Cancelled"}
                      </p>
                    </td>
                    <td className="pr-2 text-xs">
                      {a.clauseIds.map(clauseNo).join(", ")}
                      {a.process && <span className="block text-stone-500">{a.process}</span>}
                    </td>
                    <td className="pr-2 text-xs">{a.auditorName || nameOf(a.auditorUserId)}</td>
                    <td className={`pr-2 text-xs ${TIMING_TONE[a.timing]}`}>
                      {a.completedOn ?? a.plannedOn}
                    </td>
                    <td className="pr-2 text-xs">{a.findings.length}</td>
                    <td className="space-x-2 whitespace-nowrap text-xs">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                      >
                        {open === a.id ? "Close" : "Open"}
                      </button>
                      {canRecord && a.status === "planned" && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => auditAct.mutate({ id: a.id, act: "cancel" })}
                        >
                          Cancel
                        </button>
                      )}
                      {canRecord && !a.findings.some((f) => f.correctiveActionId) && (
                        <button
                          type="button"
                          className="text-red-700 underline"
                          onClick={() => auditAct.mutate({ id: a.id, act: "delete" })}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorText error={auditAct.error ?? openCa.error} />
      </Card>

      {open && data?.audits.find((a) => a.id === open) && (
        <AuditDetail
          orgId={orgId}
          audit={data.audits.find((a) => a.id === open) as AuditItem}
          today={data.today}
          kinds={data.findingKinds}
          canRecord={canRecord}
          caById={caById}
          onOpenCa={(f) => openCa.mutate(f)}
          onChanged={refresh}
        />
      )}

      {canRecord && data && (
        <Card title="Plan an audit">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              addAudit.mutate();
            }}
          >
            <Field label="Title">
              <input
                className={inputCls}
                value={auditForm.title}
                placeholder="Q1 production and inspection audit"
                maxLength={200}
                onChange={(e) => setAuditForm({ ...auditForm, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Planned for">
              <input
                type="date"
                className={inputCls}
                value={auditForm.plannedOn}
                onChange={(e) => setAuditForm({ ...auditForm, plannedOn: e.target.value })}
                required
              />
            </Field>
            <Field label="Clauses in scope" hint="Hold Ctrl or ⌘ to pick several.">
              <select
                multiple
                className={`${inputCls} h-32`}
                value={auditForm.clauseIds}
                onChange={(e) =>
                  setAuditForm({
                    ...auditForm,
                    clauseIds: [...e.target.selectedOptions].map((o) => o.value),
                  })
                }
              >
                {ISO9001_CLAUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Or the process audited"
              hint="Receiving inspection, CNC cell 2, shipping."
            >
              <input
                className={inputCls}
                value={auditForm.process}
                maxLength={200}
                onChange={(e) => setAuditForm({ ...auditForm, process: e.target.value })}
              />
            </Field>
            <Field label="Auditor">
              <select
                className={inputCls}
                value={auditForm.auditorUserId ?? ""}
                onChange={(e) =>
                  setAuditForm({ ...auditForm, auditorUserId: e.target.value || null })
                }
              >
                <option value="">Someone from outside</option>
                {memberList.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {!auditForm.auditorUserId && (
              <Field label="Outside auditor's name">
                <input
                  className={inputCls}
                  value={auditForm.auditorName}
                  placeholder="Consultant, a partner shop's quality lead"
                  maxLength={200}
                  onChange={(e) => setAuditForm({ ...auditForm, auditorName: e.target.value })}
                  required
                />
              </Field>
            )}
            <div className="sm:col-span-2">
              <button type="submit" className={btnCls} disabled={addAudit.isPending}>
                Add to the programme
              </button>
            </div>
            <ErrorText error={addAudit.error} />
          </form>
        </Card>
      )}

      <Card
        title="Corrective-action log (ISO 9001 10.2)"
        actions={
          data && data.correctiveActions.length > 0 ? (
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/corrective-actions/export.csv`}>
              Download log (CSV)
            </a>
          ) : null
        }
      >
        <p className="mb-3 text-sm text-stone-700">
          Each nonconformity, from an audit, a customer, a supplier or the shop floor: what was done
          at once, the root cause, the action that removes it, and a later check that it worked. A
          check that finds it did not work keeps the action open for a new one. Closed actions are
          kept for the record.
        </p>
        {data && data.check.correctiveActions.closed > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            Show {data.check.correctiveActions.closed} closed
          </label>
        )}
        {data && data.correctiveActions.length === 0 && (
          <p className="text-sm text-stone-600">No corrective actions logged.</p>
        )}
        {actions.length > 0 && data && (
          <ul className="divide-y divide-stone-100">
            {actions.map((ca) => (
              <li key={ca.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs">{ca.ref}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STAGE_TONE[ca.stage]}`}>
                    {data.stages.find((s) => s.key === ca.stage)?.label}
                  </span>
                  <span className="text-xs text-stone-500">
                    {data.sources.find((s) => s.key === ca.source)?.label} · raised {ca.raisedOn}
                    {ca.clauseId && ` · ${clauseNo(ca.clauseId)}`}
                    {ca.ownerUserId && ` · ${nameOf(ca.ownerUserId)}`}
                    {ca.dueOn && ca.stage !== "closed" && ` · due ${ca.dueOn}`}
                    {ca.closedOn && ` · closed ${ca.closedOn}`}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-stone-800">{ca.nonconformity}</p>
                {ca.rootCause && (
                  <p className="text-xs text-stone-600">
                    <span className="font-medium">Cause:</span> {ca.rootCause}
                  </p>
                )}
                {ca.action && (
                  <p className="text-xs text-stone-600">
                    <span className="font-medium">Action:</span> {ca.action}
                    {ca.completedOn && ` (done ${ca.completedOn})`}
                  </p>
                )}
                {ca.verificationNotes && (
                  <p className="whitespace-pre-line text-xs text-stone-600">
                    <span className="font-medium">Checked:</span> {ca.verificationNotes}
                  </p>
                )}
                {ca.issues.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-red-800">
                    {ca.issues.map((i) => (
                      <li key={i.message}>{i.message}</li>
                    ))}
                  </ul>
                )}
                {canRecord && ca.stage !== "closed" && (
                  <div className="mt-1 space-x-3 text-xs">
                    <button type="button" className="underline" onClick={() => startCaEdit(ca)}>
                      Edit
                    </button>
                    {ca.stage === "verify" && (
                      <button type="button" className="underline" onClick={() => setVerifying(ca)}>
                        Check it worked
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() => removeCa.mutate(ca.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ErrorText error={removeCa.error} />
      </Card>

      {verifying && data && (
        <VerifyCard
          orgId={orgId}
          ca={verifying}
          today={data.today}
          onDone={() => {
            setVerifying(null);
            refresh();
          }}
          onClose={() => setVerifying(null)}
        />
      )}

      {canRecord && data && (
        <Card title={editingCa ? `Edit ${editingCa.ref}` : "Log a corrective action"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveCa.mutate();
            }}
          >
            <Field label="Source">
              <select
                className={inputCls}
                value={caForm.source}
                onChange={(e) => setCaForm({ ...caForm, source: e.target.value as CaSource })}
              >
                {data.sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Raised on">
              <input
                type="date"
                className={inputCls}
                value={caForm.raisedOn}
                max={data.today}
                onChange={(e) => setCaForm({ ...caForm, raisedOn: e.target.value })}
                required
              />
            </Field>
            <Field label="Nonconformity" hint="What was wrong, where, how many, which order.">
              <textarea
                className={inputCls}
                rows={2}
                value={caForm.nonconformity}
                onChange={(e) => setCaForm({ ...caForm, nonconformity: e.target.value })}
                required
              />
            </Field>
            <Field
              label="Correction done at once"
              hint="Parts sorted, held, reworked; customer told."
            >
              <textarea
                className={inputCls}
                rows={2}
                value={caForm.containment}
                onChange={(e) => setCaForm({ ...caForm, containment: e.target.value })}
              />
            </Field>
            <Field label="Root cause" hint="Why it happened (5 whys, fishbone), not who.">
              <textarea
                className={inputCls}
                rows={2}
                value={caForm.rootCause}
                onChange={(e) => setCaForm({ ...caForm, rootCause: e.target.value })}
              />
            </Field>
            <Field label="Corrective action" hint="What changes so it does not happen again.">
              <textarea
                className={inputCls}
                rows={2}
                value={caForm.action}
                onChange={(e) => setCaForm({ ...caForm, action: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <select
                className={inputCls}
                value={caForm.ownerUserId ?? ""}
                onChange={(e) => setCaForm({ ...caForm, ownerUserId: e.target.value || null })}
              >
                <option value="">No owner</option>
                {memberList.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ISO 9001 clause (optional)">
              <select
                className={inputCls}
                value={caForm.clauseId ?? ""}
                onChange={(e) => setCaForm({ ...caForm, clauseId: e.target.value || null })}
              >
                <option value="">None</option>
                {ISO9001_CLAUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <DateField
              label="Action due"
              value={caForm.dueOn}
              onChange={(v) => setCaForm({ ...caForm, dueOn: v })}
            />
            <DateField
              label="Action done on"
              value={caForm.completedOn}
              max={data.today}
              onChange={(v) => setCaForm({ ...caForm, completedOn: v })}
            />
            <DateField
              label="Check it worked by"
              hint="Left empty, it is set 90 days after the action is done."
              value={caForm.verifyDueOn}
              onChange={(v) => setCaForm({ ...caForm, verifyDueOn: v })}
            />
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button type="submit" className={btnCls} disabled={saveCa.isPending}>
                {editingCa ? "Save changes" : "Log it"}
              </button>
              {editingCa && (
                <button
                  type="button"
                  className={btnGhostCls}
                  onClick={() => {
                    setEditingCa(null);
                    setCaForm(EMPTY_CA);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            <ErrorText error={saveCa.error} />
          </form>
        </Card>
      )}
    </div>
  );
}

function IssueList({ issues, tone }: { issues: QualityIssue[]; tone: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className={`mb-2 list-disc space-y-1 pl-5 text-sm ${tone}`}>
      {issues.map((i) => (
        <li key={`${i.targetId}-${i.message}`}>{i.message}</li>
      ))}
    </ul>
  );
}

function DateField({
  label,
  value,
  onChange,
  max,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  max?: string;
  hint?: string;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <input
        type="date"
        className={inputCls}
        value={value ?? ""}
        {...(max ? { max } : {})}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </Field>
  );
}

function AuditDetail({
  orgId,
  audit,
  today,
  kinds,
  canRecord,
  caById,
  onOpenCa,
  onChanged,
}: {
  orgId: string;
  audit: AuditItem;
  today: string;
  kinds: { key: FindingKind; label: string }[];
  canRecord: boolean;
  caById: Map<string, CaItem>;
  onOpenCa: (f: FindingItem) => void;
  onChanged: () => void;
}) {
  const [completedOn, setCompletedOn] = useState(today);
  const [summary, setSummary] = useState(audit.summary);
  const [finding, setFinding] = useState({
    kind: "minor" as FindingKind,
    clauseId: audit.clauseIds[0] ?? null,
    description: "",
    evidence: "",
  });
  const complete = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/audits/${audit.id}/complete`, {
        method: "POST",
        json: { completedOn, summary },
      }),
    onSuccess: onChanged,
  });
  const addFinding = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/audits/${audit.id}/findings`, { method: "POST", json: finding }),
    onSuccess: () => {
      setFinding({ ...finding, description: "", evidence: "" });
      onChanged();
    },
  });
  const removeFinding = useMutation({
    mutationFn: (id: string) =>
      api(`/api/orgs/${orgId}/audits/${audit.id}/findings/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const label = (k: FindingKind) => kinds.find((x) => x.key === k)?.label ?? k;
  return (
    <Card title={audit.title}>
      {audit.summary && <p className="mb-2 text-sm text-stone-700">{audit.summary}</p>}
      {audit.findings.length === 0 ? (
        <p className="mb-2 text-sm text-stone-600">No findings recorded.</p>
      ) : (
        <ul className="mb-3 divide-y divide-stone-100">
          {audit.findings.map((f) => {
            const ca = f.correctiveActionId ? caById.get(f.correctiveActionId) : undefined;
            return (
              <li key={f.id} className="py-2 text-sm">
                <span className="font-medium">{label(f.kind)}</span>
                {f.clauseId && <span className="text-stone-500"> · {clauseNo(f.clauseId)}</span>}
                <p className="text-stone-800">{f.description}</p>
                {f.evidence && <p className="text-xs text-stone-500">Seen: {f.evidence}</p>}
                <div className="mt-1 space-x-3 text-xs">
                  {f.correctiveActionRef ? (
                    <span className="text-stone-600">
                      {f.correctiveActionRef}
                      {ca && ` · ${ca.stage === "closed" ? "closed" : "open"}`}
                    </span>
                  ) : (
                    canRecord && (
                      <button type="button" className="underline" onClick={() => onOpenCa(f)}>
                        Open a corrective action
                      </button>
                    )
                  )}
                  {canRecord && !f.correctiveActionRef && (
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() => removeFinding.mutate(f.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorText error={removeFinding.error} />
      {canRecord && audit.status !== "cancelled" && (
        <form
          className="mb-3 grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            addFinding.mutate();
          }}
        >
          <Field label="Finding">
            <select
              className={inputCls}
              value={finding.kind}
              onChange={(e) => setFinding({ ...finding, kind: e.target.value as FindingKind })}
            >
              {kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clause">
            <select
              className={inputCls}
              value={finding.clauseId ?? ""}
              onChange={(e) => setFinding({ ...finding, clauseId: e.target.value || null })}
            >
              <option value="">None</option>
              {ISO9001_CLAUSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What was found">
            <textarea
              className={inputCls}
              rows={2}
              value={finding.description}
              onChange={(e) => setFinding({ ...finding, description: e.target.value })}
              required
            />
          </Field>
          <Field label="Evidence seen" hint="The record, part or job number looked at.">
            <textarea
              className={inputCls}
              rows={2}
              value={finding.evidence}
              onChange={(e) => setFinding({ ...finding, evidence: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className={btnGhostCls} disabled={addFinding.isPending}>
              Add finding
            </button>
          </div>
          <ErrorText error={addFinding.error} />
        </form>
      )}
      {canRecord && audit.status === "planned" && (
        <form
          className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            complete.mutate();
          }}
        >
          <Field label="Done on">
            <input
              type="date"
              className={inputCls}
              value={completedOn}
              max={today}
              onChange={(e) => setCompletedOn(e.target.value)}
              required
            />
          </Field>
          <Field label="Summary" hint="What was sampled, who was interviewed, the overall result.">
            <textarea
              className={inputCls}
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className={btnCls} disabled={complete.isPending}>
              Mark done
            </button>
          </div>
          <ErrorText error={complete.error} />
        </form>
      )}
    </Card>
  );
}

function VerifyCard({
  orgId,
  ca,
  today,
  onDone,
  onClose,
}: {
  orgId: string;
  ca: CaItem;
  today: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [checkedOn, setCheckedOn] = useState(today);
  const [effective, setEffective] = useState(true);
  const [notes, setNotes] = useState("");
  const verify = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/corrective-actions/${ca.id}/verify`, {
        method: "POST",
        json: { checkedOn, effective, notes },
      }),
    onSuccess: onDone,
  });
  return (
    <Card title={`Check ${ca.ref} worked`}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <Field label="Checked on">
          <input
            type="date"
            className={inputCls}
            value={checkedOn}
            max={today}
            onChange={(e) => setCheckedOn(e.target.value)}
            required
          />
        </Field>
        <Field label="Result">
          <select
            className={inputCls}
            value={effective ? "yes" : "no"}
            onChange={(e) => setEffective(e.target.value === "yes")}
          >
            <option value="yes">It worked: close the action</option>
            <option value="no">It did not work: keep it open for a new action</option>
          </select>
        </Field>
        <Field
          label="What was checked"
          hint="The lots, records or period looked at, and what you saw."
        >
          <textarea
            className={inputCls}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
          />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className={btnCls} disabled={verify.isPending}>
            Record the check
          </button>
          <button type="button" className={btnGhostCls} onClick={onClose}>
            Cancel
          </button>
        </div>
        <ErrorText error={verify.error} />
      </form>
    </Card>
  );
}

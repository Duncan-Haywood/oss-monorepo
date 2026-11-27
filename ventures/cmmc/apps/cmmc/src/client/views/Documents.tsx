// ISO 9001 document control (clause 7.5): the master list of controlled documents, each one's
// revision in force, approval and review date, and its history. Checks run on the server
// (@shared/document-control); this view shows them and drives release / revise / review / withdraw.
import type {
  DocIssue,
  DocKind,
  DocOrigin,
  DocReviewState,
  DocStatus,
  DocumentCheck,
} from "@shared/document-control";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Member, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface DocumentItem {
  id: string;
  docNumber: string;
  title: string;
  kind: DocKind;
  origin: DocOrigin;
  revision: string;
  status: DocStatus;
  releasedRevision: string | null;
  issuer: string;
  location: string;
  ownerUserId: string | null;
  approvedBy: string | null;
  approvedOn: string | null;
  effectiveOn: string | null;
  reviewMonths: number | null;
  reviewDue: string | null;
  notes: string;
  review: DocReviewState;
  suggestedNextRevision: string | null;
  issues: DocIssue[];
}

export interface DocumentsResponse {
  today: string;
  items: DocumentItem[];
  check: DocumentCheck;
  kinds: { key: DocKind; label: string }[];
  origins: { key: DocOrigin; label: string }[];
  statuses: { key: DocStatus; label: string }[];
  reviewMonths: number[];
}

interface DocEvent {
  id: string;
  kind: "released" | "reviewed" | "obsoleted";
  revision: string;
  summary: string;
  byName: string;
  on: string;
  effectiveOn: string | null;
}

const EMPTY = {
  docNumber: "",
  title: "",
  kind: "procedure" as DocKind,
  origin: "internal" as DocOrigin,
  revision: "A",
  issuer: "",
  location: "",
  ownerUserId: null as string | null,
  reviewMonths: 12 as number | null,
  notes: "",
};

const STATUS_TONE: Record<DocStatus, string> = {
  draft: "bg-amber-50 text-amber-900",
  released: "bg-green-50 text-green-800",
  obsolete: "bg-stone-100 text-stone-600",
};
const REVIEW_TONE: Record<DocReviewState, string> = {
  none: "",
  current: "text-stone-600",
  due_soon: "text-amber-900",
  overdue: "font-medium text-red-800",
};
const EVENT_LABEL: Record<DocEvent["kind"], string> = {
  released: "Released",
  reviewed: "Reviewed",
  obsoleted: "Withdrawn",
};

type Action =
  | { kind: "release"; doc: DocumentItem }
  | { kind: "review"; doc: DocumentItem }
  | { kind: "obsolete"; doc: DocumentItem }
  | { kind: "history"; doc: DocumentItem };

export function DocumentsView({
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
    queryKey: ["documents", orgId],
    queryFn: () => api<DocumentsResponse>(`/api/orgs/${orgId}/documents`),
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const memberList = members.data?.items ?? [];
  const nameOf = (id: string | null) => memberList.find((m) => m.userId === id)?.name ?? "";
  const refresh = () => qc.invalidateQueries({ queryKey: ["documents", orgId] });
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [showObsolete, setShowObsolete] = useState(false);
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
  };
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/documents/${editing.id}`, {
            method: "PATCH",
            // A released revision changes only by "Start next revision".
            json: editing.status === "draft" ? form : { ...form, revision: undefined },
          })
        : api(`/api/orgs/${orgId}/documents`, { method: "POST", json: form }),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const revise = useMutation({
    mutationFn: (d: DocumentItem) =>
      api(`/api/orgs/${orgId}/documents/${d.id}/revise`, { method: "POST", json: {} }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const data = list.data;
  const startEdit = (d: DocumentItem) => {
    setEditing(d);
    setForm({
      docNumber: d.docNumber,
      title: d.title,
      kind: d.kind,
      origin: d.origin,
      revision: d.revision,
      issuer: d.issuer,
      location: d.location,
      ownerUserId: d.ownerUserId,
      reviewMonths: d.reviewMonths,
      notes: d.notes,
    });
  };
  const shown = data?.items.filter((d) => showObsolete || d.status !== "obsolete") ?? [];
  const gaps = data?.check.issues.filter((i) => i.kind === "gap") ?? [];
  const soon = data?.check.issues.filter((i) => i.kind === "soon") ?? [];
  return (
    <div className="space-y-4">
      {!info.plan.quality && (
        <Card title="Read only on this plan">
          <p className="text-sm text-stone-700">
            Keeping the master list needs the Level 2 + Quality plan. Everything recorded stays
            readable.{" "}
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
      <Card
        title="Controlled documents (ISO 9001 7.5)"
        actions={
          data && data.items.length > 0 ? (
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/documents/export.csv`}>
              Download master list (CSV)
            </a>
          ) : null
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          The master list an auditor asks for first: every procedure, work instruction, form and
          customer drawing you work to, with the revision in force, who approved it and when, where
          the controlled copy is kept and when it is next reviewed. Released revisions are never
          edited in place: start the next revision, and the last one stays in force until the new
          one is released. Withdrawn documents stay on the list, with their history.
        </p>
        <p className="mb-3 text-xs text-stone-500">
          A record-keeping aid, not a certification: it does not make a quality system conform to
          ISO 9001 or AS9100. The files themselves stay where you keep them.
        </p>
        {data && data.check.active > 0 && (
          <p className="mb-2 text-sm font-medium text-stone-800">
            {data.check.released} of {data.check.active} documents have a released revision in force
            {data.check.reviewOverdue > 0 && `; ${data.check.reviewOverdue} overdue for review`}.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {gaps.map((i) => (
              <li key={`${i.documentId}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {soon.length > 0 && (
          <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {soon.map((i) => (
              <li key={`${i.documentId}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-stone-600">No documents on the master list yet.</p>
        )}
        {data && data.check.obsolete > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={showObsolete}
              onChange={(e) => setShowObsolete(e.target.checked)}
            />
            Show {data.check.obsolete} withdrawn
          </label>
        )}
        {shown.length > 0 && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Number</th>
                  <th className="pr-2">Title</th>
                  <th className="pr-2">Rev in force</th>
                  <th className="pr-2">Status</th>
                  <th className="pr-2">Approved</th>
                  <th className="pr-2">Review due</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {shown.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-2 pr-2 font-mono text-xs">{d.docNumber}</td>
                    <td className="pr-2">
                      {d.title}
                      <p className="text-xs text-stone-500">
                        {data.kinds.find((k) => k.key === d.kind)?.label}
                        {d.origin === "external" && ` · from ${d.issuer}`}
                        {d.location && ` · ${d.location}`}
                      </p>
                    </td>
                    <td className="pr-2 text-xs">{d.releasedRevision ?? "—"}</td>
                    <td className="pr-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 ${STATUS_TONE[d.status]}`}>
                        {d.status === "draft" && d.releasedRevision !== null
                          ? `Rev ${d.revision} in draft`
                          : data.statuses.find((s) => s.key === d.status)?.label}
                      </span>
                    </td>
                    <td className="pr-2 text-xs">
                      {d.approvedOn ?? "—"}
                      {d.approvedBy && (
                        <span className="block text-stone-500">{nameOf(d.approvedBy)}</span>
                      )}
                    </td>
                    <td className={`pr-2 text-xs ${REVIEW_TONE[d.review]}`}>
                      {d.status === "obsolete" ? "" : (d.reviewDue ?? "—")}
                    </td>
                    <td className="space-x-2 whitespace-nowrap text-xs">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setAction({ kind: "history", doc: d })}
                      >
                        History
                      </button>
                      {canRecord && d.status !== "obsolete" && (
                        <button type="button" className="underline" onClick={() => startEdit(d)}>
                          Edit
                        </button>
                      )}
                      {canRecord && d.status === "draft" && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setAction({ kind: "release", doc: d })}
                        >
                          Release
                        </button>
                      )}
                      {canRecord && d.status === "released" && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => revise.mutate(d)}
                        >
                          Start rev {d.suggestedNextRevision ?? "next"}
                        </button>
                      )}
                      {canRecord && d.releasedRevision !== null && d.status !== "obsolete" && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setAction({ kind: "review", doc: d })}
                        >
                          Reviewed
                        </button>
                      )}
                      {canRecord && d.releasedRevision !== null && d.status !== "obsolete" && (
                        <button
                          type="button"
                          className="text-red-700 underline"
                          onClick={() => setAction({ kind: "obsolete", doc: d })}
                        >
                          Withdraw
                        </button>
                      )}
                      {canRecord && d.releasedRevision === null && (
                        <button
                          type="button"
                          className="text-red-700 underline"
                          onClick={() => remove.mutate(d.id)}
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
        <ErrorText error={revise.error ?? remove.error} />
      </Card>
      {action && data && (
        <ActionCard
          orgId={orgId}
          action={action}
          today={data.today}
          members={memberList}
          onDone={() => {
            setAction(null);
            refresh();
          }}
          onClose={() => setAction(null)}
        />
      )}
      {canRecord && data && (
        <Card title={editing ? `Edit ${editing.docNumber}` : "Add a document"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Document number">
              <input
                className={inputCls}
                value={form.docNumber}
                placeholder="QP-7.5-01, WI-104, F-8.7-02"
                maxLength={40}
                onChange={(e) => setForm({ ...form, docNumber: e.target.value })}
                required
              />
            </Field>
            <Field label="Title">
              <input
                className={inputCls}
                value={form.title}
                placeholder="Control of nonconforming parts"
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Type">
              <select
                className={inputCls}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as DocKind })}
              >
                {data.kinds.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Origin"
              hint="External: a customer drawing or spec, a standard, a supplier's instruction you work to."
            >
              <select
                className={inputCls}
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value as DocOrigin })}
              >
                {data.origins.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.origin === "external" && (
              <Field label="Issued by">
                <input
                  className={inputCls}
                  value={form.issuer}
                  placeholder="Customer name, ASTM, the supplier"
                  onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                  required
                />
              </Field>
            )}
            <Field
              label="Revision"
              hint={
                editing && editing.status !== "draft"
                  ? "Released: use “Start rev” in the list to change it."
                  : "Letters (A, B …) or numbers (01, 02 …), as your shop numbers them."
              }
            >
              <input
                className={inputCls}
                value={form.revision}
                maxLength={12}
                disabled={!!editing && editing.status !== "draft"}
                onChange={(e) => setForm({ ...form, revision: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <select
                className={inputCls}
                value={form.ownerUserId ?? ""}
                onChange={(e) => setForm({ ...form, ownerUserId: e.target.value || null })}
              >
                <option value="">No owner</option>
                {memberList.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Review every">
              <select
                className={inputCls}
                value={form.reviewMonths ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reviewMonths: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">No periodic review</option>
                {data.reviewMonths.map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Where the controlled copy is kept"
              hint="Shared-drive path, ERP document, the binder at the inspection bench."
            >
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save changes" : "Add as draft"}
              </button>
              {editing && (
                <button type="button" className={btnGhostCls} onClick={reset}>
                  Cancel
                </button>
              )}
            </div>
            <ErrorText error={save.error} />
          </form>
        </Card>
      )}
    </div>
  );
}

function ActionCard({
  orgId,
  action,
  today,
  members,
  onDone,
  onClose,
}: {
  orgId: string;
  action: Action;
  today: string;
  members: Member[];
  onDone: () => void;
  onClose: () => void;
}) {
  const d = action.doc;
  const [on, setOn] = useState(today);
  const [effectiveOn, setEffectiveOn] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [text, setText] = useState("");
  const history = useQuery({
    queryKey: ["document-history", orgId, d.id],
    queryFn: () => api<{ items: DocEvent[] }>(`/api/orgs/${orgId}/documents/${d.id}/history`),
    enabled: action.kind === "history",
  });
  const submit = useMutation({
    mutationFn: () => {
      const base = `/api/orgs/${orgId}/documents/${d.id}`;
      if (action.kind === "release")
        return api(`${base}/release`, {
          method: "POST",
          json: {
            approvedOn: on,
            effectiveOn: effectiveOn || null,
            approvedBy: approvedBy || undefined,
            changeSummary: text || undefined,
          },
        });
      if (action.kind === "review")
        return api(`${base}/review`, {
          method: "POST",
          json: { reviewedOn: on, notes: text || undefined },
        });
      return api(`${base}/obsolete`, { method: "POST", json: { on, reason: text } });
    },
    onSuccess: onDone,
  });
  const title =
    action.kind === "release"
      ? `Release ${d.docNumber} rev ${d.revision}`
      : action.kind === "review"
        ? `Record a review of ${d.docNumber} rev ${d.releasedRevision}`
        : action.kind === "obsolete"
          ? `Withdraw ${d.docNumber}`
          : `History of ${d.docNumber}`;
  return (
    <Card
      title={title}
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      {action.kind === "history" ? (
        <>
          <ErrorText error={history.error} />
          {history.data && history.data.items.length === 0 && (
            <p className="text-sm text-stone-600">Not released yet.</p>
          )}
          <ul className="space-y-2 text-sm">
            {history.data?.items.map((e) => (
              <li key={e.id}>
                <span className="font-medium">
                  {e.on} · {EVENT_LABEL[e.kind]} rev {e.revision}
                </span>
                {e.byName && <span className="text-stone-500"> · {e.byName}</span>}
                {e.effectiveOn && e.effectiveOn !== e.on && (
                  <span className="text-stone-500"> · effective {e.effectiveOn}</span>
                )}
                <p className="text-stone-700">{e.summary}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <Field
            label={
              action.kind === "release"
                ? "Approved on"
                : action.kind === "review"
                  ? "Reviewed on"
                  : "Withdrawn on"
            }
          >
            <input
              type="date"
              className={inputCls}
              max={today}
              value={on}
              onChange={(e) => setOn(e.target.value)}
              required
            />
          </Field>
          {action.kind === "release" && (
            <>
              <Field label="Approved by" hint="Defaults to you.">
                <select
                  className={inputCls}
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                >
                  <option value="">Me</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effective on" hint="Leave empty to take effect when approved.">
                <input
                  type="date"
                  className={inputCls}
                  min={on}
                  value={effectiveOn}
                  onChange={(e) => setEffectiveOn(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field
            label={
              action.kind === "release"
                ? d.releasedRevision === null
                  ? "What it covers (optional)"
                  : `What changed since rev ${d.releasedRevision}`
                : action.kind === "review"
                  ? "What was checked (optional)"
                  : "Why it is withdrawn"
            }
          >
            <textarea
              className={inputCls}
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required={
                action.kind === "obsolete" ||
                (action.kind === "release" && d.releasedRevision !== null)
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className={btnCls} disabled={submit.isPending}>
              {action.kind === "release"
                ? `Release rev ${d.revision}`
                : action.kind === "review"
                  ? "Record review"
                  : "Withdraw"}
            </button>
          </div>
          <ErrorText error={submit.error} />
        </form>
      )}
    </Card>
  );
}

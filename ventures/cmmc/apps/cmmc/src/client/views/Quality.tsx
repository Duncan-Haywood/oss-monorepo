// ISO 9001:2015 clause checklist on the same evidence as the CMMC requirements.
// Everyone reads it; recording needs the Level 2 + Quality plan (the server's 402 is the gate).
import {
  ISO9001_SECTIONS,
  type Iso9001Section,
  QUALITY_STATUS_LABEL,
  QUALITY_STATUSES,
  type QualityChecklistResponse,
  type QualityClauseDto,
  type QualityStatus,
} from "@shared/quality";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Evidence, Member, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

const TONE: Record<QualityStatus, string> = {
  not_assessed: "bg-stone-100 text-stone-700",
  gap: "bg-red-50 text-red-800",
  partial: "bg-amber-50 text-amber-800",
  in_place: "bg-emerald-50 text-emerald-800",
  not_applicable: "bg-sky-50 text-sky-800",
};

function QBadge({ status }: { status: QualityStatus }) {
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONE[status]}`}
    >
      {QUALITY_STATUS_LABEL[status]}
    </span>
  );
}

export function QualityView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ["quality", orgId],
    queryFn: () => api<QualityChecklistResponse>(`/api/orgs/${orgId}/quality`),
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const memberList = members.data?.items ?? [];
  const canRecord = info.plan.quality && info.role !== "viewer";
  const r = data.data?.readiness;
  const current = data.data?.items.find((i) => i.id === selected) ?? null;
  return (
    <div className="space-y-4">
      {!info.plan.quality && <QualityReadOnly info={info} onUpgrade={onUpgrade} />}
      <Card
        title="ISO 9001:2015 self-check"
        actions={
          <a className={btnGhostCls} href={`/api/orgs/${orgId}/quality/report`}>
            Download gap report
          </a>
        }
      >
        <p className="text-sm text-stone-700">
          One row per requirement clause, on the same evidence as your CMMC requirements: a training
          record attached to AT.L2-3.2.2 shows up under 7.2 without a second upload. This is your
          own check before a certification body's audit; only an accredited registrar certifies.
        </p>
        {data.data && (
          <p className="mt-2 text-xs text-stone-500">
            {data.data.verification.note}
            {!data.data.verification.checkedAgainstCopy &&
              " The clause list has not yet been checked against a copy of the standard."}
          </p>
        )}
        <ErrorText error={data.error} />
        {r && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <Stat
              label="In place"
              value={r.percentInPlace === null ? "–" : `${r.percentInPlace}%`}
            />
            <Stat label="Gaps" value={String(r.gaps)} />
            <Stat label="Partly in place" value={String(r.partial)} />
            <Stat label="Not assessed" value={String(r.notAssessed)} />
            <Stat label="Not applicable" value={String(r.notApplicable)} />
          </dl>
        )}
        {r && r.inPlaceWithoutEvidence.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            In place but no evidence file yet: {r.inPlaceWithoutEvidence.join(", ")}.
          </p>
        )}
        {r && r.openWithoutOwner.length > 0 && (
          <p className="mt-1 text-sm text-stone-700">
            Open with no owner yet: {r.openWithoutOwner.join(", ")}. Pick an owner on each clause so
            someone is answerable for closing it.
          </p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Clauses">
          {!data.data && !data.error && <p className="text-sm text-stone-600">Loading…</p>}
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            {(Object.keys(ISO9001_SECTIONS) as Iso9001Section[]).map((sec) => {
              const rows = (data.data?.items ?? []).filter((i) => i.section === sec);
              if (!rows.length) return null;
              return (
                <div key={sec}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {sec} {ISO9001_SECTIONS[sec]}
                  </h3>
                  <ul className="divide-y divide-stone-100">
                    {rows.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(c.id)}
                          aria-current={selected === c.id ? "true" : undefined}
                          className={`flex w-full items-start justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-stone-50 ${selected === c.id ? "bg-brand-50" : ""}`}
                        >
                          <span className="min-w-0">
                            <span className="font-mono text-xs text-stone-500">{c.number}</span>{" "}
                            {c.title}
                            {c.evidence.length > 0 && (
                              <span className="ml-1 text-xs text-stone-500">
                                ({c.evidence.length} file{c.evidence.length === 1 ? "" : "s"})
                              </span>
                            )}
                          </span>
                          <QBadge status={c.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
        {current ? (
          <ClauseDetail
            key={current.id}
            orgId={orgId}
            clause={current}
            canRecord={canRecord}
            members={memberList}
          />
        ) : (
          <Card>
            <p className="text-sm text-stone-600">Choose a clause to record its status.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 p-2">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="text-lg font-semibold text-stone-900">{value}</dd>
    </div>
  );
}

function QualityReadOnly({ info, onUpgrade }: { info: OrgInfo; onUpgrade: () => void }) {
  const isAdmin = info.role === "owner" || info.role === "admin";
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
    >
      <p>
        <strong>The ISO 9001 checklist is read only on the {info.plan.name} plan.</strong> You can
        read every clause and see which of your CMMC evidence files would count. Recording status,
        notes and links needs the Level 2 + Quality plan.
      </p>
      {isAdmin ? (
        <button type="button" className={btnCls} onClick={onUpgrade}>
          See plans
        </button>
      ) : (
        <span className="text-xs text-stone-600">
          Ask an admin of this organization to upgrade.
        </span>
      )}
    </div>
  );
}

function ClauseDetail({
  orgId,
  clause,
  canRecord,
  members,
}: {
  orgId: string;
  clause: QualityClauseDto;
  canRecord: boolean;
  members: Member[];
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<QualityStatus>(clause.status);
  const [notes, setNotes] = useState(clause.notes);
  useEffect(() => {
    setStatus(clause.status);
    setNotes(clause.notes);
  }, [clause.status, clause.notes]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["quality", orgId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/quality/${clause.id}`, {
        method: "PATCH",
        json: { status, notes },
      }),
    onSuccess: refresh,
  });
  // The owner saves on change, like a requirement's owner; status and notes wait for Save.
  const setOwner = useMutation({
    mutationFn: (ownerUserId: string | null) =>
      api(`/api/orgs/${orgId}/quality/${clause.id}`, {
        method: "PATCH",
        json: { ownerUserId },
      }),
    onSuccess: refresh,
  });
  const ownerName = clause.ownerUserId
    ? (members.find((m) => m.userId === clause.ownerUserId)?.name ?? null)
    : null;
  const files = useQuery({
    queryKey: ["evidence", orgId, "all"],
    queryFn: () => api<{ items: Evidence[] }>(`/api/orgs/${orgId}/evidence`),
    enabled: canRecord,
  });
  const [pick, setPick] = useState("");
  const link = useMutation({
    mutationFn: (evidenceId: string) =>
      api(`/api/orgs/${orgId}/quality/${clause.id}/evidence`, {
        method: "POST",
        json: { evidenceId },
      }),
    onSuccess: () => {
      setPick("");
      return refresh();
    },
  });
  const unlink = useMutation({
    mutationFn: (linkId: string) =>
      api(`/api/orgs/${orgId}/quality/links/${linkId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const [file, setFile] = useState<File | null>(null);
  const [noCui, setNoCui] = useState(false);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", file.name);
      fd.set("noCui", noCui ? "true" : "false");
      const created = await api<Evidence>(`/api/orgs/${orgId}/evidence`, {
        method: "POST",
        body: fd,
      });
      await api(`/api/orgs/${orgId}/quality/${clause.id}/evidence`, {
        method: "POST",
        json: { evidenceId: created.id },
      });
    },
    onSuccess: () => {
      setFile(null);
      setNoCui(false);
      qc.invalidateQueries({ queryKey: ["evidence", orgId] });
      return refresh();
    },
  });
  const linked = new Set(clause.evidence.map((e) => e.id));
  const linkable = (files.data?.items ?? []).filter((f) => !linked.has(f.id));
  return (
    <Card title={`${clause.number} ${clause.title}`}>
      <div className="space-y-4">
        <div className="text-sm text-stone-700">
          <p>
            <span className="font-medium">What shops usually keep:</span> {clause.prompt}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Our reminder, not the standard's text. Read clause {clause.number} in your copy of ISO
            9001:2015.
          </p>
          {clause.relatedControls.length > 0 && (
            <p className="mt-1 text-xs text-stone-600">
              Evidence on {clause.relatedControls.join(", ")} often serves this clause too and is
              listed below. Meeting one never means meeting the other.
            </p>
          )}
          {clause.oftenExcluded && (
            <p className="mt-1 text-xs text-stone-600">
              Build-to-print shops often mark this not applicable, with the reason in their scope
              statement (4.3).
            </p>
          )}
        </div>
        {canRecord ? (
          <div>
            <Field label="Owner" hint="Who keeps this clause's records and closes its gaps.">
              <select
                className={inputCls}
                value={clause.ownerUserId ?? ""}
                disabled={setOwner.isPending}
                onChange={(e) => setOwner.mutate(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <ErrorText error={setOwner.error} />
          </div>
        ) : (
          <p className="text-sm">Owner: {ownerName ?? "Unassigned"}</p>
        )}
        {canRecord ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Status">
              <select
                className={inputCls}
                value={status}
                onChange={(e) => setStatus(e.target.value as QualityStatus)}
              >
                {QUALITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUALITY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Notes"
              hint={
                status === "not_applicable"
                  ? "Say why it does not apply: the scope statement has to give the reason."
                  : "Where the record lives, who owns it, what is missing."
              }
            >
              <textarea
                className={inputCls}
                rows={4}
                value={notes}
                maxLength={8000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <ErrorText error={save.error} />
            <button type="submit" className={btnCls} disabled={save.isPending}>
              Save
            </button>
          </form>
        ) : (
          <div className="space-y-1 text-sm">
            <p>
              Status: <QBadge status={clause.status} />
            </p>
            {clause.notes && <p className="whitespace-pre-wrap text-stone-700">{clause.notes}</p>}
          </div>
        )}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-stone-900">
            Evidence ({clause.evidence.length})
          </h3>
          {clause.evidence.length === 0 && <p className="text-sm text-stone-600">No files yet.</p>}
          <ul className="space-y-1 text-sm">
            {clause.evidence.map((e) => (
              <li key={`${e.via}-${e.id}`} className="flex flex-wrap items-center gap-2">
                <a
                  className="text-brand-700 underline"
                  href={`/api/orgs/${orgId}/evidence/${e.id}/download`}
                >
                  {e.title}
                </a>
                <span className="text-xs text-stone-500">
                  {e.via === "clause" ? "linked to this clause" : `from ${e.via}`}
                </span>
                {canRecord && e.linkId && (
                  <button
                    type="button"
                    className="text-xs text-stone-600 underline"
                    onClick={() => e.linkId && unlink.mutate(e.linkId)}
                  >
                    Unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ErrorText error={unlink.error} />
        </div>
        {canRecord && (
          <div className="space-y-3 border-t border-stone-100 pt-3">
            <Field label="Link a file you already uploaded">
              <div className="flex flex-wrap gap-2">
                <select
                  className={`${inputCls} min-w-0 flex-1`}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">Choose a file…</option>
                  {linkable.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                      {f.controlId ? ` (${f.controlId})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={btnGhostCls}
                  disabled={!pick || link.isPending}
                  onClick={() => link.mutate(pick)}
                >
                  Link
                </button>
              </div>
            </Field>
            <ErrorText error={link.error} />
            <Field label="Or upload a new file for this clause" hint="Up to 25 MB.">
              <input
                type="file"
                className="block w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-label="Evidence file"
              />
            </Field>
            <label className="flex items-start gap-2 text-xs text-stone-700">
              <input type="checkbox" checked={noCui} onChange={(e) => setNoCui(e.target.checked)} />
              This file contains no Controlled Unclassified Information (CUI).
            </label>
            <ErrorText error={upload.error} />
            <button
              type="button"
              className={btnGhostCls}
              disabled={!file || !noCui || upload.isPending}
              onClick={() => upload.mutate()}
            >
              Upload and link
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

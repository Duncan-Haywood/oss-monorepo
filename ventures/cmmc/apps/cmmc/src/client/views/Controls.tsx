import type { ImplementationStatus, PartialCreditKey } from "@shared/controls";
import { IMPLEMENTATION_STATUSES, PARTIAL_CREDIT_RULES } from "@shared/controls";
import type { ObjectiveResult } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ControlRecord, ControlView, Evidence, Member, OrgInfo, PoamItem } from "../lib/types";
import { Badge, btnCls, btnGhostCls, Card, ErrorText, Field, inputCls, STATUS_LABEL } from "../ui";
import { ControlImport } from "./ControlImport";

/** "Carried by Microsoft 365 GCC High; shared with your MSP", or "" when no provider carries it. */
function providerLine(providers: ControlView["providers"]): string {
  const names = (r: "provider" | "shared") =>
    (providers ?? [])
      .filter((p) => p.responsibility === r)
      .map((p) => p.name)
      .join(", ");
  const parts: string[] = [];
  if (names("provider")) parts.push(`Carried by ${names("provider")}`);
  if (names("shared")) parts.push(`${parts.length ? "shared" : "Shared"} with ${names("shared")}`);
  return parts.join("; ");
}

export function ControlsView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const [level, setLevel] = useState<1 | 2>(info.profile.targetLevel === 1 ? 1 : 2);
  const [filter, setFilter] = useState<ImplementationStatus | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const list = useQuery({
    queryKey: ["controls", orgId, level],
    queryFn: () => api<{ items: ControlView[] }>(`/api/orgs/${orgId}/controls?level=${level}`),
  });
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data?.items ?? []).filter((c) => {
      const status = c.record?.status ?? "not_assessed";
      if (filter !== "all" && status !== filter) return false;
      return (
        !needle || c.id.toLowerCase().includes(needle) || c.text.toLowerCase().includes(needle)
      );
    });
  }, [list.data, filter, q]);
  // On a plan without Level 2 (the free Level 1 plan, or a lapsed subscription) Level 2 is read only:
  // the requirements, objectives and anything already recorded stay visible, the forms do not show.
  const readOnlyLevel2 = level === 2 && !info.plan.level2;
  return (
    <div className="space-y-4">
      {readOnlyLevel2 && <Level2ReadOnly info={info} onUpgrade={onUpgrade} />}
      {importing && (
        <ControlImport
          orgId={orgId}
          level={level}
          canApply={!readOnlyLevel2}
          onClose={() => setImporting(false)}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card
          title={`Level ${level} requirements`}
          actions={
            <div className="flex items-center gap-2">
              {info.role !== "viewer" && !importing && (
                <button type="button" className={btnGhostCls} onClick={() => setImporting(true)}>
                  Import spreadsheet
                </button>
              )}
              <select
                className="rounded border border-stone-300 px-2 py-1 text-sm"
                value={level}
                onChange={(e) => {
                  setLevel(Number(e.target.value) as 1 | 2);
                  setSelected(null);
                }}
                aria-label="Level"
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
              </select>
            </div>
          }
        >
          <div className="mb-3 flex gap-2">
            <input
              className={inputCls}
              placeholder="Search id or text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search"
            />
            <select
              className="rounded border border-stone-300 px-2 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ImplementationStatus | "all")}
              aria-label="Status filter"
            >
              <option value="all">All</option>
              {IMPLEMENTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <ErrorText error={list.error} />
          <ul className="max-h-[70vh] divide-y divide-stone-100 overflow-y-auto">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`w-full px-2 py-2 text-left hover:bg-stone-50 ${selected === c.id ? "bg-brand-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-stone-700">
                      {c.id}
                      {c.weight !== null ? ` · ${c.weight} pt` : ""}
                    </span>
                    <Badge status={c.record?.status ?? "not_assessed"} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-stone-800">{c.text}</p>
                  {c.record?.draftStatement && (
                    <p className="mt-1 text-xs text-amber-700">AI draft awaiting review</p>
                  )}
                  {providerLine(c.providers) && (
                    <p className="mt-1 text-xs text-stone-600">{providerLine(c.providers)}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {selected ? (
          <ControlDetail
            key={selected}
            orgId={orgId}
            controlId={selected}
            canEdit={info.role !== "viewer" && !readOnlyLevel2}
          />
        ) : (
          <Card>
            <p className="text-sm text-stone-600">Select a requirement.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Level2ReadOnly({ info, onUpgrade }: { info: OrgInfo; onUpgrade: () => void }) {
  const isAdmin = info.role === "owner" || info.role === "admin";
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
    >
      <p>
        <strong>Level 2 is read only on the {info.plan.name} plan.</strong> You can read all 110
        requirements and their 320 assessment objectives, and anything already recorded stays
        readable. Recording status, notes, drafts and evidence for Level 2 needs the Level 2 plan.
      </p>
      {isAdmin ? (
        <button type="button" className={btnCls} onClick={onUpgrade}>
          See Level 2 plans
        </button>
      ) : (
        <span className="text-xs text-stone-600">
          Ask an admin of this organization to upgrade.
        </span>
      )}
    </div>
  );
}

type Detail = ControlView & { evidence: Evidence[]; poam: PoamItem[] };

function ControlDetail({
  orgId,
  controlId,
  canEdit,
}: {
  orgId: string;
  controlId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const path = `/api/orgs/${orgId}/controls/${controlId}`;
  const detail = useQuery({
    queryKey: ["control", orgId, controlId],
    queryFn: () => api<Detail>(path),
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["control", orgId, controlId] });
    qc.invalidateQueries({ queryKey: ["controls", orgId] });
    qc.invalidateQueries({ queryKey: ["score", orgId] });
  };
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<ControlRecord>(path, { method: "PATCH", json: patch }),
    onSuccess: refresh,
  });
  const draft = useMutation({
    mutationFn: () => api<ControlRecord>(`${path}/draft`, { method: "POST" }),
    onSuccess: refresh,
  });
  const accept = useMutation({
    mutationFn: (statement: string) =>
      api<ControlRecord>(`${path}/draft/accept`, { method: "POST", json: { statement } }),
    onSuccess: refresh,
  });
  const rec = detail.data?.record;
  const [notes, setNotes] = useState("");
  const [statement, setStatement] = useState("");
  const [draftText, setDraftText] = useState("");
  useEffect(() => {
    setNotes(rec?.notes ?? "");
    setStatement(rec?.statement ?? "");
    setDraftText(rec?.draftStatement ?? "");
  }, [rec?.notes, rec?.statement, rec?.draftStatement]);

  if (detail.isLoading)
    return (
      <Card>
        <p className="text-sm">Loading…</p>
      </Card>
    );
  if (!detail.data)
    return (
      <Card>
        <ErrorText error={detail.error} />
      </Card>
    );
  const c = detail.data;
  const status = rec?.status ?? "not_assessed";
  const partialRules = PARTIAL_CREDIT_RULES.filter(
    (r) => c.level === 2 && c.nistIds.includes(r.nistId),
  );
  const results = rec?.objectiveResults ?? {};

  return (
    <div className="space-y-4">
      <Card title={c.id}>
        <p className="text-xs text-stone-500">
          {c.familyName} · {c.ref}
          {c.weight !== null ? ` · DoD point value ${c.weight || "none (SSP)"}` : ""}
        </p>
        <p className="mt-2 text-sm text-stone-900">{c.text}</p>
        {providerLine(c.providers) && (
          <p className="mt-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
            <strong>External service providers:</strong> {providerLine(c.providers)}, as marked from
            their customer responsibility matrices on the Providers tab. The SSP prints this line on
            the requirement; an assessor still checks your part of it.
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select
              className={inputCls}
              disabled={!canEdit}
              value={status}
              onChange={(e) => save.mutate({ status: e.target.value })}
            >
              {IMPLEMENTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select
              className={inputCls}
              disabled={!canEdit}
              value={rec?.ownerUserId ?? ""}
              onChange={(e) => save.mutate({ ownerUserId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {members.data?.items.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {status === "partially_implemented" && partialRules.length > 0 && (
            <Field
              label="Partial credit (DoD Assessment Methodology)"
              hint="Only this case scores 3 instead of 5."
            >
              <select
                className={inputCls}
                disabled={!canEdit}
                value={rec?.partialCredit ?? ""}
                onChange={(e) =>
                  save.mutate({
                    partialCredit: (e.target.value || null) as PartialCreditKey | null,
                  })
                }
              >
                <option value="">None (full deduction)</option>
                {partialRules.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <ErrorText error={save.error} />
      </Card>

      <Card title={`Assessment objectives (${c.objectives.length})`}>
        <ul className="space-y-2">
          {c.objectives.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 text-sm">
              <span>
                <span className="font-mono text-xs text-stone-500">{o.id}</span> Determine if{" "}
                {o.text}
              </span>
              <select
                className="rounded border border-stone-300 px-1 py-0.5 text-xs"
                disabled={!canEdit}
                aria-label={`Result for ${o.id}`}
                value={results[o.id] ?? ""}
                onChange={(e) =>
                  e.target.value &&
                  save.mutate({ objectiveResults: { [o.id]: e.target.value as ObjectiveResult } })
                }
              >
                <option value="">—</option>
                <option value="met">Met</option>
                <option value="not_met">Not met</option>
                <option value="not_applicable">N/A</option>
              </select>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Implementation">
        <div className="space-y-3">
          <Field label="Your notes (what you actually do; the AI drafts only from these and your system profile)">
            <textarea
              className={inputCls}
              rows={3}
              disabled={!canEdit}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (rec?.notes ?? "") && save.mutate({ notes })}
            />
          </Field>
          <Field label="Implementation statement (goes in the SSP)">
            <textarea
              className={inputCls}
              rows={5}
              disabled={!canEdit}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              onBlur={() => statement !== (rec?.statement ?? "") && save.mutate({ statement })}
            />
          </Field>
          {canEdit && (
            <button
              type="button"
              className={btnGhostCls}
              disabled={draft.isPending}
              onClick={() => draft.mutate()}
            >
              {draft.isPending ? "Drafting…" : "Draft with AI"}
            </button>
          )}
          <ErrorText error={draft.error ?? accept.error} />
          {rec?.draftStatement !== null && rec?.draftStatement !== undefined && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                AI draft — not reviewed. Edit, then accept. Replace every [CONFIRM: …] with facts.
              </p>
              <textarea
                className={inputCls}
                rows={6}
                disabled={!canEdit}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              {(rec.draftQuestions?.length ?? 0) > 0 && (
                <ul className="mt-2 list-disc pl-4 text-sm text-amber-900">
                  {rec.draftQuestions?.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={btnCls}
                    disabled={accept.isPending || draftText.includes("[CONFIRM:")}
                    onClick={() => accept.mutate(draftText)}
                  >
                    Accept as statement
                  </button>
                  <button
                    type="button"
                    className={btnGhostCls}
                    onClick={() => save.mutate({ draftStatement: null })}
                  >
                    Discard draft
                  </button>
                </div>
              )}
              {draftText.includes("[CONFIRM:") && (
                <p className="mt-1 text-xs text-amber-800">
                  Resolve the [CONFIRM: …] placeholders before accepting.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <EvidencePanel
        orgId={orgId}
        controlId={controlId}
        items={c.evidence}
        canEdit={canEdit}
        onChange={refresh}
      />
    </div>
  );
}

function EvidencePanel({
  orgId,
  controlId,
  items,
  canEdit,
  onChange,
}: {
  orgId: string;
  controlId: string;
  items: Evidence[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [noCui, setNoCui] = useState(false);
  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      fd.set("title", title);
      fd.set("controlId", controlId);
      fd.set("noCui", String(noCui));
      return api<Evidence>(`/api/orgs/${orgId}/evidence`, { method: "POST", body: fd });
    },
    onSuccess: () => {
      setFile(null);
      setTitle("");
      setNoCui(false);
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/evidence/${id}`, { method: "DELETE" }),
    onSuccess: onChange,
  });
  return (
    <Card title={`Evidence (${items.length})`}>
      <ul className="mb-3 divide-y divide-stone-100 text-sm">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
            <a
              className="text-brand-600 underline"
              href={`/api/orgs/${orgId}/evidence/${e.id}/download`}
            >
              {e.title}
            </a>
            <span className="text-xs text-stone-500">
              {(e.sizeBytes / 1024).toFixed(0)} KB · sha256 {e.sha256.slice(0, 10)}…
            </span>
            {canEdit && (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => remove.mutate(e.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
        >
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Evidence file"
          />
          <input
            className={inputCls}
            placeholder="Title (e.g. Access control policy v2)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={noCui}
              onChange={(e) => setNoCui(e.target.checked)}
              className="mt-1"
            />
            <span>
              This file contains no Controlled Unclassified Information (CUI). This workspace is not
              a CUI enclave: upload policies, procedures and redacted screenshots, not CUI itself.
            </span>
          </label>
          <ErrorText error={upload.error} />
          <button type="submit" className={btnCls} disabled={!file || !noCui || upload.isPending}>
            Upload
          </button>
        </form>
      )}
    </Card>
  );
}

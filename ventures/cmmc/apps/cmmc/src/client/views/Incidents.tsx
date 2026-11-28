// Cyber incident register: the DFARS 252.204-7012 72-hour report clock and 90-day image hold, the
// paragraph-by-paragraph checklist and a timeline, per incident (IR.L2-3.6.1, 3.6.2). Clocks, stage
// and checks come from the server (@shared/incidents); this view shows them in the browser's own time
// zone and edits the rows. Times go to the server as UTC instants.
import {
  type Affects,
  type ClauseAnswer,
  fmtDuration,
  type IncidentClocks,
  type IncidentIssue,
  type IncidentRole,
  type IncidentStage,
  type TimelineEntry,
  type Tri,
} from "@shared/incidents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface IncidentItem {
  id: string;
  title: string;
  clause: ClauseAnswer;
  affects: Affects;
  role: IncidentRole;
  higherTier: string;
  contractRef: string;
  discoveredAt: string;
  reportedAt: string | null;
  reportNumber: string;
  higherTierNotifiedAt: string | null;
  malware: Tri;
  cloud: Tri;
  systems: string;
  summary: string;
  steps: Record<string, boolean>;
  timeline: TimelineEntry[];
  closedOn: string | null;
  lessons: string;
  stage: IncidentStage;
  clocks: IncidentClocks;
  applicability: { required: boolean | null; reason: string };
  checklist: { id: string; cite: string; title: string; detail: string; done: boolean }[];
  issues: IncidentIssue[];
}

type Opt<K extends string> = { key: K; label: string }[];
export interface IncidentsResponse {
  now: string;
  items: IncidentItem[];
  clauseOptions: Opt<ClauseAnswer>;
  affectsOptions: Opt<Affects>;
  roleOptions: Opt<IncidentRole>;
  triOptions: Opt<Tri>;
  stageLabels: Record<IncidentStage, string>;
  quotes: { rapidly: string; report: string; preserve: string; malware: string };
  verification: { source: string; url: string; readOn: string; note: string };
}

/** An instant as the browser's own wall clock for <input type="datetime-local">. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** <input type="datetime-local"> (the browser's time zone) to a UTC instant; blank is null. */
export function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const local = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

const STAGE_TONE: Record<IncidentStage, string> = {
  report: "bg-red-50 text-red-800",
  not_owed: "bg-stone-100 text-stone-700",
  preserve: "bg-amber-50 text-amber-900",
  open: "bg-blue-50 text-blue-800",
  closed: "bg-green-50 text-green-800",
};

const EMPTY = {
  title: "",
  clause: "unsure" as ClauseAnswer,
  affects: "unsure" as Affects,
  role: "prime" as IncidentRole,
  higherTier: "",
  contractRef: "",
  discoveredAt: "",
  reportedAt: "",
  reportNumber: "",
  higherTierNotifiedAt: "",
  malware: "unknown" as Tri,
  cloud: "unknown" as Tri,
  systems: "",
  summary: "",
  closedOn: "",
  lessons: "",
};
type Form = typeof EMPTY;

/** The report clock in words, as the front door says it. */
export function clockLine(i: Pick<IncidentItem, "clocks" | "reportedAt" | "stage">): string {
  const c = i.clocks;
  if (i.reportedAt && c.reportedAfterMs !== null)
    return `Reported ${local(i.reportedAt)}, ${fmtDuration(c.reportedAfterMs)} after discovery${
      c.reportedLate ? ": later than 72 hours" : ", inside the 72 hours"
    }. Keep images until at least ${local(c.preserveUntil)}.`;
  if (i.stage === "not_owed") return `A 7012 report would have been due ${local(c.reportDue)}.`;
  if (c.overdue)
    return `The 72 hours ran out ${local(c.reportDue)} (${fmtDuration(-(c.msLeft ?? 0))} ago). Report now.`;
  return `Report to DIBNet by ${local(c.reportDue)}: ${fmtDuration(c.msLeft ?? 0)} left.`;
}

export function IncidentsView({ orgId, info }: { orgId: string; info: OrgInfo }) {
  const qc = useQueryClient();
  const canEdit = info.role !== "viewer";
  const isAdmin = info.role === "owner" || info.role === "admin";
  const key = ["incidents", orgId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<IncidentsResponse>(`/api/orgs/${orgId}/incidents`),
    // The countdown is computed on the server; refresh it each minute while the tab is open.
    refetchInterval: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState<Record<string, { at: string; text: string }>>({});
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
    setShowForm(false);
  };
  const body = () => ({
    title: form.title,
    clause: form.clause,
    affects: form.affects,
    role: form.role,
    higherTier: form.higherTier,
    contractRef: form.contractRef,
    discoveredAt: fromLocalInput(form.discoveredAt) ?? "",
    reportedAt: fromLocalInput(form.reportedAt),
    reportNumber: form.reportNumber,
    higherTierNotifiedAt: fromLocalInput(form.higherTierNotifiedAt),
    malware: form.malware,
    cloud: form.cloud,
    systems: form.systems,
    summary: form.summary,
    closedOn: form.closedOn || null,
    lessons: form.lessons,
  });
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/incidents/${editing}`, { method: "PATCH", json: body() })
        : api(`/api/orgs/${orgId}/incidents`, { method: "POST", json: body() }),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, json }: { id: string; json: unknown }) =>
      api(`/api/orgs/${orgId}/incidents/${id}`, { method: "PATCH", json }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/incidents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const startEdit = (i: IncidentItem) => {
    setEditing(i.id);
    setShowForm(true);
    setForm({
      title: i.title,
      clause: i.clause,
      affects: i.affects,
      role: i.role,
      higherTier: i.higherTier,
      contractRef: i.contractRef,
      discoveredAt: toLocalInput(i.discoveredAt),
      reportedAt: toLocalInput(i.reportedAt),
      reportNumber: i.reportNumber,
      higherTierNotifiedAt: toLocalInput(i.higherTierNotifiedAt),
      malware: i.malware,
      cloud: i.cloud,
      systems: i.systems,
      summary: i.summary,
      closedOn: i.closedOn ?? "",
      lessons: i.lessons,
    });
  };
  const data = list.data;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const select = <K extends "clause" | "affects" | "role" | "malware" | "cloud">(
    k: K,
    opts: Opt<Form[K]> | undefined,
  ) => (
    <select
      className={inputCls}
      value={form[k]}
      onChange={(e) => set(k, e.target.value as Form[K])}
    >
      {(opts ?? []).map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const when = (k: "discoveredAt" | "reportedAt" | "higherTierNotifiedAt") => (
    <input
      type="datetime-local"
      className={inputCls}
      value={form[k]}
      onChange={(e) => set(k, e.target.value)}
    />
  );

  return (
    <div className="space-y-4">
      <Card
        title="Cyber incidents (DFARS 252.204-7012)"
        actions={
          <div className="flex gap-2">
            {data && data.items.length > 0 && (
              <a className={btnGhostCls} href={`/api/orgs/${orgId}/incidents/export.csv`}>
                Download CSV
              </a>
            )}
            {canEdit && !showForm && (
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  setForm({ ...EMPTY, discoveredAt: toLocalInput(new Date().toISOString()) });
                  setShowForm(true);
                }}
              >
                Record an incident
              </button>
            )}
          </div>
        }
      >
        <p className="text-sm text-stone-700">
          If your contract carries DFARS 252.204-7012 and an incident touches a system holding
          covered defense information, you report it at{" "}
          <a className="underline" href="https://dibnet.dod.mil" rel="noreferrer" target="_blank">
            dibnet.dod.mil
          </a>{" "}
          within 72 hours of discovery and keep images of the affected systems for at least 90 days
          after you report. Record the incident here the moment you find it: the clock starts at
          discovery, not when the review ends. This register is the tracking and documentation NIST
          SP 800-171 3.6.2 asks for; it files nothing with DoD.
        </p>
        <blockquote className="mt-2 border-l-2 border-stone-300 pl-3 text-xs text-stone-600">
          {data?.quotes.rapidly} {data?.quotes.report}
        </blockquote>
        {data && (
          <p className="mt-2 text-xs text-stone-500">
            {data.verification.note}{" "}
            <a className="underline" href={data.verification.url} rel="noreferrer" target="_blank">
              The clause
            </a>
            . Times are shown in this browser's time zone.
          </p>
        )}
        <ErrorText error={list.error} />
      </Card>

      {showForm && canEdit && (
        <Card title={editing ? "Edit incident" : "New incident"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="What happened, in a few words">
              <input
                className={inputCls}
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
            <Field label="Discovered at" hint="Discovery starts the 72-hour clock.">
              {when("discoveredAt")}
            </Field>
            <Field label="Is 252.204-7012 in the contract or subcontract?">
              {select("clause", data?.clauseOptions)}
            </Field>
            <Field label="What did it affect?">{select("affects", data?.affectsOptions)}</Field>
            <Field label="Contract or PO">
              <input
                className={inputCls}
                value={form.contractRef}
                onChange={(e) => set("contractRef", e.target.value)}
              />
            </Field>
            <Field label="Your role">{select("role", data?.roleOptions)}</Field>
            {form.role === "sub" && (
              <>
                <Field
                  label="Prime or next higher tier"
                  hint="Gets your report number, (m)(2)(ii)."
                >
                  <input
                    className={inputCls}
                    value={form.higherTier}
                    onChange={(e) => set("higherTier", e.target.value)}
                  />
                </Field>
                <Field label="Report number given to them at">{when("higherTierNotifiedAt")}</Field>
              </>
            )}
            <Field label="Reported to DIBNet at" hint="Leave empty until filed.">
              {when("reportedAt")}
            </Field>
            <Field label="DoD incident report number">
              <input
                className={inputCls}
                value={form.reportNumber}
                onChange={(e) => set("reportNumber", e.target.value)}
              />
            </Field>
            <Field label="Malicious software isolated?">
              {select("malware", data?.triOptions)}
            </Field>
            <Field label="Does a cloud provider hold CDI for you?">
              {select("cloud", data?.triOptions)}
            </Field>
            <Field label="Summary" hint="Short and factual. Mark anything proprietary, (h).">
              <textarea
                className={inputCls}
                rows={3}
                value={form.summary}
                onChange={(e) => set("summary", e.target.value)}
              />
            </Field>
            <Field label="Affected systems" hint="Computers, servers, accounts, data: (c)(1)(i).">
              <textarea
                className={inputCls}
                rows={3}
                value={form.systems}
                onChange={(e) => set("systems", e.target.value)}
              />
            </Field>
            <Field
              label="Closed on"
              hint="When handling finished. Keep the images for the 90 days."
            >
              <input
                type="date"
                className={inputCls}
                value={form.closedOn}
                onChange={(e) => set("closedOn", e.target.value)}
              />
            </Field>
            <Field label="Lessons learned">
              <textarea
                className={inputCls}
                rows={2}
                value={form.lessons}
                onChange={(e) => set("lessons", e.target.value)}
              />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save" : "Record incident"}
              </button>
              <button type="button" className={btnGhostCls} onClick={reset}>
                Cancel
              </button>
            </div>
            <div className="sm:col-span-2">
              <ErrorText error={save.error} />
            </div>
          </form>
        </Card>
      )}

      {data && data.items.length === 0 && !showForm && (
        <Card>
          <p className="text-sm text-stone-600">
            No incidents recorded. Before you need it: get a DoD-approved medium assurance
            certificate (paragraph (c)(3)), since you cannot file on DIBNet without one, and say in
            your SSP who files and who holds it.
          </p>
        </Card>
      )}

      {data?.items.map((i) => {
        const n = note[i.id] ?? { at: "", text: "" };
        return (
          <Card
            key={i.id}
            title={i.title}
            actions={
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_TONE[i.stage]}`}>
                {data.stageLabels[i.stage]}
              </span>
            }
          >
            <p
              className={`text-sm ${i.stage === "report" && i.clocks.overdue ? "font-semibold text-red-800" : "text-stone-800"}`}
            >
              Discovered {local(i.discoveredAt)}. {clockLine(i)}
            </p>
            {i.reportNumber && (
              <p className="text-sm text-stone-700">DoD report number: {i.reportNumber}</p>
            )}
            <p className="mt-1 text-xs text-stone-600">{i.applicability.reason}</p>
            {i.issues.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {i.issues.map((x) => (
                  <li key={x.kind}>{x.message}</li>
                ))}
              </ul>
            )}
            <h3 className="mt-3 text-sm font-semibold text-stone-900">Checklist</h3>
            <ul className="mt-1 space-y-1">
              {i.checklist.map((s) => (
                <li key={s.id} className="text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={s.done}
                      disabled={!canEdit || patch.isPending}
                      onChange={(e) =>
                        patch.mutate({
                          id: i.id,
                          json: { steps: { ...i.steps, [s.id]: e.target.checked } },
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">{s.title}</span>{" "}
                      <span className="text-stone-500">{s.cite}</span>
                      <span className="block text-xs text-stone-600">{s.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <h3 className="mt-3 text-sm font-semibold text-stone-900">Timeline</h3>
            {i.timeline.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-sm">
                {[...i.timeline]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((e) => (
                    <li key={`${e.at}-${e.text}`}>
                      <span className="text-stone-500">{local(e.at)}</span> {e.text}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-600">
                Write down what happened and when, as it happens: a late report or a rebuilt machine
                is easier to explain with a timeline written at the time.
              </p>
            )}
            {canEdit && (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const at = fromLocalInput(n.at || toLocalInput(new Date().toISOString()));
                  if (!at || !n.text.trim()) return;
                  patch.mutate(
                    { id: i.id, json: { timeline: [...i.timeline, { at, text: n.text.trim() }] } },
                    { onSuccess: () => setNote((m) => ({ ...m, [i.id]: { at: "", text: "" } })) },
                  );
                }}
              >
                <input
                  type="datetime-local"
                  aria-label="When"
                  className={`${inputCls} sm:w-56`}
                  value={n.at}
                  onChange={(e) => setNote((m) => ({ ...m, [i.id]: { ...n, at: e.target.value } }))}
                />
                <input
                  aria-label="What happened"
                  placeholder="What happened (blank time = now)"
                  maxLength={1000}
                  className={`${inputCls} flex-1`}
                  value={n.text}
                  onChange={(e) =>
                    setNote((m) => ({ ...m, [i.id]: { ...n, text: e.target.value } }))
                  }
                />
                <button type="submit" className={btnGhostCls} disabled={patch.isPending}>
                  Add
                </button>
              </form>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a className={btnGhostCls} href={`/api/orgs/${orgId}/incidents/${i.id}/record.md`}>
                Download record
              </a>
              {canEdit && (
                <button type="button" className={btnGhostCls} onClick={() => startEdit(i)}>
                  Edit
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className={btnGhostCls}
                  onClick={() => {
                    if (window.confirm("Delete this incident record? It is evidence for 3.6.2."))
                      remove.mutate(i.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            <ErrorText error={patch.error ?? remove.error} />
          </Card>
        );
      })}
    </div>
  );
}

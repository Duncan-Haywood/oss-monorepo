// /orgs/$orgId/projects/$projectId/submittals : the job's submittal log (src/shared/submittals.ts,
// docs/SUBMITTALS.md). What was sent to the GC, what came back, and which ones put the material's
// delivery date at risk, from the dates, lead times and review days the user typed.
import type { SubmittalDto, SubmittalLogDto } from "@shared/api/types";
import {
  SUBMITTAL_ACTION_LABELS,
  SUBMITTAL_ACTIONS,
  SUBMITTAL_NOTE,
  SUBMITTAL_STATE_LABELS,
  SUBMITTAL_TYPE_LABELS,
  SUBMITTAL_TYPES,
  type SubmittalAction,
  type SubmittalStatus,
  type SubmittalType,
  submittalLabel,
  submittalProblem,
  summarizeSubmittals,
  TRANSMITTAL_REQUEST_LABELS,
  TRANSMITTAL_REQUESTS,
  type TransmittalRequest,
} from "@shared/submittals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { StampReader } from "../components/stamp-reader";
import { SubmittalImport } from "../components/submittal-import";
import { api, projectPath } from "../lib/api";

/** The browser's own date, so "overdue" turns over at the user's midnight, not UTC's. */
export const localToday = () => new Date().toLocaleDateString("en-CA");

/** The transmittal PDF's link: the user's date (printed when not yet sent) and, when picked, the
 * action requested (else the server uses the type's default). */
export function transmittalHref(
  base: string,
  id: string,
  today: string,
  requested: TransmittalRequest | "",
  /** The cover sheet alone, or the packet: the cover sheet then the files enclosed. */
  file: "transmittal" | "packet" = "transmittal",
) {
  const q = new URLSearchParams({ today });
  if (requested) q.set("requested", requested);
  return `${base}/${encodeURIComponent(id)}/${file}.pdf?${q.toString()}`;
}

interface Form {
  number: string;
  specSection: string;
  title: string;
  type: SubmittalType;
  gcReference: string;
  submittedOn: string;
  requiredBy: string;
  returnedOn: string;
  action: SubmittalAction | "";
  neededOnSite: string;
  leadTimeDays: string;
  reviewDays: string;
  notes: string;
}

const emptyForm = (): Form => ({
  number: "",
  specSection: "",
  title: "",
  type: "shop_drawings",
  gcReference: "",
  submittedOn: "",
  requiredBy: "",
  returnedOn: "",
  action: "",
  neededOnSite: "",
  leadTimeDays: "",
  reviewDays: "",
  notes: "",
});

const formOf = (s: SubmittalDto): Form => ({
  number: String(s.number),
  specSection: s.specSection ?? "",
  title: s.title,
  type: s.type,
  gcReference: s.gcReference ?? "",
  submittedOn: s.submittedOn ?? "",
  requiredBy: s.requiredBy ?? "",
  returnedOn: s.returnedOn ?? "",
  action: s.action ?? "",
  neededOnSite: s.neededOnSite ?? "",
  leadTimeDays: s.leadTimeDays === null ? "" : String(s.leadTimeDays),
  reviewDays: s.reviewDays === null ? "" : String(s.reviewDays),
  notes: s.notes ?? "",
});

function days(v: string, label: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label}: enter whole days`);
  return n;
}

/** The request body for a form; throws with the first problem in words. */
export function submittalBody(f: Form) {
  if (!f.title.trim()) throw new Error("Enter what is being submitted");
  const body = {
    specSection: f.specSection.trim() || null,
    title: f.title.trim(),
    type: f.type,
    gcReference: f.gcReference.trim() || null,
    submittedOn: f.submittedOn || null,
    requiredBy: f.requiredBy || null,
    returnedOn: f.returnedOn || null,
    action: f.action || null,
    neededOnSite: f.neededOnSite || null,
    leadTimeDays: days(f.leadTimeDays, "Lead time"),
    reviewDays: days(f.reviewDays, "Review"),
    notes: f.notes.trim() || null,
  };
  const problem = submittalProblem({ ...body, number: 1, revision: 0 });
  if (problem) throw new Error(problem);
  return body;
}

export function statusText(st: SubmittalStatus): string {
  const parts: string[] = [SUBMITTAL_STATE_LABELS[st.state]];
  if (st.state === "with_gc" && st.daysWithGc !== null) parts.push(`${st.daysWithGc} days out`);
  if (st.overdue) parts.push(`${st.daysOverdue} days overdue`);
  if (st.lateToSubmit && st.submitBy) parts.push(`was due to go by ${st.submitBy}`);
  if (st.deliveryAtRisk) parts.push("delivery at risk");
  return parts.join(" · ");
}

function Fields({ form, set }: { form: Form; set: (f: Form) => void }) {
  const field = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set({ ...form, [k]: e.target.value }),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        Spec section
        <input className="input block w-28" placeholder="23 31 13" {...field("specSection")} />
      </label>
      <label className="text-sm">
        What
        <input
          className="input block w-64"
          placeholder="Ductwork shop drawings"
          {...field("title")}
        />
      </label>
      <label className="text-sm">
        Type
        <select className="input block" {...field("type")}>
          {SUBMITTAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {SUBMITTAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        GC's number
        <input className="input block w-24" {...field("gcReference")} />
      </label>
      <label className="text-sm">
        Sent
        <input type="date" className="input block" {...field("submittedOn")} />
      </label>
      <label className="text-sm">
        Required back by
        <input type="date" className="input block" {...field("requiredBy")} />
      </label>
      <label className="text-sm">
        Returned
        <input type="date" className="input block" {...field("returnedOn")} />
      </label>
      <label className="text-sm">
        GC's action
        <select className="input block" {...field("action")}>
          <option value="">—</option>
          {SUBMITTAL_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {SUBMITTAL_ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Needed on site
        <input type="date" className="input block" {...field("neededOnSite")} />
      </label>
      <label className="text-sm">
        Lead time (days)
        <input inputMode="numeric" className="input block w-20" {...field("leadTimeDays")} />
      </label>
      <label className="text-sm">
        Review (days)
        <input inputMode="numeric" className="input block w-20" {...field("reviewDays")} />
      </label>
      <label className="text-sm">
        Notes
        <input className="input block w-64" {...field("notes")} />
      </label>
    </div>
  );
}

export function SubmittalsPage() {
  const { orgId, projectId } = useParams({
    from: "/orgs/$orgId/projects/$projectId/submittals",
  });
  const base = projectPath(orgId, projectId, "/submittals");
  const key = ["submittals", orgId, projectId];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: () => api<SubmittalLogDto>(base) });
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<{ id: string; form: Form } | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [requested, setRequested] = useState<TransmittalRequest | "">("");
  const [filesFor, setFilesFor] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: () => {
      const body = submittalBody(form);
      const number = form.number.trim() ? Number(form.number) : undefined;
      if (number !== undefined && (!Number.isInteger(number) || number < 1)) {
        throw new Error("Number: enter a whole number, or leave it blank for the next one");
      }
      return api(base, { method: "POST", body: { ...body, number } });
    },
    onSuccess: async () => {
      setForm(emptyForm());
      await refresh();
    },
  });
  const save = useMutation({
    mutationFn: (e: { id: string; form: Form }) =>
      api(`${base}/${e.id}`, { method: "PATCH", body: submittalBody(e.form) }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const resubmit = useMutation({
    mutationFn: (s: SubmittalDto) =>
      api(`${base}/${s.id}/resubmit`, { method: "POST", body: { submittedOn: null } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (s: SubmittalDto) => api(`${base}/${s.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const d = q.data;
  const today = localToday();
  const { summary, status } = summarizeSubmittals(d.items, today);
  const shown = d.items.filter((s) => {
    if (!openOnly) return true;
    const st = status.get(s.id);
    return st && st.state !== "approved" && st.state !== "superseded";
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId }}
          className="text-sm text-slate-600 underline"
        >
          ← {d.projectName}
        </Link>
        <h1 className="text-2xl font-semibold">Submittal log</h1>
        <p className="text-sm text-slate-600">
          Shop drawings, product data and samples sent to {d.gcName}, what came back, and which ones
          leave too little time for the material's lead time.{" "}
          <a className="underline" href={`${base}/log.csv?today=${today}`}>
            Download CSV
          </a>
        </p>
        <label className="mt-1 block text-sm text-slate-600">
          Transmittals ask the GC:{" "}
          <select
            className="rounded border border-slate-300 px-1 py-0.5 text-sm"
            value={requested}
            onChange={(e) => setRequested(e.target.value as TransmittalRequest | "")}
          >
            <option value="">by type (record for close-out documents, else approval)</option>
            {TRANSMITTAL_REQUESTS.map((r) => (
              <option key={r} value={r}>
                {TRANSMITTAL_REQUEST_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Open", summary.total - summary.closed],
            ["With the GC", summary.withGc],
            ["Overdue back", summary.overdue],
            ["Resubmit needed", summary.resubmit],
            ["Late to send", summary.lateToSubmit],
            ["Delivery at risk", summary.deliveryAtRisk],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{n}</div>
          </div>
        ))}
      </div>

      {d.canEdit && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Add a submittal (#{form.number || d.nextNumber})</h2>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Fields form={form} set={setForm} />
            <div className="flex items-end gap-2">
              <label className="text-sm">
                Number
                <input
                  inputMode="numeric"
                  className="input block w-20"
                  placeholder={String(d.nextNumber)}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </label>
              <button type="submit" className="btn" disabled={add.isPending}>
                Add
              </button>
            </div>
            <p className="text-xs text-slate-500">
              With a needed-on-site date and a lead time, the log works back the last day to send it
              (less the review days, if typed) and flags it once that day has passed.
            </p>
            <ErrorText error={add.error} />
          </form>
        </section>
      )}

      {d.canEdit && (
        <SubmittalImport base={base} log={d.items} nextNumber={d.nextNumber} onDone={refresh} />
      )}

      <section className="card space-y-2 overflow-x-auto">
        <label className="text-sm">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />{" "}
          Open only
        </label>
        <ErrorText error={save.error ?? resubmit.error ?? remove.error} />
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Submittal</th>
              <th className="th">Sent</th>
              <th className="th">Back by</th>
              <th className="th">Returned</th>
              <th className="th">Status</th>
              <th className="th">Submit by</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const st = status.get(s.id);
              const isEditing = editing?.id === s.id;
              const flagged = st && (st.overdue || st.lateToSubmit || st.deliveryAtRisk);
              return (
                <Fragment key={s.id}>
                  <tr className={st?.state === "superseded" ? "text-slate-400" : ""}>
                    {isEditing && editing ? (
                      <td className="td" colSpan={7}>
                        <form
                          className="space-y-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            save.mutate(editing);
                          }}
                        >
                          <div className="font-medium">{submittalLabel(s)}</div>
                          <Fields
                            form={editing.form}
                            set={(f) => setEditing({ id: s.id, form: f })}
                          />
                          <StampReader
                            base={`${base}/${encodeURIComponent(s.id)}`}
                            today={today}
                            submittedOn={editing.form.submittedOn || null}
                            onUse={(v) =>
                              setEditing({
                                id: s.id,
                                form: {
                                  ...editing.form,
                                  ...(v.action ? { action: v.action } : {}),
                                  ...(v.returnedOn ? { returnedOn: v.returnedOn } : {}),
                                },
                              })
                            }
                          />
                          <div className="flex gap-2">
                            <button type="submit" className="btn" disabled={save.isPending}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="td">
                          <div className="font-medium">
                            {submittalLabel(s)} {s.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {SUBMITTAL_TYPE_LABELS[s.type]}
                            {s.gcReference && ` · GC ${s.gcReference}`}
                            {s.action && ` · ${SUBMITTAL_ACTION_LABELS[s.action]}`}
                            {s.notes && ` · ${s.notes}`}
                          </div>
                        </td>
                        <td className="td tabular-nums">{s.submittedOn ?? "—"}</td>
                        <td className="td tabular-nums">{s.requiredBy ?? "—"}</td>
                        <td className="td tabular-nums">{s.returnedOn ?? "—"}</td>
                        <td className={`td ${flagged ? "text-amber-800" : ""}`}>
                          {st ? statusText(st) : ""}
                        </td>
                        <td className="td tabular-nums">{st?.submitBy ?? "—"}</td>
                        <td className="td whitespace-nowrap text-right">
                          <a
                            className="underline"
                            href={transmittalHref(base, s.id, today, requested)}
                          >
                            Transmittal
                          </a>
                          {" · "}
                          <a
                            className="underline"
                            href={transmittalHref(base, s.id, today, requested, "packet")}
                          >
                            With files
                          </a>
                          {" · "}
                          <button
                            type="button"
                            className="underline"
                            aria-expanded={filesFor === s.id}
                            onClick={() => setFilesFor(filesFor === s.id ? null : s.id)}
                          >
                            Files
                          </button>
                          {d.canEdit && " · "}
                          {d.canEdit && (
                            <>
                              <button
                                type="button"
                                className="underline"
                                onClick={() => setEditing({ id: s.id, form: formOf(s) })}
                              >
                                Edit
                              </button>
                              {st?.state === "resubmit" && (
                                <>
                                  {" · "}
                                  <button
                                    type="button"
                                    className="underline"
                                    disabled={resubmit.isPending}
                                    onClick={() => resubmit.mutate(s)}
                                  >
                                    Resubmit as Rev {s.revision + 1}
                                  </button>
                                </>
                              )}
                              {" · "}
                              <button
                                type="button"
                                className="underline"
                                disabled={remove.isPending}
                                onClick={() => {
                                  if (window.confirm(`Delete ${submittalLabel(s)}?`)) {
                                    remove.mutate(s);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  {filesFor === s.id && (
                    <tr>
                      <td className="td bg-slate-50" colSpan={7}>
                        <AttachmentsPanel
                          base={`${base}/${encodeURIComponent(s.id)}`}
                          holder="submittal"
                          embedded
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={7}>
                  {d.items.length === 0 ? "No submittals on this job yet." : "Nothing open."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">{SUBMITTAL_NOTE}</p>
    </div>
  );
}

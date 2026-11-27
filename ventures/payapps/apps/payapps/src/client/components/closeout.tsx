// The job's close-out checklist: the documents the subcontract asks for at the end of the job
// (start from the standard list, or add each one), marked sent and then accepted, or not required
// with the reason; and, read with the punch list and the retainage on the latest pay application,
// what still stands between the job and its retainage. Once nothing does, a release-request email
// to the GC's PM is drafted from what was entered; nothing is sent from PayApps. Each document keeps
// its files (the shared attachments panel), and the close-out binder puts a transmittal and those
// files in one PDF for the GC. Status, counts and blockers come from src/shared/closeout.ts through
// the API.
import type { CloseoutDto, CloseoutItemDto } from "@shared/api/types";
import {
  CLOSEOUT_ANCHOR,
  CLOSEOUT_KIND_LABELS,
  CLOSEOUT_KINDS,
  CLOSEOUT_STATUS_LABELS,
  type CloseoutKind,
  retainageReleaseEmail,
} from "@shared/closeout";
import { mailtoHref } from "@shared/follow-up-email";
import { formatCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { AttachmentsPanel } from "./attachments";
import { ErrorText } from "./error";

interface Job {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

const STATUS_CLASS: Record<CloseoutItemDto["status"], string> = {
  missing: "text-slate-700",
  overdue: "font-semibold text-red-700",
  sent: "text-amber-700",
  accepted: "text-green-700",
  waived: "text-slate-500",
};

function KindSelect(props: { value: CloseoutKind; onChange: (v: CloseoutKind) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-slate-600">Kind</span>
      <select
        className="input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as CloseoutKind)}
      >
        {CLOSEOUT_KINDS.map((k) => (
          <option key={k} value={k}>
            {CLOSEOUT_KIND_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Closeout(props: {
  /** `/api/orgs/:orgId/projects/:projectId` */
  base: string;
  job: Job;
  from: { name: string; company: string };
}) {
  const { base, job, from } = props;
  const url = `${base}/closeout`;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["closeout", url], queryFn: () => api<CloseoutDto>(url) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["closeout", url] });
  const section = useRef<HTMLElement>(null);
  const loaded = q.data !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === `#${CLOSEOUT_ANCHOR}`) {
      section.current?.scrollIntoView();
    }
  }, [loaded]);
  // The punch list on the same page changes the blockers: refetch when it does.
  useEffect(() => {
    const cache = qc.getQueryCache();
    return cache.subscribe((e) => {
      if (
        e.type === "updated" &&
        e.query.queryKey[0] === "punch-list" &&
        e.action.type === "success"
      ) {
        qc.invalidateQueries({ queryKey: ["closeout", url] });
      }
    });
  }, [qc, url]);
  const [editing, setEditing] = useState<string | null>(null);
  const [filesOf, setFilesOf] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [bonded, setBonded] = useState(false);
  const [standardDue, setStandardDue] = useState("");
  const blankDraft = { kind: "other" as CloseoutKind, title: "", requiredBy: "", dueOn: "" };
  const [draft, setDraft] = useState(blankDraft);

  const add = useMutation({
    mutationFn: () =>
      api(url, {
        method: "POST",
        body: {
          kind: draft.kind,
          title: draft.title,
          requiredBy: draft.requiredBy || null,
          dueOn: draft.dueOn || null,
        },
      }),
    onSuccess: () => {
      setDraft(blankDraft);
      return refresh();
    },
  });
  const standard = useMutation({
    mutationFn: () =>
      api(`${url}/standard`, {
        method: "POST",
        body: { bonded, dueOn: standardDue || null },
      }),
    onSuccess: () => refresh(),
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api(`${url}/${encodeURIComponent(v.id)}`, { method: "PATCH", body: v.body }),
    onSuccess: () => refresh(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${url}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setEditing(null);
      return refresh();
    },
  });

  const data = q.data;
  const s = data?.summary;
  const email = data
    ? retainageReleaseEmail(job, data.items, data.punch, data.retainage, from, data.today)
    : null;
  const counts = s
    ? [
        s.overdue ? `${s.overdue} overdue` : null,
        s.toSend ? `${s.toSend} to send` : null,
        s.sent ? `${s.sent} awaiting the GC` : null,
        `${s.accepted} accepted`,
        s.waived ? `${s.waived} not required` : null,
      ].filter(Boolean)
    : [];
  return (
    <section className="card" id={CLOSEOUT_ANCHOR} ref={section}>
      <h2 className="mb-2 font-semibold">
        Close-out and retainage{" "}
        <span className="text-sm font-normal text-slate-600">
          (the documents {job.gcName} needs before releasing what it holds)
        </span>
      </h2>
      {q.error && <ErrorText error={q.error} />}
      {data && (
        <div className="mb-2 text-sm text-slate-700">
          <p>
            {data.retainage.heldCents > 0
              ? `${formatCents(data.retainage.heldCents)} retainage held on pay application #${data.retainage.lastApplication}.`
              : "No retainage held on a pay application sent yet."}
            {s && s.total > 0 && ` Documents: ${counts.join(", ")}`}
            {s?.deliveredPct != null && ` (${s.deliveredPct}% delivered)`}
            {s && s.total > 0 && "."}
          </p>
          {s?.deliveredPct != null && (
            <div
              className="mt-1 h-2 w-full max-w-md overflow-hidden rounded bg-slate-200"
              role="progressbar"
              aria-label="Close-out documents delivered"
              aria-valuenow={s.deliveredPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-green-600" style={{ width: `${s.deliveredPct}%` }} />
            </div>
          )}
          {data.readiness.ready ? (
            <p className="mt-1 text-green-800">
              Nothing on your lists stands between this job and its retainage. Check your
              subcontract for anything else it asks for, then ask {job.gcName} to release it.
            </p>
          ) : (
            data.retainage.heldCents > 0 && (
              <div className="mt-1">
                <p className="text-slate-600">Before you ask for your retainage:</p>
                <ul className="ml-5 list-disc">
                  {data.readiness.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}
      {email && (
        <div className="mb-2 text-sm">
          <button type="button" className="btn" onClick={() => setShowEmail(!showEmail)}>
            {showEmail ? "Hide the email" : "Ask the GC to release the retainage"}
          </button>
          {showEmail && (
            <div className="mt-2 grid max-w-3xl gap-1 rounded border border-slate-200 p-2">
              <p>
                <span className="text-slate-600">To:</span> {email.to ?? "(no PM email on the job)"}
              </p>
              <p>
                <span className="text-slate-600">Subject:</span> {email.subject}
              </p>
              <pre className="whitespace-pre-wrap font-sans">{email.body}</pre>
              <p className="flex flex-wrap gap-3">
                <a className="link" href={mailtoHref(email)}>
                  Open in your email
                </a>
                <button
                  type="button"
                  className="link"
                  onClick={() => navigator.clipboard?.writeText(email.body)}
                >
                  Copy the text
                </button>
                <span className="text-slate-500">
                  Bill the release on your next pay application.
                </span>
              </p>
            </div>
          )}
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="th">Document</th>
                <th className="th hidden sm:table-cell">Required by</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <CloseoutRow
                  key={it.id}
                  it={it}
                  today={data.today}
                  editing={editing === it.id}
                  busy={patch.isPending}
                  onToggle={() => setEditing(editing === it.id ? null : it.id)}
                  filesBase={`${url}/${encodeURIComponent(it.id)}`}
                  filesOpen={filesOf === it.id}
                  onFilesToggle={() => setFilesOf(filesOf === it.id ? null : it.id)}
                  onFilesChanged={refresh}
                  onPatch={(body) => patch.mutateAsync({ id: it.id, body })}
                  onDelete={() => {
                    if (window.confirm(`Delete "${it.title}"?`)) remove.mutate(it.id);
                  }}
                />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm">
            <a className="link" href={`${url}/binder.pdf`}>
              Download the close-out binder (PDF)
            </a>{" "}
            <span className="text-slate-500">
              a transmittal listing every document and its dates, then the files kept with each
              required one ({data.items.reduce((n, it) => n + it.files, 0)} on file).
            </span>
          </p>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="text-sm text-slate-600">
          No close-out documents listed yet. Start from the standard list (warranty, O&M manuals,
          as-builts, attic stock, final inspection, final waiver) and edit it to what your
          subcontract and the spec's close-out section ask for.
        </p>
      )}
      <ErrorText error={patch.error ?? remove.error} />

      <form
        className="mt-3 flex max-w-3xl flex-wrap items-end gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          standard.mutate();
        }}
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={bonded} onChange={(e) => setBonded(e.target.checked)} />
          <span>Bonded job (adds consent of surety)</span>
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Due (optional)</span>
          <input
            className="input"
            type="date"
            value={standardDue}
            onChange={(e) => setStandardDue(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={standard.isPending}>
          Add the standard list
        </button>
        <ErrorText error={standard.error} />
      </form>

      <form
        className="mt-3 grid max-w-3xl gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h3 className="font-semibold">Add a document</h3>
        <div className="flex flex-wrap items-end gap-3">
          <KindSelect value={draft.kind} onChange={(k) => setDraft({ ...draft, kind: k })} />
          <input
            className="input min-w-64 flex-1"
            placeholder="The document, e.g. Fire alarm acceptance test report"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label="Close-out document"
            required
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-slate-600">Required by (optional)</span>
            <input
              className="input"
              placeholder="Subcontract Exhibit D"
              value={draft.requiredBy}
              onChange={(e) => setDraft({ ...draft, requiredBy: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-slate-600">Due (optional)</span>
            <input
              className="input"
              type="date"
              value={draft.dueOn}
              onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
            />
          </label>
          <button className="btn" type="submit" disabled={add.isPending}>
            Add document
          </button>
        </div>
        <ErrorText error={add.error} />
      </form>
    </section>
  );
}

function CloseoutRow(props: {
  it: CloseoutItemDto;
  today: string;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
  filesBase: string;
  filesOpen: boolean;
  onFilesToggle: () => void;
  onFilesChanged: () => unknown;
}) {
  const { it, today, editing, busy, onPatch } = props;
  const status =
    it.status === "overdue"
      ? `Overdue ${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"}`
      : CLOSEOUT_STATUS_LABELS[it.status];
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="td">
          {it.title}
          <span className="block text-xs text-slate-500">
            {CLOSEOUT_KIND_LABELS[it.kind]}
            {it.requiredBy && <span className="sm:hidden"> · {it.requiredBy}</span>}
          </span>
          {it.waivedNote && (
            <span className="block text-xs text-slate-500">Not required: {it.waivedNote}</span>
          )}
        </td>
        <td className="td hidden sm:table-cell">{it.requiredBy}</td>
        <td className={`td ${STATUS_CLASS[it.status]}`}>
          {status}
          {it.sentOn && it.status === "sent" && (
            <span className="block text-xs text-slate-500">sent {it.sentOn}</span>
          )}
          {!it.sentOn && it.dueOn && it.status === "missing" && (
            <span className="block text-xs text-slate-500">due {it.dueOn}</span>
          )}
          {it.acceptedOn && (
            <span className="block text-xs text-slate-500">
              {[it.acceptedOn, it.acceptedBy].filter(Boolean).join(", ")}
            </span>
          )}
        </td>
        <td className="td text-right">
          <span className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-2">
            {(it.status === "missing" || it.status === "overdue") && (
              <button
                type="button"
                className="link whitespace-nowrap"
                disabled={busy}
                onClick={() => onPatch({ sentOn: today })}
              >
                Sent today
              </button>
            )}
            {it.status === "sent" && (
              <button
                type="button"
                className="link whitespace-nowrap"
                disabled={busy}
                onClick={() => onPatch({ acceptedOn: today })}
              >
                Accepted today
              </button>
            )}
            <button
              type="button"
              className="link whitespace-nowrap"
              aria-expanded={props.filesOpen}
              onClick={props.onFilesToggle}
            >
              Files ({it.files})
            </button>
            <button type="button" className="link" onClick={props.onToggle}>
              {editing ? "Close" : "Edit"}
            </button>
          </span>
        </td>
      </tr>
      {props.filesOpen && (
        <tr>
          <td className="td bg-slate-50" colSpan={4}>
            <AttachmentsPanel
              base={props.filesBase}
              holder="closeout"
              embedded
              onChanged={props.onFilesChanged}
            />
          </td>
        </tr>
      )}
      {editing && (
        <tr>
          <td className="td" colSpan={4}>
            <CloseoutEditor
              it={it}
              busy={busy}
              onPatch={onPatch}
              onClose={props.onToggle}
              onDelete={props.onDelete}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** The full editor for one document; mounted fresh each time it opens, so it starts from the saved item. */
function CloseoutEditor(props: {
  it: CloseoutItemDto;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { it, busy, onPatch, onClose, onDelete } = props;
  const [form, setForm] = useState({
    kind: it.kind,
    title: it.title,
    requiredBy: it.requiredBy ?? "",
    dueOn: it.dueOn ?? "",
    sentOn: it.sentOn ?? "",
    acceptedOn: it.acceptedOn ?? "",
    acceptedBy: it.acceptedBy ?? "",
    waivedNote: it.waivedNote ?? "",
    note: it.note ?? "",
  });
  const date = (k: "dueOn" | "sentOn" | "acceptedOn", label: string) => (
    <label className="grid gap-1">
      <span className="text-slate-600">{label}</span>
      <input
        className="input"
        type="date"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  const textField = (k: "requiredBy" | "acceptedBy" | "note", label: string) => (
    <label className="grid gap-1">
      <span className="text-slate-600">{label}</span>
      <input
        className="input"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="grid gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await onPatch({
          kind: form.kind,
          title: form.title,
          requiredBy: form.requiredBy,
          dueOn: form.dueOn || null,
          sentOn: form.sentOn || null,
          acceptedOn: form.acceptedOn || null,
          acceptedBy: form.acceptedBy,
          waivedNote: form.waivedNote,
          note: form.note,
        });
        onClose();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <KindSelect value={form.kind} onChange={(k) => setForm({ ...form, kind: k })} />
        <input
          className="input min-w-64 flex-1"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          aria-label="Close-out document"
          required
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {textField("requiredBy", "Required by")}
        {date("dueOn", "Due")}
        {date("sentOn", "Date sent")}
        {date("acceptedOn", "Date accepted")}
        {textField("acceptedBy", "Accepted by")}
      </div>
      <label className="grid gap-1">
        <span className="text-slate-600">
          Not required on this job? Say why (not bonded, GC waived it); blank if it is
        </span>
        <input
          className="input"
          value={form.waivedNote}
          onChange={(e) => setForm({ ...form, waivedNote: e.target.value })}
        />
      </label>
      {textField("note", "Note")}
      <div className="flex gap-3">
        <button className="btn" type="submit" disabled={busy}>
          Save
        </button>
        <button type="button" className="link text-red-700" onClick={onDelete}>
          Delete
        </button>
      </div>
    </form>
  );
}

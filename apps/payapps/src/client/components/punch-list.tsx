// The job's punch list: add the items the GC, architect or owner listed at a walk-through (one at a
// time, or a list pasted from their email), mark each fixed and then accepted, or "not ours" with
// the reason, and send the GC a back-check request for everything fixed. Status and the counts come
// from src/shared/punch-list.ts through the API. The list downloads as a PDF to bring to the walk
// (all items, or only what is left) and as CSV; nothing is sent from PayApps.
import type { PunchItemDto, PunchListDto } from "@shared/api/types";
import { mailtoHref } from "@shared/follow-up-email";
import {
  backCheckEmail,
  PUNCH_LIST_ANCHOR,
  PUNCH_SOURCE_LABELS,
  PUNCH_SOURCES,
  PUNCH_STATUS_LABELS,
  type PunchSource,
  parsePastedPunchList,
  punchLabel,
} from "@shared/punch-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

interface Job {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

const STATUS_CLASS: Record<PunchItemDto["status"], string> = {
  open: "text-slate-700",
  overdue: "font-semibold text-red-700",
  done: "text-amber-700",
  accepted: "text-green-700",
  disputed: "text-slate-500",
};

const sourceOrNull = (v: string): PunchSource | null =>
  (PUNCH_SOURCES as readonly string[]).includes(v) ? (v as PunchSource) : null;

function SourceSelect(props: {
  value: PunchSource | null;
  onChange: (v: PunchSource | null) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-slate-600">Listed by</span>
      <select
        className="input"
        value={props.value ?? ""}
        onChange={(e) => props.onChange(sourceOrNull(e.target.value))}
      >
        <option value="">Not stated</option>
        {PUNCH_SOURCES.map((s) => (
          <option key={s} value={s}>
            {PUNCH_SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PunchList(props: {
  /** `/api/orgs/:orgId/projects/:projectId` */
  base: string;
  job: Job;
  from: { name: string; company: string };
}) {
  const { base, job, from } = props;
  const url = `${base}/punch-list`;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["punch-list", url], queryFn: () => api<PunchListDto>(url) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["punch-list", url] });
  const section = useRef<HTMLElement>(null);
  const loaded = q.data !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === `#${PUNCH_LIST_ANCHOR}`) {
      section.current?.scrollIntoView();
    }
  }, [loaded]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [paste, setPaste] = useState(false);
  const blankDraft = { description: "", location: "", dueOn: "", listedOn: "", pasted: "" };
  const [draft, setDraft] = useState(blankDraft);
  const [source, setSource] = useState<PunchSource | null>("gc");

  const pastedItems = paste ? parsePastedPunchList(draft.pasted) : [];
  const shared = {
    source,
    listedOn: draft.listedOn || null,
    dueOn: draft.dueOn || null,
  };
  const add = useMutation({
    mutationFn: () =>
      paste
        ? api(`${url}/bulk`, {
            method: "POST",
            body: { items: pastedItems.map((i) => ({ ...i, ...shared })) },
          })
        : api(url, {
            method: "POST",
            body: {
              description: draft.description,
              location: draft.location || null,
              ...shared,
            },
          }),
    onSuccess: () => {
      // Keep who listed it and the dates: the next item is usually from the same walk.
      setDraft({ ...draft, description: "", location: "", pasted: "" });
      return refresh();
    },
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

  const list = q.data;
  const s = list?.summary;
  const email = list ? backCheckEmail(job, list.items, from, list.today) : null;
  const counts = s
    ? [
        s.overdue ? `${s.overdue} overdue` : null,
        s.toFix ? `${s.toFix} to fix` : null,
        s.done ? `${s.done} awaiting the GC's back-check` : null,
        `${s.accepted} accepted`,
        s.disputed ? `${s.disputed} marked not ours` : null,
      ].filter(Boolean)
    : [];
  return (
    <section className="card" id={PUNCH_LIST_ANCHOR} ref={section}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Punch list{" "}
          <span className="text-sm font-normal text-slate-600">
            (items to fix before {job.gcName} signs off your work)
          </span>
        </h2>
        {list && list.items.length > 0 && (
          <span className="flex flex-wrap gap-3 text-sm">
            <a className="link" href={`${url}/punch-list.pdf`}>
              PDF
            </a>
            <a className="link" href={`${url}/punch-list.pdf?only=open`}>
              PDF of what is left
            </a>
            <a className="link" href={`${url}/punch-list.csv`}>
              CSV
            </a>
          </span>
        )}
      </div>
      {q.error && <ErrorText error={q.error} />}
      {s && s.total > 0 && (
        <div className="mb-2 text-sm text-slate-700">
          <p>
            {counts.join(", ")}
            {s.acceptedPct !== null && ` (${s.acceptedPct}% signed off)`}.
          </p>
          {s.acceptedPct !== null && (
            <div
              className="mt-1 h-2 w-full max-w-md overflow-hidden rounded bg-slate-200"
              role="progressbar"
              aria-label="Punch items accepted"
              aria-valuenow={s.acceptedPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-green-600" style={{ width: `${s.acceptedPct}%` }} />
            </div>
          )}
          {s.closed && (
            <p className="mt-1 text-green-800">
              Every item that is yours is accepted. Many subcontracts release retainage once the
              punch list is closed and the close-out documents are in: check yours, then bill the
              release on your next pay application.
            </p>
          )}
        </div>
      )}
      {email && (
        <div className="mb-2 text-sm">
          <button type="button" className="btn" onClick={() => setShowEmail(!showEmail)}>
            {showEmail ? "Hide the email" : `Ask the GC for a back-check (${s?.done ?? 0} fixed)`}
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
                <span className="text-slate-500">Attach the PDF of what is left.</span>
              </p>
            </div>
          )}
        </div>
      )}
      {list && list.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="th">No.</th>
                <th className="th hidden sm:table-cell">Location</th>
                <th className="th">Item</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((it) => (
                <PunchRow
                  key={it.id}
                  it={it}
                  today={list.today}
                  editing={editing === it.id}
                  busy={patch.isPending}
                  onToggle={() => setEditing(editing === it.id ? null : it.id)}
                  onPatch={(body) => patch.mutateAsync({ id: it.id, body })}
                  onDelete={() => {
                    if (window.confirm(`Delete ${punchLabel(it.number)}?`)) remove.mutate(it.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && list.items.length === 0 && (
        <p className="text-sm text-slate-600">
          No punch list on this job yet. When the GC walks the job, enter their items here (or paste
          the list from their email) and mark each one fixed, so you can ask for one back-check and
          show what stands between you and your retainage.
        </p>
      )}
      <ErrorText error={patch.error ?? remove.error} />

      <form
        className="mt-3 grid max-w-3xl gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="font-semibold">
            {paste ? "Paste a list" : `New item${list ? ` (${punchLabel(list.nextNumber)})` : ""}`}
          </h3>
          <button type="button" className="link" onClick={() => setPaste(!paste)}>
            {paste ? "Add one item instead" : "Paste a list instead"}
          </button>
        </div>
        {paste ? (
          <>
            <textarea
              className="input min-h-28"
              placeholder={
                "One item per line, e.g.\n1. Room 104 - Missing cover plate\n2. Corridor 2: Touch up paint at door frame"
              }
              value={draft.pasted}
              onChange={(e) => setDraft({ ...draft, pasted: e.target.value })}
              aria-label="Pasted punch list"
            />
            {pastedItems.length > 0 && (
              <p className="text-xs text-slate-600">
                {pastedItems.length} item{pastedItems.length === 1 ? "" : "s"} to add
                {pastedItems.some((i) => i.location)
                  ? `; locations read from the text before " - " or ": " (first: ${pastedItems.find((i) => i.location)?.location})`
                  : ""}
                .
              </p>
            )}
          </>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input"
              placeholder="Location, e.g. Room 104"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              aria-label="Punch item location"
            />
            <input
              className="input sm:col-span-2"
              placeholder="The item, e.g. Missing cover plate at receptacle"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              aria-label="Punch item"
              required
            />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <SourceSelect value={source} onChange={setSource} />
          <label className="grid gap-1">
            <span className="text-slate-600">Date listed</span>
            <input
              className="input"
              type="date"
              value={draft.listedOn}
              onChange={(e) => setDraft({ ...draft, listedOn: e.target.value })}
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
          <button
            className="btn"
            type="submit"
            disabled={add.isPending || (paste && pastedItems.length === 0)}
          >
            {paste
              ? pastedItems.length
                ? `Add ${pastedItems.length} item${pastedItems.length === 1 ? "" : "s"}`
                : "Add items"
              : "Add item"}
          </button>
        </div>
        <ErrorText error={add.error} />
      </form>
    </section>
  );
}

function PunchRow(props: {
  it: PunchItemDto;
  today: string;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
}) {
  const { it, today, editing, busy, onPatch } = props;
  const status =
    it.status === "overdue"
      ? `Overdue ${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"}`
      : PUNCH_STATUS_LABELS[it.status];
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="td whitespace-nowrap font-medium">{punchLabel(it.number)}</td>
        <td className="td hidden sm:table-cell">{it.location}</td>
        <td className="td">
          {it.location && <span className="text-slate-500 sm:hidden">{it.location}: </span>}
          {it.description}
          {it.disputeNote && (
            <span className="block text-xs text-slate-500">Not ours: {it.disputeNote}</span>
          )}
        </td>
        <td className={`td ${STATUS_CLASS[it.status]}`}>
          {status}
          {it.completedOn && it.status === "done" && (
            <span className="block text-xs text-slate-500">fixed {it.completedOn}</span>
          )}
          {it.acceptedOn && (
            <span className="block text-xs text-slate-500">
              {[it.acceptedOn, it.acceptedBy].filter(Boolean).join(", ")}
            </span>
          )}
        </td>
        <td className="td text-right">
          <span className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-2">
            {(it.status === "open" || it.status === "overdue") && (
              <button
                type="button"
                className="link whitespace-nowrap"
                disabled={busy}
                onClick={() => onPatch({ completedOn: today })}
              >
                Fixed today
              </button>
            )}
            {it.status === "done" && (
              <button
                type="button"
                className="link whitespace-nowrap"
                disabled={busy}
                onClick={() => onPatch({ acceptedOn: today })}
              >
                Accepted today
              </button>
            )}
            <button type="button" className="link" onClick={props.onToggle}>
              {editing ? "Close" : "Edit"}
            </button>
          </span>
        </td>
      </tr>
      {editing && (
        <tr>
          <td className="td" colSpan={5}>
            <PunchEditor
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

/** The full editor for one item; mounted fresh each time it opens, so it starts from the saved item. */
function PunchEditor(props: {
  it: PunchItemDto;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { it, busy, onPatch, onClose, onDelete } = props;
  const [form, setForm] = useState({
    description: it.description,
    location: it.location ?? "",
    source: it.source,
    listedOn: it.listedOn ?? "",
    dueOn: it.dueOn ?? "",
    completedOn: it.completedOn ?? "",
    completedBy: it.completedBy ?? "",
    acceptedOn: it.acceptedOn ?? "",
    acceptedBy: it.acceptedBy ?? "",
    disputeNote: it.disputeNote ?? "",
  });
  const date = (k: "listedOn" | "dueOn" | "completedOn" | "acceptedOn", label: string) => (
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
  const textField = (k: "location" | "completedBy" | "acceptedBy", label: string) => (
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
          description: form.description,
          location: form.location,
          source: form.source,
          listedOn: form.listedOn || null,
          dueOn: form.dueOn || null,
          completedOn: form.completedOn || null,
          completedBy: form.completedBy,
          acceptedOn: form.acceptedOn || null,
          acceptedBy: form.acceptedBy,
          disputeNote: form.disputeNote,
        });
        onClose();
      }}
    >
      <textarea
        className="input min-h-14"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        aria-label="Punch item"
        required
      />
      <div className="flex flex-wrap items-end gap-3">
        {textField("location", "Location")}
        <SourceSelect value={form.source} onChange={(v) => setForm({ ...form, source: v })} />
        {date("listedOn", "Date listed")}
        {date("dueOn", "Due")}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {date("completedOn", "Date fixed")}
        {textField("completedBy", "Fixed by")}
        {date("acceptedOn", "Date accepted")}
        {textField("acceptedBy", "Accepted by")}
      </div>
      <label className="grid gap-1">
        <span className="text-slate-600">
          Not ours? Say why (another trade's work, or built as drawn); blank if it is yours
        </span>
        <input
          className="input"
          value={form.disputeNote}
          onChange={(e) => setForm({ ...form, disputeNote: e.target.value })}
        />
      </label>
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

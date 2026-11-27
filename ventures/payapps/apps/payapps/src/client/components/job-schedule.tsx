// The job's schedule: the activities the contractor plans (with the trade or crew, start and finish,
// percent complete and what each waits for), the three-week lookahead drawn as bars over the
// workdays, and "Move with what follows" for when the GC's schedule slips. Status, workdays, the
// sequence check and the shift come from src/shared/schedule.ts through the API. The lookahead
// downloads as a PDF for the GC's coordination meeting and the schedule as CSV; nothing is sent.
import type { ScheduleActivityDto, ScheduleDto, ScheduleShiftDto } from "@shared/api/types";
import {
  ACTIVITY_STATUS_LABELS,
  activityLabel,
  holidayCalendar,
  SCHEDULE_ANCHOR,
  workdaysBetween,
} from "@shared/schedule";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";
import { ScheduleDelays } from "./schedule-delays";
import { ScheduleImport } from "./schedule-import";

const STATUS_CLASS: Record<ScheduleActivityDto["status"], string> = {
  not_started: "text-slate-700",
  in_progress: "text-blue-800",
  done: "text-green-700",
  late_start: "font-semibold text-red-700",
  late_finish: "font-semibold text-red-700",
};

const BAR_CLASS: Record<ScheduleActivityDto["status"], string> = {
  not_started: "bg-slate-400",
  in_progress: "bg-blue-600",
  done: "bg-green-600",
  late_start: "bg-red-600",
  late_finish: "bg-red-600",
};

interface Draft {
  name: string;
  trade: string;
  startOn: string;
  finishOn: string;
  predecessor: string;
  lagDays: string;
}

const blankDraft: Draft = {
  name: "",
  trade: "",
  startOn: "",
  finishOn: "",
  predecessor: "",
  lagDays: "",
};

/** "A-003", "3" or "" to a number or null; undefined when it is not one. */
function parseNumber(v: string): number | null | undefined {
  const t = v.trim().replace(/^A-?/i, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function Lookahead(props: { s: ScheduleDto }) {
  const { s } = props;
  const items = s.activities.filter((a) => a.inLookahead);
  const days = s.lookahead.days;
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Nothing open from {s.lookahead.from} to {s.lookahead.to}.
      </p>
    );
  }
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const off = s.lookahead.holidays;
  return (
    <div className="overflow-x-auto">
      {off.length > 0 && (
        <p className="mb-1 text-xs text-slate-600">
          Holidays left out: {off.map((h) => `${h.on.slice(5)} ${h.name}`).join(", ")}
        </p>
      )}
      <div className="min-w-[560px] text-xs">
        <div className="grid grid-cols-[9rem_1fr] gap-2">
          <span className="text-slate-600">
            {s.lookahead.weeks}-week lookahead from {s.lookahead.from}
          </span>
          <div className="grid" style={cols}>
            {days.map((d) => (
              <span
                key={d}
                className={`text-center ${d === s.today ? "rounded bg-amber-100 font-semibold" : "text-slate-500"}`}
              >
                {d.slice(8)}
              </span>
            ))}
          </div>
        </div>
        {items.map((a) => {
          const end = a.status === "late_finish" && a.finishOn < s.today ? s.today : a.finishOn;
          return (
            <div key={a.id} className="grid grid-cols-[9rem_1fr] items-center gap-2 py-0.5">
              <span className="truncate" title={a.name}>
                {activityLabel(a.number)} {a.name}
              </span>
              <div className="grid h-3" style={cols}>
                {days.map((d) => (
                  <span
                    key={d}
                    className={d >= a.startOn && d <= end ? BAR_CLASS[a.status] : "bg-slate-100"}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityRow(props: {
  a: ScheduleActivityDto;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<unknown>;
  onShift: (workdays: number) => void;
  onDelete: () => void;
}) {
  const { a } = props;
  const [d, setD] = useState({
    name: a.name,
    trade: a.trade ?? "",
    startOn: a.startOn,
    finishOn: a.finishOn,
    percentComplete: String(a.percentComplete),
    predecessor: a.predecessorNumber ? activityLabel(a.predecessorNumber) : "",
    lagDays: String(a.lagDays),
    notes: a.notes ?? "",
  });
  const [shift, setShift] = useState("5");
  const [err, setErr] = useState<unknown>(null);
  const shiftN = Number(shift);
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="td font-mono">{activityLabel(a.number)}</td>
        <td className="td">
          <div>{a.name}</div>
          {a.trade && <div className="text-xs text-slate-600">{a.trade}</div>}
          {a.sequenceProblem && <div className="text-xs text-red-700">{a.sequenceProblem}</div>}
        </td>
        <td className="td whitespace-nowrap">
          {a.startOn} to {a.finishOn}
          <div className="text-xs text-slate-600">
            {a.workdays} workday{a.workdays === 1 ? "" : "s"}
            {a.predecessorNumber
              ? `, after ${activityLabel(a.predecessorNumber)}${a.lagDays ? ` + ${a.lagDays}` : ""}`
              : ""}
          </div>
        </td>
        <td className={`td ${STATUS_CLASS[a.status]}`}>
          {ACTIVITY_STATUS_LABELS[a.status]}
          <div className="text-xs text-slate-600">{a.percentComplete}% done</div>
        </td>
        <td className="td text-right">
          <button type="button" className="link" onClick={props.onToggle}>
            {props.editing ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {props.editing && (
        <tr>
          <td colSpan={5} className="td">
            <form
              className="grid gap-2 text-sm sm:grid-cols-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const pred = parseNumber(d.predecessor);
                if (pred === undefined) {
                  setErr(new Error("Waits for: an activity number such as A-002"));
                  return;
                }
                setErr(null);
                try {
                  await props.onPatch({
                    name: d.name,
                    trade: d.trade || null,
                    startOn: d.startOn,
                    finishOn: d.finishOn,
                    percentComplete: Math.min(
                      100,
                      Math.max(0, Math.round(Number(d.percentComplete) || 0)),
                    ),
                    predecessorNumber: pred,
                    lagDays: Math.max(0, Math.round(Number(d.lagDays) || 0)),
                    notes: d.notes || null,
                  });
                } catch (e2) {
                  setErr(e2);
                }
              }}
            >
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-slate-600">Activity</span>
                <input
                  className="input"
                  value={d.name}
                  required
                  onChange={(e) => setD({ ...d, name: e.target.value })}
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-slate-600">Trade or crew</span>
                <input
                  className="input"
                  value={d.trade}
                  onChange={(e) => setD({ ...d, trade: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">Start</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={d.startOn}
                  onChange={(e) => setD({ ...d, startOn: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">Finish</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={d.finishOn}
                  onChange={(e) => setD({ ...d, finishOn: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">Percent done</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={d.percentComplete}
                  onChange={(e) => setD({ ...d, percentComplete: e.target.value })}
                />
              </label>
              <div className="flex gap-2">
                <label className="grid flex-1 gap-1">
                  <span className="text-slate-600">Waits for</span>
                  <input
                    className="input"
                    placeholder="A-002"
                    value={d.predecessor}
                    onChange={(e) => setD({ ...d, predecessor: e.target.value })}
                  />
                </label>
                <label className="grid w-20 gap-1">
                  <span className="text-slate-600">Lag</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={d.lagDays}
                    onChange={(e) => setD({ ...d, lagDays: e.target.value })}
                    aria-label="Lag in workdays"
                  />
                </label>
              </div>
              <label className="grid gap-1 sm:col-span-4">
                <span className="text-slate-600">Notes</span>
                <input
                  className="input"
                  value={d.notes}
                  onChange={(e) => setD({ ...d, notes: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
                <button className="btn" type="submit" disabled={props.busy}>
                  Save
                </button>
                <span className="flex items-center gap-1">
                  Move with what follows by
                  <input
                    className="input w-20"
                    type="number"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    aria-label="Workdays to move"
                  />
                  workdays
                  <button
                    type="button"
                    className="btn"
                    disabled={props.busy || !Number.isInteger(shiftN) || shiftN === 0}
                    onClick={() => props.onShift(shiftN)}
                  >
                    Move
                  </button>
                </span>
                <button type="button" className="link text-red-700" onClick={props.onDelete}>
                  Delete
                </button>
              </div>
              <p className="text-xs text-slate-500 sm:col-span-4">
                Moving shifts this activity and everything waiting on it (not the ones already done)
                by workdays, Monday to Friday less the company's holidays (listed on the crew
                lookahead page); a negative number pulls them in.
              </p>
              <div className="sm:col-span-4">
                <ErrorText error={err} />
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export function JobSchedule(props: {
  /** `/api/orgs/:orgId/projects/:projectId` */
  base: string;
  job: { gcName: string };
}) {
  const { base, job } = props;
  const url = `${base}/schedule`;
  // The company's crew lookahead page: /orgs/:orgId/crews (pages/crews.tsx).
  const crewsPage = `${base.replace(/^\/api/, "").replace(/\/projects\/[^/]+$/, "")}/crews`;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["schedule", url], queryFn: () => api<ScheduleDto>(url) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule", url] });
  const section = useRef<HTMLElement>(null);
  const loaded = q.data !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === `#${SCHEDULE_ANCHOR}`) section.current?.scrollIntoView();
  }, [loaded]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [note, setNote] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<unknown>(null);

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(url, { method: "POST", body }),
    onSuccess: () => {
      // Keep the trade: the next activity is often the same crew's.
      setDraft({ ...blankDraft, trade: draft.trade });
      return refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api(`${url}/${encodeURIComponent(v.id)}`, { method: "PATCH", body: v.body }),
    onSuccess: () => refresh(),
  });
  const shift = useMutation({
    mutationFn: (v: { id: string; workdays: number }) =>
      api<ScheduleShiftDto>(`${url}/${encodeURIComponent(v.id)}/shift`, {
        method: "POST",
        body: { workdays: v.workdays },
      }),
    onSuccess: (r, v) => {
      const moved = r.moved.map(activityLabel).join(", ");
      const kept = r.skippedDone.length
        ? ` ${r.skippedDone.map(activityLabel).join(", ")} ${r.skippedDone.length === 1 ? "is" : "are"} done and stayed put.`
        : "";
      setNote(
        `Moved ${moved} ${Math.abs(v.workdays)} workday${Math.abs(v.workdays) === 1 ? "" : "s"} ${v.workdays > 0 ? "later" : "earlier"}.${kept}`,
      );
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${url}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setEditing(null);
      return refresh();
    },
  });

  const s = q.data;
  const sum = s?.summary;
  const draftDays =
    draft.startOn && draft.finishOn
      ? workdaysBetween(draft.startOn, draft.finishOn, holidayCalendar(s?.holidays ?? []))
      : null;
  return (
    <section className="card" id={SCHEDULE_ANCHOR} ref={section}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Schedule{" "}
          <span className="text-sm font-normal text-slate-600">
            (your activities on this job and the lookahead for {job.gcName}'s meeting)
          </span>
        </h2>
        {s && s.activities.length > 0 && (
          <span className="flex flex-wrap gap-3 text-sm">
            <a className="link" href={`${url}/lookahead.pdf`}>
              3-week lookahead PDF
            </a>
            <a className="link" href={`${url}/lookahead.pdf?weeks=6`}>
              6-week PDF
            </a>
            <a className="link" href={`${url}/schedule.csv`}>
              CSV
            </a>
            <a className="link" href={crewsPage}>
              Every job, by crew
            </a>
          </span>
        )}
      </div>
      {q.error && <ErrorText error={q.error} />}
      {sum && sum.total > 0 && (
        <p className="mb-2 text-sm text-slate-700">
          {[
            `${sum.total} activit${sum.total === 1 ? "y" : "ies"}`,
            sum.inProgress ? `${sum.inProgress} in progress` : null,
            sum.late ? `${sum.late} late` : null,
            sum.conflicts ? `${sum.conflicts} out of sequence` : null,
            `${sum.done} done`,
            sum.percentComplete !== null ? `${sum.percentComplete}% complete by workdays` : null,
            sum.startOn && sum.finishOn ? `${sum.startOn} to ${sum.finishOn}` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
      {note && (
        <p className="mb-2 rounded bg-green-50 p-2 text-sm text-green-900" role="status">
          {note}
        </p>
      )}
      {s && s.activities.length > 0 && (
        <>
          <div className="mb-3">
            <Lookahead s={s} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="th">No.</th>
                  <th className="th">Activity</th>
                  <th className="th">Dates</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {s.activities.map((a) => (
                  <ActivityRow
                    key={`${a.id}-${a.startOn}-${a.finishOn}-${a.percentComplete}`}
                    a={a}
                    editing={editing === a.id}
                    busy={patch.isPending || shift.isPending}
                    onToggle={() => setEditing(editing === a.id ? null : a.id)}
                    onPatch={(body) => patch.mutateAsync({ id: a.id, body })}
                    onShift={(workdays) => shift.mutate({ id: a.id, workdays })}
                    onDelete={() => {
                      if (window.confirm(`Delete ${activityLabel(a.number)}?`)) remove.mutate(a.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {s && s.activities.length === 0 && (
        <p className="text-sm text-slate-600">
          No schedule on this job yet. Enter your activities with the dates from the GC's schedule
          (and what each one waits for), then bring the three-week lookahead PDF to the weekly
          coordination meeting. When the GC slips, move an activity and everything after it in one
          step.
        </p>
      )}
      <ErrorText error={patch.error ?? shift.error ?? remove.error} />

      <form
        className="mt-3 grid max-w-3xl gap-2 text-sm sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const pred = parseNumber(draft.predecessor);
          if (pred === undefined) {
            setFormErr(new Error("Waits for: an activity number such as A-002"));
            return;
          }
          setFormErr(null);
          add.mutate({
            name: draft.name,
            trade: draft.trade || null,
            startOn: draft.startOn,
            finishOn: draft.finishOn,
            predecessorNumber: pred,
            lagDays: Math.max(0, Math.round(Number(draft.lagDays) || 0)),
          });
        }}
      >
        <h3 className="font-semibold sm:col-span-4">
          New activity{s ? ` (${activityLabel(s.nextNumber)})` : ""}
        </h3>
        <input
          className="input sm:col-span-2"
          placeholder="Activity, e.g. Rough-in level 2"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          aria-label="Activity"
          required
        />
        <input
          className="input sm:col-span-2"
          placeholder="Trade or crew, e.g. Crew A (Luis)"
          value={draft.trade}
          onChange={(e) => setDraft({ ...draft, trade: e.target.value })}
          aria-label="Trade or crew"
        />
        <label className="grid gap-1">
          <span className="text-slate-600">Start</span>
          <input
            className="input"
            type="date"
            required
            value={draft.startOn}
            onChange={(e) => setDraft({ ...draft, startOn: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">
            Finish{draftDays !== null ? ` (${draftDays} workday${draftDays === 1 ? "" : "s"})` : ""}
          </span>
          <input
            className="input"
            type="date"
            required
            value={draft.finishOn}
            onChange={(e) => setDraft({ ...draft, finishOn: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Waits for (optional)</span>
          <input
            className="input"
            placeholder="A-001"
            value={draft.predecessor}
            onChange={(e) => setDraft({ ...draft, predecessor: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Lag (workdays)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={draft.lagDays}
            onChange={(e) => setDraft({ ...draft, lagDays: e.target.value })}
          />
        </label>
        <div className="sm:col-span-4">
          <button className="btn" type="submit" disabled={add.isPending}>
            Add activity
          </button>
        </div>
        <div className="sm:col-span-4">
          <ErrorText error={formErr ?? add.error} />
        </div>
      </form>
      {s && s.activities.length > 0 && <ScheduleDelays url={url} />}
      {s && <ScheduleImport url={url} schedule={s} onDone={refresh} />}
    </section>
  );
}

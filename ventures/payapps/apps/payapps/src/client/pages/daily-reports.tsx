// /orgs/$orgId/projects/$projectId/daily-reports : the job's daily reports (field logs,
// src/shared/daily-reports.ts, docs/DAILY-REPORTS.md). One per day: weather, crew on site, the work
// done, delays and the hours they cost, equipment, deliveries, visitors, safety and notes. Each
// downloads as a PDF, a date range as one PDF, and the log as CSV. Photos and files per report
// (the shared attachments panel, with the camera and shrink-before-upload) go behind the report in
// its "PDF + photos" download.
import type { DailyReportDto, DailyReportLogDto } from "@shared/api/types";
import {
  addDays,
  type CrewLine,
  crewTotals,
  DAILY_REPORTS_NOTE,
  dailyReportProblem,
  dayLabel,
  draftFromPrevious,
  hoursText,
  lineHours,
  weatherText,
} from "@shared/daily-reports";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { api, projectPath } from "../lib/api";

interface CrewForm {
  company: string;
  trade: string;
  workers: string;
  hoursEach: string;
}

const TEXT_FIELDS = [
  ["workPerformed", "Work performed", "Areas, quantities, what was finished"],
  ["delays", "Delays and problems", "Waiting on another trade, access, rain, missing material"],
  ["equipment", "Equipment on site", "Lifts, rentals, tools that cost by the day"],
  ["deliveries", "Deliveries", "What came, from whom, any damage or shortage"],
  ["visitors", "Visitors and inspections", "Inspector, GC super, owner's rep; results"],
  ["safety", "Safety", "Toolbox talk, incidents, near misses"],
  ["notes", "Notes", "Directions given on site, extra work asked for"],
] as const;
type TextKey = (typeof TEXT_FIELDS)[number][0];

export interface DailyForm extends Record<TextKey, string> {
  reportDate: string;
  weather: string;
  tempHighF: string;
  tempLowF: string;
  delayHours: string;
  /** The schedule activity the delay held up; "" for none. */
  delayActivityId: string;
  crew: CrewForm[];
}

const emptyCrew = (): CrewForm => ({ company: "", trade: "", workers: "", hoursEach: "8" });

export const emptyDailyForm = (reportDate: string): DailyForm => ({
  reportDate,
  weather: "",
  tempHighF: "",
  tempLowF: "",
  delayHours: "",
  delayActivityId: "",
  crew: [emptyCrew()],
  workPerformed: "",
  delays: "",
  equipment: "",
  deliveries: "",
  visitors: "",
  safety: "",
  notes: "",
});

const crewForm = (l: CrewLine): CrewForm => ({
  company: l.company ?? "",
  trade: l.trade,
  workers: String(l.workers),
  hoursEach: hoursText(l.hoursEach),
});

const numText = (n: number | null) => (n === null ? "" : String(n));

export const dailyFormOf = (r: DailyReportDto): DailyForm => ({
  reportDate: r.reportDate,
  weather: r.weather ?? "",
  tempHighF: numText(r.tempHighF),
  tempLowF: numText(r.tempLowF),
  delayHours: r.delayHours === null ? "" : hoursText(r.delayHours),
  delayActivityId: r.delayActivityId ?? "",
  crew: r.crew.map(crewForm),
  workPerformed: r.workPerformed ?? "",
  delays: r.delays ?? "",
  equipment: r.equipment ?? "",
  deliveries: r.deliveries ?? "",
  visitors: r.visitors ?? "",
  safety: r.safety ?? "",
  notes: r.notes ?? "",
});

/** A new report started from the latest one: its crew and equipment, nothing that happened. */
export const formFromPrevious = (prev: DailyReportDto, reportDate: string): DailyForm => {
  const d = draftFromPrevious(prev);
  return {
    ...emptyDailyForm(reportDate),
    crew: d.crew.map(crewForm),
    equipment: d.equipment ?? "",
  };
};

function num(v: string, label: string, integer = false): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) {
    throw new Error(`${label}: enter a ${integer ? "whole " : ""}number`);
  }
  return n;
}

/** The request body for a form; throws with the first problem in words. Blank crew rows are dropped. */
export function dailyReportBody(f: DailyForm, latest: string) {
  const crew = f.crew
    .filter((l) => l.trade.trim() || l.workers.trim() || l.company.trim())
    .map((l, i) => ({
      company: l.company.trim() || null,
      trade: l.trade.trim(),
      workers: num(l.workers, `Crew line ${i + 1}, workers`, true) ?? 0,
      hoursEach: num(l.hoursEach, `Crew line ${i + 1}, hours each`) ?? 0,
    }));
  const body = {
    reportDate: f.reportDate,
    weather: f.weather.trim() || null,
    tempHighF: num(f.tempHighF, "High temperature", true),
    tempLowF: num(f.tempLowF, "Low temperature", true),
    delayHours: num(f.delayHours, "Hours lost"),
    delayActivityId: f.delayActivityId || null,
    crew,
    ...(Object.fromEntries(TEXT_FIELDS.map(([k]) => [k, f[k].trim() || null])) as Record<
      TextKey,
      string | null
    >),
  };
  const problem = dailyReportProblem(body, latest);
  if (problem) throw new Error(problem);
  return body;
}

type ActivityOption = { id: string; label: string };

function Fields({
  form,
  set,
  activities = [],
}: {
  form: DailyForm;
  set: (f: DailyForm) => void;
  activities?: readonly ActivityOption[];
}) {
  // A report tied to an activity deleted since still shows it was tied, until changed.
  const missing = form.delayActivityId && !activities.some((a) => a.id === form.delayActivityId);
  const field = (k: Exclude<keyof DailyForm, "crew">) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set({ ...form, [k]: e.target.value }),
  });
  const setLine = (i: number, patch: Partial<CrewForm>) =>
    set({ ...form, crew: form.crew.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const parsed = form.crew.map((l) => ({
    workers: Number(l.workers) || 0,
    hoursEach: Number(l.hoursEach) || 0,
  }));
  const totals = crewTotals(parsed);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Date
          <input type="date" className="input block" required {...field("reportDate")} />
        </label>
        <label className="text-sm">
          Weather
          <input
            className="input block w-56"
            placeholder="Clear, wind 15 mph"
            {...field("weather")}
          />
        </label>
        <label className="text-sm">
          High °F
          <input inputMode="numeric" className="input block w-16" {...field("tempHighF")} />
        </label>
        <label className="text-sm">
          Low °F
          <input inputMode="numeric" className="input block w-16" {...field("tempLowF")} />
        </label>
        <label className="text-sm">
          Hours lost to weather or delay
          <input inputMode="decimal" className="input block w-20" {...field("delayHours")} />
        </label>
        {(activities.length > 0 || missing) && (
          <label
            className="text-sm"
            title="The schedule activity the delay held up: the job schedule's delay log groups the lost hours by it"
          >
            Activity it held up
            <select className="input block w-64" {...field("delayActivityId")}>
              <option value="">None</option>
              {missing && <option value={form.delayActivityId}>(no longer on the schedule)</option>}
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Crew on site</legend>
        {form.crew.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved; order is the identity
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Company
              <input
                className="input block w-44"
                placeholder="Our crew"
                value={l.company}
                onChange={(e) => setLine(i, { company: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Trade
              <input
                className="input block w-36"
                placeholder="Electricians"
                value={l.trade}
                onChange={(e) => setLine(i, { trade: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Workers
              <input
                inputMode="numeric"
                className="input block w-16"
                value={l.workers}
                onChange={(e) => setLine(i, { workers: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Hours each
              <input
                inputMode="decimal"
                className="input block w-16"
                value={l.hoursEach}
                onChange={(e) => setLine(i, { hoursEach: e.target.value })}
              />
            </label>
            <span className="pb-2 text-sm tabular-nums text-slate-600">
              {hoursText(lineHours(parsed[i] ?? { workers: 0, hoursEach: 0 }))} h
            </span>
            <button
              type="button"
              className="pb-2 text-sm underline"
              aria-label={`Remove crew line ${i + 1}`}
              onClick={() => set({ ...form, crew: form.crew.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            className="underline"
            onClick={() => set({ ...form, crew: [...form.crew, emptyCrew()] })}
          >
            Add a crew line
          </button>
          <span className="tabular-nums text-slate-600">
            {totals.workers} workers · {hoursText(totals.manHours)} man-hours
          </span>
        </div>
      </fieldset>

      <div className="grid gap-2 md:grid-cols-2">
        {TEXT_FIELDS.map(([k, label, placeholder]) => (
          <label key={k} className="text-sm">
            {label}
            <textarea
              className="input block w-full"
              rows={k === "workPerformed" ? 4 : 2}
              placeholder={placeholder}
              {...field(k)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ReportBody({ r, own }: { r: DailyReportDto; own: string }) {
  return (
    <div className="space-y-2 text-sm">
      {r.crew.length > 0 && (
        <table className="w-full max-w-xl">
          <thead>
            <tr>
              <th className="th">Company</th>
              <th className="th">Trade</th>
              <th className="th text-right">Workers</th>
              <th className="th text-right">Hours each</th>
              <th className="th text-right">Man-hours</th>
            </tr>
          </thead>
          <tbody>
            {r.crew.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: saved crew lines are an ordered list
              <tr key={i}>
                <td className="td">{l.company ?? own}</td>
                <td className="td">{l.trade}</td>
                <td className="td text-right tabular-nums">{l.workers}</td>
                <td className="td text-right tabular-nums">{hoursText(l.hoursEach)}</td>
                <td className="td text-right tabular-nums">{hoursText(lineHours(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.delayActivityLabel && (
        <div>
          <div className="font-medium">Activity the delay held up</div>
          <p className="text-slate-700">{r.delayActivityLabel}</p>
        </div>
      )}
      {TEXT_FIELDS.map(([k, label]) =>
        r[k] ? (
          <div key={k}>
            <div className="font-medium">{label}</div>
            <p className="whitespace-pre-wrap text-slate-700">{r[k]}</p>
          </div>
        ) : null,
      )}
      <p className="text-xs text-slate-500">
        {r.createdByName ? `Written by ${r.createdByName}` : "Written in PayApps"}
        {r.updatedByName && r.updatedAt !== r.createdAt
          ? `; last changed by ${r.updatedByName} on ${r.updatedAt.slice(0, 10)}`
          : ""}
      </p>
    </div>
  );
}

export function DailyReportsPage() {
  const { orgId, projectId } = useParams({
    from: "/orgs/$orgId/projects/$projectId/daily-reports",
  });
  const base = projectPath(orgId, projectId, "/daily-reports");
  const key = ["daily-reports", orgId, projectId];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: () => api<DailyReportLogDto>(base) });
  const [form, setForm] = useState<DailyForm | null>(null);
  const [editing, setEditing] = useState<{ id: string; form: DailyForm } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // The report whose photos and files panel is open.
  const [filesOf, setFilesOf] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (f: DailyForm) =>
      api<DailyReportDto>(base, {
        method: "POST",
        body: dailyReportBody(f, q.data?.latestDate ?? f.reportDate),
      }),
    onSuccess: async (r) => {
      setForm(null);
      setOpen(r.id);
      await refresh();
    },
  });
  const save = useMutation({
    mutationFn: (e: { id: string; form: DailyForm }) =>
      api(`${base}/${e.id}`, {
        method: "PATCH",
        body: dailyReportBody(e.form, q.data?.latestDate ?? e.form.reportDate),
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (r: DailyReportDto) => api(`${base}/${r.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const d = q.data;
  const latest = d.items[0];
  const s = d.summary;
  const own = "Our crew";
  const pick = range ?? {
    from: s.lastDate ? addDays(s.lastDate, -6) : d.suggestedDate,
    to: s.lastDate ?? d.suggestedDate,
  };

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
        <h1 className="text-2xl font-semibold">Daily reports</h1>
        <p className="text-sm text-slate-600">
          What happened on site each day: crew and hours, the work done, weather and delays. The
          record you point to when {d.gcName} questions a change order, a delay or a pay
          application.{" "}
          {d.items.length > 0 && (
            <a className="underline" href={`${base}/log.csv`}>
              Download CSV
            </a>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Reports", String(s.reports)],
            ["Man-hours logged", hoursText(s.manHours)],
            ["Days with hours lost", `${s.delayDays} (${hoursText(s.delayHours)} h)`],
            ["Weekdays without a report", String(s.missing.total)],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{n}</div>
          </div>
        ))}
      </div>
      {s.missing.total > 0 && (
        <p className="text-sm text-amber-800">
          No report since the first one on:{" "}
          {s.missing.days.slice(0, 8).map((day, i) => (
            <Fragment key={day}>
              {i > 0 && ", "}
              {d.canEdit ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setForm(latest ? formFromPrevious(latest, day) : emptyDailyForm(day))
                  }
                >
                  {dayLabel(day)}
                </button>
              ) : (
                dayLabel(day)
              )}
            </Fragment>
          ))}
          {s.missing.total > 8 && ` and ${s.missing.total - 8} more`}. Weekdays only; a day off the
          job shows here too.
        </p>
      )}
      {s.reports > 0 && (
        <p className="text-xs text-slate-500">
          {s.missing.holidays.length > 0
            ? `Not counted as missing: ${s.missing.holidays
                .slice(0, 6)
                .map((h) => `${h.name} (${dayLabel(h.on)})`)
                .join(
                  ", ",
                )}${s.missing.holidays.length > 6 ? ` and ${s.missing.holidays.length - 6} more` : ""}, from the company's holidays. `
            : "No company holidays fall in this log. "}
          <Link to="/orgs/$orgId/crews" params={{ orgId }} hash="holidays-h" className="underline">
            Company holidays
          </Link>{" "}
          are left out of the missing days, as they are out of the schedule's workdays.
        </p>
      )}

      {d.canEdit && !form && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => setForm(emptyDailyForm(d.suggestedDate))}
          >
            New daily report
          </button>
          {latest && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setForm(formFromPrevious(latest, d.suggestedDate))}
            >
              New, with the crew from {latest.reportDate}
            </button>
          )}
        </div>
      )}

      {form && (
        <section className="card space-y-2">
          <h2 className="font-semibold">New daily report</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(form);
            }}
          >
            <Fields form={form} set={setForm} activities={d.activities} />
            <div className="flex gap-2">
              <button type="submit" className="btn" disabled={add.isPending}>
                Save report
              </button>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
            <ErrorText error={add.error} />
          </form>
        </section>
      )}

      {d.items.length > 0 && (
        <section className="card flex flex-wrap items-end gap-2 text-sm">
          <label>
            From
            <input
              type="date"
              className="input block"
              value={pick.from}
              onChange={(e) => setRange({ ...pick, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              className="input block"
              value={pick.to}
              onChange={(e) => setRange({ ...pick, to: e.target.value })}
            />
          </label>
          <a
            className="btn-secondary"
            href={`${base}/range.pdf?${new URLSearchParams(pick).toString()}`}
          >
            Download these days as one PDF
          </a>
          <span className="text-xs text-slate-500">
            A week's reports for the GC, or a month's with the pay application (up to three months).
          </span>
        </section>
      )}

      <section className="card space-y-2 overflow-x-auto">
        <ErrorText error={save.error ?? remove.error} />
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Day</th>
              <th className="th">Weather</th>
              <th className="th text-right">Workers</th>
              <th className="th text-right">Man-hours</th>
              <th className="th text-right">Hours lost</th>
              <th className="th">Work performed</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {d.items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  {editing?.id === r.id ? (
                    <td className="td" colSpan={7}>
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          save.mutate(editing);
                        }}
                      >
                        <Fields
                          form={editing.form}
                          set={(f) => setEditing({ id: r.id, form: f })}
                          activities={d.activities}
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
                      <td className="td whitespace-nowrap">
                        <button
                          type="button"
                          className="font-medium underline"
                          aria-expanded={open === r.id}
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                        >
                          {dayLabel(r.reportDate)}
                        </button>
                      </td>
                      <td className="td">{weatherText(r) || "—"}</td>
                      <td className="td text-right tabular-nums">{r.workers}</td>
                      <td className="td text-right tabular-nums">{hoursText(r.manHours)}</td>
                      <td className="td text-right tabular-nums">
                        {r.delayHours === null ? "—" : hoursText(r.delayHours)}
                        {r.delayActivityLabel && (
                          <div className="text-xs text-slate-500" title={r.delayActivityLabel}>
                            {r.delayActivityLabel.split(" ")[0]}
                          </div>
                        )}
                      </td>
                      <td className="td max-w-xs truncate">{r.workPerformed ?? "—"}</td>
                      <td className="td whitespace-nowrap text-right">
                        <a
                          className="underline"
                          href={`${base}/${encodeURIComponent(r.id)}/report.pdf`}
                        >
                          PDF
                        </a>
                        {r.fileCount > 0 && (
                          <>
                            {" · "}
                            <a
                              className="underline"
                              href={`${base}/${encodeURIComponent(r.id)}/packet.pdf`}
                              title="The report, an index, then its photos and files in one PDF"
                            >
                              PDF + photos
                            </a>
                          </>
                        )}
                        {" · "}
                        <button
                          type="button"
                          className="underline"
                          aria-expanded={filesOf === r.id}
                          onClick={() => setFilesOf(filesOf === r.id ? null : r.id)}
                        >
                          {r.fileCount > 0
                            ? `Photos (${r.fileCount})`
                            : d.canEdit
                              ? "Add photos"
                              : "Photos"}
                        </button>
                        {d.canEdit && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setEditing({ id: r.id, form: dailyFormOf(r) })}
                            >
                              Edit
                            </button>
                            {" · "}
                            <button
                              type="button"
                              className="underline"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(`Delete the report for ${dayLabel(r.reportDate)}?`)
                                ) {
                                  remove.mutate(r);
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
                {open === r.id && editing?.id !== r.id && (
                  <tr>
                    <td className="td bg-slate-50" colSpan={7}>
                      <ReportBody r={r} own={own} />
                    </td>
                  </tr>
                )}
                {filesOf === r.id && editing?.id !== r.id && (
                  <tr>
                    <td className="td bg-slate-50" colSpan={7}>
                      <AttachmentsPanel
                        base={`${base}/${encodeURIComponent(r.id)}`}
                        holder="dailyReport"
                        embedded
                        onChanged={refresh}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {d.items.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={7}>
                  No daily reports on this job yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">{DAILY_REPORTS_NOTE}</p>
    </div>
  );
}

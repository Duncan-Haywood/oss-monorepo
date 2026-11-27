// /orgs/$orgId/crews : the crew lookahead across every active job (services/payapps/crew-lookahead.ts):
// each crew, as typed on the job schedules, with its open activities drawn as bars over the
// workdays, and the days it has work on two jobs. Read-only; each job's schedule is edited on the
// job page. Downloads as a PDF for the Monday crew meeting. Below it, the company's holidays that
// every schedule's workday math leaves out (services/payapps/holidays.ts): editors type one or add
// the federal list for a year and delete the days the crews work.
import type { CompanyHolidaysDto, CrewLookaheadDto } from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import {
  ACTIVITY_STATUS_LABELS,
  type ActivityStatus,
  activityLabel,
  type CompanyHoliday,
  federalHolidays,
  SCHEDULE_ANCHOR,
} from "@shared/schedule";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";

const BAR_CLASS: Record<ActivityStatus, string> = {
  not_started: "bg-slate-400",
  in_progress: "bg-blue-600",
  done: "bg-green-600",
  late_start: "bg-red-600",
  late_finish: "bg-red-600",
};

const SHORT_DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dayLabel = (d: string) =>
  `${SHORT_DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(5)}`;

export function CrewsPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/crews" });
  const [weeks, setWeeks] = useState(2);
  const q = useQuery({
    queryKey: ["crew-lookahead", orgId, weeks],
    queryFn: () => api<CrewLookaheadDto>(orgPath(orgId, `/schedule/crews?weeks=${weeks}`)),
  });
  return (
    <div className="space-y-4">
      <div>
        <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm text-slate-600 underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">Crew lookahead</h1>
        <p className="text-sm text-slate-600">
          Who is where: every active job's open schedule activities, by the trade or crew typed on
          them. Edit an activity on its job's schedule.{" "}
          <a className="underline" href={orgPath(orgId, `/schedule/crews.pdf?weeks=${weeks}`)}>
            Download PDF
          </a>
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-slate-600">Weeks</span>
          <select
            className="input w-24"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.error && <ErrorText error={q.error} />}
      {!q.data && !q.error && <p className="text-sm text-slate-500">Loading…</p>}
      {q.data && <Crews orgId={orgId} la={q.data} />}
      <Holidays orgId={orgId} />
    </div>
  );
}

const SHORT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Holidays(props: { orgId: string }) {
  const { orgId } = props;
  const url = orgPath(orgId, "/schedule/holidays");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.editor;
  const q = useQuery({
    queryKey: ["holidays", orgId],
    queryFn: () => api<CompanyHolidaysDto>(url),
  });
  // Every schedule and lookahead reads the holidays, so all of them refresh.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["holidays", orgId] }),
      qc.invalidateQueries({ queryKey: ["crew-lookahead", orgId] }),
      qc.invalidateQueries({ queryKey: ["schedule"] }),
    ]);
  const [on, setOn] = useState("");
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: (holidays: CompanyHoliday[]) =>
      api<CompanyHolidaysDto>(url, { method: "POST", body: { holidays } }),
    onSuccess: () => {
      setOn("");
      setName("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${url}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => refresh(),
  });
  const year = new Date().getFullYear();
  const list = q.data?.holidays ?? [];
  const listed = new Set(list.map((h) => h.on));
  const missing = (y: number) => federalHolidays(y).filter((h) => !listed.has(h.on));
  return (
    <section className="card space-y-2" aria-labelledby="holidays-h">
      <h2 id="holidays-h" className="font-semibold">
        Company holidays
      </h2>
      <p className="text-sm text-slate-600">
        Days your crews do not work. Every job's workday counts, the "waits for" check, moving
        activities and both lookaheads skip them. Nothing is assumed: add the days you take off. The
        federal list is a starting point (many subs work Columbus Day and Veterans Day); delete what
        your crews work.
      </p>
      {q.error && <ErrorText error={q.error} />}
      {q.data && list.length === 0 && (
        <p className="text-sm text-slate-500">No holidays listed: only weekends are skipped.</p>
      )}
      {list.length > 0 && (
        <ul className="divide-y text-sm">
          {list.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-1">
              <span>
                <span className="tabular-nums">{h.on}</span>{" "}
                <span className="text-slate-500">
                  {SHORT_DOW[new Date(`${h.on}T00:00:00Z`).getUTCDay()]}
                </span>{" "}
                {h.name}
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="link text-red-700"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(h.id)}
                  aria-label={`Delete ${h.name} ${h.on}`}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <div className="flex flex-wrap gap-2">
            {[year, year + 1].map((y) => {
              const m = missing(y);
              return (
                <button
                  key={y}
                  type="button"
                  className="btn"
                  disabled={add.isPending || m.length === 0}
                  onClick={() => add.mutate(m)}
                >
                  {m.length === 0
                    ? `${y} federal holidays listed`
                    : `Add ${m.length} federal holiday${m.length === 1 ? "" : "s"} for ${y}`}
                </button>
              );
            })}
          </div>
          <form
            className="flex flex-wrap items-end gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (on && name.trim()) add.mutate([{ on, name: name.trim() }]);
            }}
          >
            <label className="flex flex-col">
              <span className="text-slate-600">Date</span>
              <input
                type="date"
                className="input"
                value={on}
                onChange={(e) => setOn(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col">
              <span className="text-slate-600">Name</span>
              <input
                className="input"
                value={name}
                maxLength={80}
                placeholder="Day after Thanksgiving"
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn" disabled={add.isPending}>
              Add holiday
            </button>
          </form>
          <ErrorText error={add.error ?? remove.error} />
        </>
      )}
    </section>
  );
}

function Crews(props: { orgId: string; la: CrewLookaheadDto }) {
  const { orgId, la } = props;
  const days = la.lookahead.days;
  if (la.groups.length === 0) {
    return (
      <div className="card text-sm text-slate-600">
        Nothing open on any active job from {la.lookahead.from} to {la.lookahead.to}. Add
        activities, with the trade or crew doing each, on a job's schedule.
      </div>
    );
  }
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {la.lookahead.from} to {la.lookahead.to}, {la.jobCount} active job
        {la.jobCount === 1 ? "" : "s"}, as of {la.today}. Crews are matched by the name typed
        (capitals and extra spaces ignored). Weekends are left out, and the company holidays listed
        below
        {la.lookahead.holidays.length > 0
          ? ` (${la.lookahead.holidays.map((h) => `${h.on.slice(5)} ${h.name}`).join(", ")})`
          : ""}
        . Two jobs on one day is what the dates say: a crew can split.
      </p>
      {la.truncated && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          More open activities than one lookahead lists: the earliest starts are shown.
        </p>
      )}
      {la.groups.map((g) => (
        <section key={g.crew ?? ""} className="card">
          <h2 className="font-semibold">
            {g.crew ?? "No trade or crew named"}{" "}
            <span className="text-sm font-normal text-slate-600">
              {g.activities.length} activit{g.activities.length === 1 ? "y" : "ies"} on {g.jobCount}{" "}
              job{g.jobCount === 1 ? "" : "s"}
            </span>
          </h2>
          {g.daysOnSeveralJobs.length > 0 && (
            <p className="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-900">
              On two or more jobs: {g.daysOnSeveralJobs.map((d) => dayLabel(d.day)).join(", ")}
            </p>
          )}
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[640px] text-xs">
              <div className="grid grid-cols-[14rem_1fr] gap-2">
                <span />
                <div className="grid" style={cols}>
                  {days.map((d) => (
                    <span
                      key={d}
                      className={`text-center ${d === la.today ? "rounded bg-amber-100 font-semibold" : "text-slate-500"}`}
                    >
                      {d.slice(8)}
                    </span>
                  ))}
                </div>
              </div>
              {g.activities.map((a) => (
                <div
                  key={`${a.projectId}-${a.number}`}
                  className="grid grid-cols-[14rem_1fr] items-center gap-2 py-0.5"
                >
                  <span className="truncate" title={`${a.projectName}: ${a.name}`}>
                    <Link
                      to="/orgs/$orgId/projects/$projectId"
                      params={{ orgId, projectId: a.projectId }}
                      hash={SCHEDULE_ANCHOR}
                      className="underline"
                    >
                      {a.projectName}
                    </Link>
                    {a.isSample && <span className="text-slate-500"> (sample)</span>}{" "}
                    {activityLabel(a.number)} {a.name}
                    {(a.status === "late_start" || a.status === "late_finish") && (
                      <span className="font-semibold text-red-700">
                        {" "}
                        {ACTIVITY_STATUS_LABELS[a.status]}
                      </span>
                    )}
                  </span>
                  <div className="grid h-3" style={cols}>
                    {days.map((d) => (
                      <span
                        key={d}
                        className={
                          d >= a.startOn && d <= a.barEnd ? BAR_CLASS[a.status] : "bg-slate-100"
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

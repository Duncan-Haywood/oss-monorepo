// /orgs/$orgId/timesheets: crew timesheets. The company's own workers with their pay rates, each
// worker's hours per day on a job and schedule-of-values line for one workweek, the week's straight
// time, overtime and wages, and "Post to job costs", which turns the week into one labor cost per job
// and line (docs/TIMESHEETS.md). Rates and hours are typed here; the payroll service still runs payroll.
import type { CrewDto, CrewMemberDto, TimesheetPostDto, TimesheetWeekDto } from "@shared/api/types";
import { formatBps, formatCents, parseDollarsToCents, parsePercentToBps } from "@shared/money";
import {
  addDays,
  formatHours,
  MAX_BURDEN_BPS,
  MAX_ROWS_PER_WORKER_WEEK,
  parseHours,
  WEEK_DAY_NAMES,
  weekStartFor,
} from "@shared/timesheets";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorText } from "../components/error";
import { api, orgPath } from "../lib/api";

export interface RowForm {
  projectId: string;
  sovLineId: string;
  hours: string[];
}

const blankRow = (projectId = ""): RowForm => ({
  projectId,
  sovLineId: "",
  hours: ["", "", "", "", "", "", ""],
});

/** The worker's rows as the API body, or the first problem to show. */
export function readRows(
  rows: RowForm[],
):
  | { rows: { projectId: string; sovLineId: string | null; hours: number[] }[] }
  | { problem: string } {
  const out = [];
  for (const [i, r] of rows.entries()) {
    const hours = r.hours.map((h) => parseHours(h));
    if (hours.some((h) => h === null))
      return { problem: `Row ${i + 1}: hours are a number such as 8 or 7.5 (up to 24 a day).` };
    const hs = hours as number[];
    if (hs.every((h) => h === 0)) continue;
    if (!r.projectId) return { problem: `Row ${i + 1}: pick the job.` };
    out.push({ projectId: r.projectId, sovLineId: r.sovLineId || null, hours: hs });
  }
  return { rows: out };
}

const today = () => new Date().toISOString().slice(0, 10);
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEK_DAY_NAMES[d.getUTCDay()]?.slice(0, 3)} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const h = (x: number) => formatHours(x);
const money = (c: number | null) => (c === null ? "no rate" : formatCents(c));

function CrewSection(props: { orgId: string; crew: CrewDto }) {
  const { orgId, crew } = props;
  const qc = useQueryClient();
  const path = orgPath(orgId, "/timesheets");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [rate, setRate] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; rate: string; trade: string } | null>(null);
  const done = async (d: CrewDto) => {
    qc.setQueryData(["timesheets-crew", orgId], d);
    await qc.invalidateQueries({ queryKey: ["timesheets-week", orgId] });
  };
  const add = useMutation({
    mutationFn: (body: unknown) => api<CrewDto>(`${path}/crew`, { method: "POST", body }),
    onSuccess: async (d) => {
      setName("");
      setTrade("");
      setRate("");
      await done(d);
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: unknown }) =>
      api<CrewDto>(`${path}/crew/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: async (d) => {
      setEditing(null);
      await done(d);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<CrewDto>(`${path}/crew/${id}`, { method: "DELETE" }),
    onSuccess: done,
  });
  const settings = useMutation({
    mutationFn: (weekStartDay: number) =>
      api<CrewDto>(`${path}/settings`, { method: "PUT", body: { weekStartDay } }),
    onSuccess: done,
  });
  const readRate = (s: string): number | null | false => {
    if (!s.trim()) return null;
    const c = parseDollarsToCents(s);
    return c === null || c < 0 ? false : c;
  };

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Crew</h2>
        <label className="text-sm">
          <span className="mr-2 text-slate-500">Workweek starts</span>
          <select
            className="input w-auto"
            value={crew.weekStartDay}
            disabled={crew.weekStartLocked || settings.isPending}
            title={crew.weekStartLocked ? "Fixed once hours are entered" : undefined}
            onChange={(e) => settings.mutate(Number(e.target.value))}
          >
            {WEEK_DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText error={settings.error} />
      <form
        className="flex flex-wrap items-end gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const r = readRate(rate);
          if (!name.trim()) return setProblem("Name the worker.");
          if (r === false)
            return setProblem("The rate does not read: dollars an hour, such as 38.50.");
          setProblem(null);
          add.mutate({ name, trade: trade || null, rateCents: r });
        }}
      >
        <label className="block">
          <span className="text-xs text-slate-500">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Trade or classification</span>
          <input
            className="input"
            placeholder="Journeyman electrician"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Rate per hour (optional)</span>
          <input
            className="input w-28 text-right"
            inputMode="decimal"
            placeholder="38.50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add worker"}
        </button>
      </form>
      {problem && <p className="text-sm text-red-700">{problem}</p>}
      <ErrorText error={add.error ?? patch.error ?? remove.error} />
      {crew.members.length === 0 ? (
        <p className="text-sm text-slate-500">
          Add the people who work for you (not your subs' crews). A rate turns their hours into
          labor cost; without one their hours are kept and cost nothing.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Name</th>
                <th>Trade</th>
                <th className="text-right">Rate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {crew.members.map((m) => (
                <CrewRow
                  key={m.id}
                  m={m}
                  editing={editing?.id === m.id ? editing : null}
                  setEditing={setEditing}
                  onSave={(e) => {
                    const r = readRate(e.rate);
                    if (r === false) return setProblem("The rate does not read.");
                    patch.mutate({ id: m.id, body: { rateCents: r, trade: e.trade || null } });
                  }}
                  onActive={(active) => patch.mutate({ id: m.id, body: { active } })}
                  onDelete={() => remove.mutate(m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        {crew.members.length} of {crew.limit} workers.
      </p>
    </section>
  );
}

function CrewRow(props: {
  m: CrewMemberDto;
  editing: { id: string; rate: string; trade: string } | null;
  setEditing: (e: { id: string; rate: string; trade: string } | null) => void;
  onSave: (e: { rate: string; trade: string }) => void;
  onActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const { m, editing, setEditing } = props;
  if (editing)
    return (
      <tr className="border-t">
        <td className="py-1">{m.name}</td>
        <td>
          <input
            className="input"
            value={editing.trade}
            onChange={(e) => setEditing({ ...editing, trade: e.target.value })}
          />
        </td>
        <td className="text-right">
          <input
            className="input w-24 text-right"
            inputMode="decimal"
            value={editing.rate}
            onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
          />
        </td>
        <td className="space-x-2 text-right">
          <button type="button" className="underline" onClick={() => props.onSave(editing)}>
            Save
          </button>
          <button type="button" className="underline" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </td>
      </tr>
    );
  return (
    <tr className={`border-t ${m.active ? "" : "text-slate-400"}`}>
      <td className="py-1">
        {m.name}
        {!m.active && " (inactive)"}
      </td>
      <td>{m.trade ?? ""}</td>
      <td className="text-right">{m.rateCents === null ? "none" : formatCents(m.rateCents)}</td>
      <td className="space-x-2 text-right">
        <button
          type="button"
          className="underline"
          onClick={() =>
            setEditing({
              id: m.id,
              trade: m.trade ?? "",
              rate: m.rateCents === null ? "" : (m.rateCents / 100).toFixed(2),
            })
          }
        >
          Edit
        </button>
        {m.hasHours ? (
          <button type="button" className="underline" onClick={() => props.onActive(!m.active)}>
            {m.active ? "Make inactive" : "Make active"}
          </button>
        ) : (
          <button type="button" className="underline" onClick={props.onDelete}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

function WorkerWeek(props: { orgId: string; week: TimesheetWeekDto; member: CrewMemberDto }) {
  const { orgId, week, member } = props;
  const qc = useQueryClient();
  const saved = week.rows.filter((r) => r.workerId === member.id);
  const fromSaved = (): RowForm[] =>
    saved.length > 0
      ? saved.map((r) => ({
          projectId: r.projectId,
          sovLineId: r.sovLineId ?? "",
          hours: r.hours.map((x) => (x === 0 ? "" : formatHours(x))),
        }))
      : [blankRow(week.jobs.length === 1 ? week.jobs[0]?.id : "")];
  const [rows, setRows] = useState<RowForm[]>(fromSaved);
  const [problem, setProblem] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the week or saved rows change
  useEffect(() => setRows(fromSaved()), [week.weekStart, JSON.stringify(saved)]);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      api<TimesheetWeekDto>(
        orgPath(orgId, `/timesheets/weeks/${week.weekStart}/workers/${member.id}`),
        { method: "PUT", body },
      ),
    onSuccess: (w) => qc.setQueryData(["timesheets-week", orgId, week.weekStart], w),
  });
  const totals = week.workers.find((w) => w.workerId === member.id);
  const setRow = (i: number, r: RowForm) => setRows(rows.map((x, k) => (k === i ? r : x)));

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {member.name}
          {member.trade && <span className="text-slate-500">, {member.trade}</span>}
        </h3>
        {totals && (
          <span className="text-sm text-slate-600">
            {h(totals.total)} h ({h(totals.regular)} straight, {h(totals.overtime)} overtime),{" "}
            {money(totals.grossCents)}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th>Job</th>
              <th>Line</th>
              {week.days.map((d) => (
                <th key={d} className="px-1 text-right">
                  {dayLabel(d)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const job = week.jobs.find((j) => j.id === r.projectId);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved
                <tr key={i}>
                  <td>
                    <select
                      className="input w-44"
                      aria-label="Job"
                      value={r.projectId}
                      onChange={(e) =>
                        setRow(i, { ...r, projectId: e.target.value, sovLineId: "" })
                      }
                    >
                      <option value="">Pick a job</option>
                      {week.jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.number ? `${j.number} ` : ""}
                          {j.name}
                          {j.status === "closed" ? " (closed)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input w-40"
                      aria-label="Schedule-of-values line"
                      value={r.sovLineId}
                      onChange={(e) => setRow(i, { ...r, sovLineId: e.target.value })}
                    >
                      <option value="">No line</option>
                      {job?.lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.itemNumber} {l.description}
                        </option>
                      ))}
                    </select>
                  </td>
                  {r.hours.map((x, d) => (
                    <td key={week.days[d]} className="px-1">
                      <input
                        className="input w-14 text-right"
                        inputMode="decimal"
                        aria-label={`Hours ${week.days[d]}`}
                        value={x}
                        onChange={(e) =>
                          setRow(i, {
                            ...r,
                            hours: r.hours.map((y, k) => (k === d ? e.target.value : y)),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="text-slate-500 underline"
                      onClick={() => setRows(rows.filter((_, k) => k !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          className="underline"
          disabled={rows.length >= MAX_ROWS_PER_WORKER_WEEK}
          onClick={() => setRows([...rows, blankRow()])}
        >
          Add a row
        </button>
        <button
          type="button"
          className="btn"
          disabled={save.isPending}
          onClick={() => {
            const r = readRows(rows);
            if ("problem" in r) return setProblem(r.problem);
            setProblem(null);
            save.mutate(r);
          }}
        >
          {save.isPending ? "Saving…" : "Save hours"}
        </button>
      </div>
      {problem && <p className="text-sm text-red-700">{problem}</p>}
      <ErrorText error={save.error} />
    </div>
  );
}

function PostSection(props: { orgId: string; week: TimesheetWeekDto }) {
  const { orgId, week } = props;
  const qc = useQueryClient();
  const [burden, setBurden] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const post = useMutation({
    mutationFn: (burdenBps: number) =>
      api<TimesheetPostDto>(orgPath(orgId, `/timesheets/weeks/${week.weekStart}/post`), {
        method: "POST",
        body: { burdenBps },
      }),
    onSuccess: (r) => {
      qc.setQueryData(["timesheets-week", orgId, week.weekStart], r.week);
      setResult(
        `${r.added} labor cost${r.added === 1 ? "" : "s"} added to ${r.jobs.filter((j) => j.added > 0).length} job${r.jobs.length === 1 ? "" : "s"}` +
          (r.skipped ? `; ${r.skipped} already posted for this week, left as they are.` : "."),
      );
    },
  });
  if (week.labor.length === 0 && week.unrated.length === 0) return null;
  const changed = week.labor.filter((l) => l.postedCents !== null);

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Labor by job, week ending {week.weekEnding}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">Job</th>
              <th>Line</th>
              <th className="text-right">Hours</th>
              <th className="text-right">Overtime</th>
              <th className="text-right">Wages</th>
              <th className="text-right">Posted</th>
            </tr>
          </thead>
          <tbody>
            {week.labor.map((l) => (
              <tr key={l.reference + l.projectId} className="border-t">
                <td className="py-1">
                  <Link
                    to="/orgs/$orgId/projects/$projectId/job-cost"
                    params={{ orgId, projectId: l.projectId }}
                    className="underline"
                  >
                    {l.projectName}
                  </Link>
                </td>
                <td>{l.itemNumber ?? "no line"}</td>
                <td className="text-right">{h(l.hours)}</td>
                <td className="text-right">{h(l.overtime)}</td>
                <td className="text-right">{formatCents(l.wagesCents)}</td>
                <td className="text-right">
                  {l.postedCents === null ? "not yet" : formatCents(l.postedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {week.unrated.length > 0 && (
        <p className="text-sm text-amber-700">
          No pay rate for {week.unrated.join(", ")}: their hours are kept but cost nothing. Add a
          rate under Crew before posting.
        </p>
      )}
      {changed.length > 0 && (
        <p className="text-xs text-slate-500">
          Posted lines are not posted again. If you change hours after posting, edit or delete that
          week's "Timesheet w/e {week.weekEnding}" cost on the job-cost page, then post again.
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const bps = burden.trim() ? parsePercentToBps(burden, MAX_BURDEN_BPS) : 0;
          if (bps === null) return setProblem("Burden is a percent of wages, 0 to 200.");
          setProblem(null);
          post.mutate(bps);
        }}
      >
        <label className="block">
          <span className="text-xs text-slate-500">
            Labor burden on wages (payroll taxes, comp, benefits), %
          </span>
          <input
            className="input w-24 text-right"
            inputMode="decimal"
            placeholder="0"
            value={burden}
            onChange={(e) => setBurden(e.target.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={post.isPending}>
          {post.isPending ? "Posting…" : "Post to job costs"}
        </button>
      </form>
      <p className="text-xs text-slate-500">
        One labor cost per job and line, dated {week.weekEnding}: wages
        {burden.trim() && parsePercentToBps(burden, MAX_BURDEN_BPS) !== null
          ? ` plus ${formatBps(parsePercentToBps(burden, MAX_BURDEN_BPS) ?? 0)}`
          : ""}
        . No burden is assumed; leave it blank to post wages only. Posting needs job costing (Crew
        plan and up).
      </p>
      {problem && <p className="text-sm text-red-700">{problem}</p>}
      {result && <p className="text-sm text-emerald-700">{result}</p>}
      <ErrorText error={post.error} />
    </section>
  );
}

export function TimesheetsPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/timesheets" });
  const crew = useQuery({
    queryKey: ["timesheets-crew", orgId],
    queryFn: () => api<CrewDto>(orgPath(orgId, "/timesheets/crew")),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const startDay = crew.data?.weekStartDay;
  const weekStart = startDay === undefined ? null : weekStartFor(picked ?? today(), startDay);
  const week = useQuery({
    queryKey: ["timesheets-week", orgId, weekStart],
    enabled: weekStart !== null,
    queryFn: () => api<TimesheetWeekDto>(orgPath(orgId, `/timesheets/weeks/${weekStart}`)),
  });

  if (crew.error) return <ErrorText error={crew.error} />;
  if (!crew.data || weekStart === null) return <p className="text-sm text-slate-500">Loading…</p>;
  const w = week.data;
  const active = crew.data.members.filter(
    (m) => m.active || w?.rows.some((r) => r.workerId === m.id),
  );
  const base = orgPath(orgId, `/timesheets/weeks/${weekStart}`);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm text-slate-600 underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">Timesheets</h1>
        <p className="text-sm text-slate-600">
          Your crew's hours by day, job and schedule-of-values line. The week's overtime and wages
          are worked out, and "Post to job costs" puts the labor on each job's costs, so job costing
          and the WIP schedule show labor as it is worked instead of after payroll.
        </p>
      </div>

      <CrewSection orgId={orgId} crew={crew.data} />

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="underline"
              onClick={() => setPicked(addDays(weekStart, -7))}
            >
              ← Previous week
            </button>
            <span className="font-semibold">
              Week of {dayLabel(weekStart)} to {dayLabel(addDays(weekStart, 6))}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => setPicked(addDays(weekStart, 7))}
            >
              Next week →
            </button>
            <button type="button" className="underline" onClick={() => setPicked(null)}>
              This week
            </button>
          </div>
          {w && w.workers.length > 0 && (
            <span className="flex gap-3 text-sm">
              <a className="underline" href={`${base}/payroll.csv`}>
                Payroll CSV
              </a>
              <a className="underline" href={`${base}/time.csv`}>
                Time detail CSV
              </a>
            </span>
          )}
        </div>
        {week.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ErrorText error={week.error} />
        {w && w.jobs.length === 0 && (
          <p className="text-sm text-slate-500">Add a job first: hours go on a job.</p>
        )}
        {w && active.length === 0 && (
          <p className="text-sm text-slate-500">Add a worker under Crew to enter hours.</p>
        )}
        {w &&
          w.jobs.length > 0 &&
          active.map((m) => <WorkerWeek key={m.id} orgId={orgId} week={w} member={m} />)}
        {w && w.workers.length > 0 && (
          <p className="border-t pt-2 text-sm">
            Week: {h(w.totals.hours)} hours, {h(w.totals.overtime)} overtime,{" "}
            {formatCents(w.totals.grossCents)} in wages
            {w.unrated.length > 0 ? " (workers with no rate not counted)" : ""}.
          </p>
        )}
        {w?.problems.map((p) => (
          <p key={p} className="text-sm text-red-700">
            {p}
          </p>
        ))}
        {w && <p className="text-xs text-slate-500">{w.note}</p>}
      </section>

      {w && <PostSection orgId={orgId} week={w} />}
    </div>
  );
}

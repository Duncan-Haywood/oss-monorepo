// Import the job's activities from the GC's Primavera P6 schedule (.xer export), read in the browser
// (src/shared/schedule-xer.ts): the file never leaves it, only the activities the contractor ticks
// go to POST .../schedule/import. A later export of the GC's update, read the same way, updates
// the activities already imported (matched by P6 activity ID) and adds the new ones.
import type { ScheduleDto, ScheduleImportDto } from "@shared/api/types";
import {
  filterXerActivities,
  pickPredecessor,
  readXerSchedule,
  type XerActivity,
  type XerScheduleRead,
  xerNotes,
} from "@shared/schedule-xer";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

/** The most rows drawn at once; a filter narrows a GC's schedule to the sub's work. */
const MAX_SHOWN = 300;

/** The request body: the ticked activities, each with the one predecessor the job keeps. */
export function scheduleImportBody(
  activities: readonly XerActivity[],
  keep: ReadonlySet<string>,
  onJob: ReadonlyMap<string, string>,
  trade: string,
) {
  const kept = activities.filter((a) => keep.has(a.code));
  // What a predecessor can be: an activity on the job after the import, with its finish then.
  const finishOf = new Map(onJob);
  for (const a of kept) finishOf.set(a.code, a.finishOn);
  return {
    trade: trade.trim() || null,
    items: kept.map((a) => {
      const pred = pickPredecessor(a, finishOf);
      return {
        sourceCode: a.code,
        name: a.name,
        startOn: a.startOn,
        finishOn: a.finishOn,
        percentComplete: a.percentComplete,
        predecessorCode: pred?.code ?? null,
        lagDays: pred?.lagDays ?? 0,
        notes: xerNotes(a, pred),
      };
    }),
  };
}

export function ScheduleImport({
  url,
  schedule,
  onDone,
}: {
  /** `/api/orgs/:orgId/projects/:projectId/schedule` */
  url: string;
  schedule: ScheduleDto;
  onDone: () => Promise<unknown>;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [read, setRead] = useState<XerScheduleRead | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [trade, setTrade] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // P6 activity ID -> finish, for the activities already imported onto the job.
  const onJob = new Map<string, string>();
  for (const a of schedule.activities) if (a.sourceCode) onJob.set(a.sourceCode, a.finishOn);

  const show = (r: XerScheduleRead) => {
    setRead(r);
    // An update of the GC's schedule: the activities already on the job start ticked.
    setKeep(new Set(r.ok ? r.activities.filter((a) => onJob.has(a.code)).map((a) => a.code) : []));
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setDone(null);
    try {
      const b = new Uint8Array(await file.arrayBuffer());
      setBytes(b);
      show(readXerSchedule(b));
    } finally {
      setReading(false);
    }
  };

  // The body is built at the click and passed to mutate(): useMutation takes new options in an
  // effect, so a mutationFn reading `read` could see the render before the file was read (as the
  // SOV import's did, deploy run 45950799211).
  const save = useMutation({
    mutationFn: (body: ReturnType<typeof scheduleImportBody>) =>
      api<ScheduleImportDto>(`${url}/import`, { method: "POST", body }),
    onSuccess: async (r) => {
      setDone(`Added ${r.added} and updated ${r.updated} from the GC's schedule.`);
      setRead(null);
      setBytes(null);
      setKeep(new Set());
      await onDone();
    },
  });

  const shown = read?.ok ? filterXerActivities(read.activities, filter) : [];
  const toggle = (code: string, on: boolean) => {
    const next = new Set(keep);
    if (on) next.add(code);
    else next.delete(code);
    setKeep(next);
  };
  const tickShown = (on: boolean) => {
    const next = new Set(keep);
    for (const a of shown) {
      if (on) next.add(a.code);
      else next.delete(a.code);
    }
    setKeep(next);
  };
  const updating = read?.ok
    ? read.activities.filter((a) => keep.has(a.code) && onJob.has(a.code)).length
    : 0;

  return (
    <details className="mt-4 text-sm" open={read !== null || undefined}>
      <summary className="cursor-pointer font-medium">
        Import from the GC's P6 schedule (.xer)
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-slate-600">
          Ask the GC for their Primavera P6 export (File, Export, Primavera PM .xer). It is read in
          this browser and never uploaded. Tick your activities (the filter finds them by ID, name
          or WBS); each keeps P6's dates, percent complete and the finish-to-start link that drives
          it, and the notes name its other links. When the GC sends an update, import it the same
          way: the activities already here are matched by P6 activity ID and updated.
        </p>
        <input
          type="file"
          aria-label="P6 XER file"
          accept=".xer,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0])}
          disabled={reading}
        />
        {reading && <p className="text-slate-500">Reading…</p>}
        {done && (
          <p className="text-emerald-700" role="status">
            {done}
          </p>
        )}
        {read && !read.ok && <p className="text-red-700">{read.error}</p>}
        {read?.ok && (
          <div className="space-y-2">
            {read.projects.length > 1 && bytes && (
              <label className="block">
                Project{" "}
                <select
                  className="input"
                  value={read.project.projId}
                  onChange={(e) => show(readXerSchedule(bytes, e.target.value))}
                >
                  {read.projects.map((p) => (
                    <option key={p.projId} value={p.projId}>
                      {p.shortName} ({p.activityCount} activities)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              {read.project.shortName}: {read.activities.length} activities
              {read.project.dataDate ? `, data date ${read.project.dataDate}` : ""}.
              {read.skippedSummary > 0 &&
                ` ${read.skippedSummary} level-of-effort or WBS summary activities left out.`}
              {read.skippedNoDates > 0 && ` ${read.skippedNoDates} with no dates left out.`}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label>
                Find{" "}
                <input
                  className="input w-56"
                  value={filter}
                  placeholder="electrical, E-1000, Level 2"
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <button type="button" className="text-sm underline" onClick={() => tickShown(true)}>
                Tick the {shown.length} shown
              </button>
              <button type="button" className="text-sm underline" onClick={() => tickShown(false)}>
                Untick them
              </button>
              <label>
                Trade or crew for these{" "}
                <input
                  className="input w-40"
                  value={trade}
                  placeholder="optional"
                  onChange={(e) => setTrade(e.target.value)}
                />
              </label>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th>Add</th>
                    <th>P6 ID</th>
                    <th>Activity</th>
                    <th>Start</th>
                    <th>Finish</th>
                    <th>%</th>
                    <th>Here</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, MAX_SHOWN).map((a) => (
                    <tr key={a.code} className="border-t align-top">
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Add ${a.code} ${a.name}`}
                          checked={keep.has(a.code)}
                          onChange={(e) => toggle(a.code, e.target.checked)}
                        />
                      </td>
                      <td className="whitespace-nowrap">{a.code}</td>
                      <td>
                        {a.name}
                        {a.milestone && (
                          <span className="text-xs text-slate-500"> (milestone)</span>
                        )}
                        {a.wbs && <div className="text-xs text-slate-500">{a.wbs}</div>}
                      </td>
                      <td className="whitespace-nowrap">{a.startOn}</td>
                      <td className="whitespace-nowrap">{a.finishOn}</td>
                      <td className="tabular-nums">{a.percentComplete}</td>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {onJob.has(a.code) ? "updates" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > MAX_SHOWN && (
                <p className="text-xs text-slate-600">
                  The first {MAX_SHOWN} of {shown.length} are listed; "Tick the {shown.length}{" "}
                  shown" ticks them all. Narrow the filter to see the rest.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn"
                disabled={keep.size === 0 || save.isPending}
                onClick={() => {
                  if (read?.ok)
                    save.mutate(scheduleImportBody(read.activities, keep, onJob, trade));
                }}
              >
                Import {keep.size}
                {updating > 0 ? ` (${updating} update what is here)` : ""}
              </button>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  setRead(null);
                  setBytes(null);
                }}
              >
                Cancel
              </button>
            </div>
            <ErrorText error={save.error} />
          </div>
        )}
      </div>
    </details>
  );
}

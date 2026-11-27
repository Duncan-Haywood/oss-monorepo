// A GC's Primavera P6 schedule (an .xer export) read into activities for the job's schedule
// (src/shared/schedule.ts). Read in the browser (components/schedule-import.tsx): the file never
// leaves it; only the activities the contractor keeps go to POST .../schedule/import.
//
// What is read, and how:
// - The project: an XER can hold several; the one with the most activities is offered first.
// - Activities: tasks and milestones (TT_Task, TT_Rsrc, TT_Mile, TT_FinMile). Level-of-effort and
//   WBS summary activities span other work and are left out, with a count.
// - Dates: the actual start once started, the actual finish once complete; otherwise the remaining
//   (restart/reend), early, then planned (target) dates, in that order. Times are dropped: the
//   job's schedule keeps days.
// - Percent complete: 100 when P6 says complete, 0 when not started, else P6's physical percent
//   held to 0..99 so an open activity never reads as done.
// - Links: PayApps keeps one finish-to-start predecessor with a lag in workdays. Of an activity's
//   finish-to-start links to activities being imported, the driving one is kept (the one that
//   allows the latest start); every other link is named in the notes so nothing is lost silently.
//   Lag hours become workdays at the calendar's hours a day (8 when the calendar does not say).
//
// Nothing is rescheduled: the dates are the ones P6 exported, and "late" still means a date passed.

import { addWorkdays, MAX_LAG_WORKDAYS } from "./schedule";
import { decodeXer, parseXer, type XerFile } from "./xer";

export type XerLinkType = "FS" | "SS" | "FF" | "SF";

export interface XerLink {
  /** The predecessor's P6 activity ID (task_code). */
  code: string;
  type: XerLinkType;
  /** Workdays, rounded; a negative lag (a lead) is kept as written here and dropped on import. */
  lagDays: number;
}

export interface XerActivity {
  /** P6 activity ID (task_code): the key a later import of the GC's update matches on. */
  code: string;
  name: string;
  /** The WBS path above it, outermost first, joined with " / "; null when it sits at the top. */
  wbs: string | null;
  milestone: boolean;
  startOn: string;
  finishOn: string;
  percentComplete: number;
  predecessors: XerLink[];
}

export interface XerProject {
  projId: string;
  shortName: string;
  activityCount: number;
  /** The project's data date (last_recalc_date), YYYY-MM-DD, or null. */
  dataDate: string | null;
}

export type XerScheduleRead =
  | {
      ok: true;
      projects: XerProject[];
      project: XerProject;
      activities: XerActivity[];
      /** Level-of-effort and WBS summary activities left out. */
      skippedSummary: number;
      /** Activities with no date P6 filled in, left out. */
      skippedNoDates: number;
    }
  | { ok: false; error: string };

/** The longest name kept, as the schedule's form allows. */
const MAX_NAME = 300;
const KEPT_TYPES = new Set(["TT_Task", "TT_Rsrc", "TT_Mile", "TT_FinMile", ""]);
const LINK_TYPES: Record<string, XerLinkType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

/** "2026-03-12 08:00" -> "2026-03-12"; anything that does not start with a date -> null. */
export function xerDay(v: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function first(...vals: (string | null)[]): string | null {
  for (const v of vals) if (v) return v;
  return null;
}

/** The activity's dates as the job's schedule keeps them, or null when P6 gave none. */
export function xerDates(
  t: Record<string, string>,
): { startOn: string; finishOn: string; percentComplete: number } | null {
  const status = t.status_code ?? "";
  const complete = status === "TK_Complete";
  const started = complete || status === "TK_Active";
  const actStart = xerDay(t.act_start_date);
  const actEnd = xerDay(t.act_end_date);
  let start = first(
    started ? actStart : null,
    xerDay(t.restart_date),
    xerDay(t.early_start_date),
    xerDay(t.target_start_date),
    actStart,
  );
  let finish = first(
    complete ? actEnd : null,
    xerDay(t.reend_date),
    xerDay(t.early_end_date),
    xerDay(t.target_end_date),
    actEnd,
  );
  // A start milestone has no finish and a finish milestone no start: one day each.
  start ??= finish;
  finish ??= start;
  if (!start || !finish) return null;
  if (finish < start) finish = start;
  let pct = 0;
  if (complete) pct = 100;
  else if (started) pct = Math.min(99, Math.max(0, Math.round(num(t.phys_complete_pct) ?? 0)));
  return { startOn: start, finishOn: finish, percentComplete: pct };
}

function wbsPaths(xer: XerFile): Map<string, string | null> {
  const rows = xer.tables.PROJWBS ?? [];
  const byId = new Map(rows.map((r) => [r.wbs_id ?? "", r]));
  const out = new Map<string, string | null>();
  for (const r of rows) {
    const names: string[] = [];
    let cur: Record<string, string> | undefined = r;
    // The project's own node (proj_node_flag Y) is the project, not a WBS level; depth is bounded
    // so a hand-made file whose parents loop cannot hang the reader.
    for (let depth = 0; cur && cur.proj_node_flag !== "Y" && depth < 20; depth++) {
      if (cur.wbs_name?.trim()) names.unshift(cur.wbs_name.trim());
      cur = byId.get(cur.parent_wbs_id ?? "");
    }
    out.set(r.wbs_id ?? "", names.length > 0 ? names.join(" / ") : null);
  }
  return out;
}

/** Reads one project's activities from a parsed XER (the one with the most activities by default). */
export function xerSchedule(xer: XerFile, projId?: string): XerScheduleRead {
  const tasks = xer.tables.TASK ?? [];
  if (tasks.length === 0) return { ok: false, error: "The file has no activities (no TASK table)" };
  const counts = new Map<string, number>();
  for (const t of tasks) counts.set(t.proj_id ?? "", (counts.get(t.proj_id ?? "") ?? 0) + 1);
  const projRows = new Map((xer.tables.PROJECT ?? []).map((p) => [p.proj_id ?? "", p]));
  const projects: XerProject[] = [...counts.entries()]
    .map(([id, n]) => ({
      projId: id,
      shortName: projRows.get(id)?.proj_short_name?.trim() || (id ? `Project ${id}` : "Project"),
      activityCount: n,
      dataDate: xerDay(projRows.get(id)?.last_recalc_date),
    }))
    .sort((a, b) => b.activityCount - a.activityCount || a.shortName.localeCompare(b.shortName));
  const project = projId ? projects.find((p) => p.projId === projId) : projects[0];
  if (!project) return { ok: false, error: "That project is not in the file" };

  const hoursPerDay = new Map<string, number>();
  for (const c of xer.tables.CALENDAR ?? []) {
    const h = num(c.day_hr_cnt);
    if (h && h > 0) hoursPerDay.set(c.clndr_id ?? "", h);
  }
  const wbs = wbsPaths(xer);
  const codeOf = new Map(tasks.map((t) => [t.task_id ?? "", (t.task_code ?? "").trim()]));
  const linksOf = new Map<string, XerLink[]>();
  const taskById = new Map(tasks.map((t) => [t.task_id ?? "", t]));
  for (const p of xer.tables.TASKPRED ?? []) {
    const succ = taskById.get(p.task_id ?? "");
    const predCode = codeOf.get(p.pred_task_id ?? "");
    if (!succ || !predCode) continue;
    const hours = hoursPerDay.get(succ.clndr_id ?? "") ?? 8;
    const link: XerLink = {
      code: predCode,
      type: LINK_TYPES[p.pred_type ?? ""] ?? "FS",
      lagDays: Math.round((num(p.lag_hr_cnt) ?? 0) / hours),
    };
    const list = linksOf.get(p.task_id ?? "") ?? [];
    list.push(link);
    linksOf.set(p.task_id ?? "", list);
  }

  const activities: XerActivity[] = [];
  const seen = new Set<string>();
  let skippedSummary = 0;
  let skippedNoDates = 0;
  for (const t of tasks) {
    if ((t.proj_id ?? "") !== project.projId) continue;
    if (!KEPT_TYPES.has(t.task_type ?? "")) {
      skippedSummary++;
      continue;
    }
    const dates = xerDates(t);
    const code = (t.task_code ?? "").trim();
    if (!dates || !code) {
      skippedNoDates++;
      continue;
    }
    // Activity IDs are unique in a P6 project; a hand-made file that repeats one keeps the first.
    if (seen.has(code)) continue;
    seen.add(code);
    activities.push({
      code,
      name: (t.task_name ?? "").trim().slice(0, MAX_NAME) || code,
      wbs: wbs.get(t.wbs_id ?? "") ?? null,
      milestone: t.task_type === "TT_Mile" || t.task_type === "TT_FinMile",
      ...dates,
      predecessors: linksOf.get(t.task_id ?? "") ?? [],
    });
  }
  activities.sort(
    (a, b) => a.startOn.localeCompare(b.startOn) || a.code.localeCompare(b.code, "en"),
  );
  return { ok: true, projects, project, activities, skippedSummary, skippedNoDates };
}

/** Reads the bytes of an .xer file; a file that is not one comes back as `ok: false` in words. */
export function readXerSchedule(bytes: Uint8Array, projId?: string): XerScheduleRead {
  let xer: XerFile;
  try {
    xer = parseXer(decodeXer(bytes));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The file could not be read" };
  }
  return xerSchedule(xer, projId);
}

/**
 * The one predecessor PayApps keeps: of the finish-to-start links to activities on the job after
 * the import (`finishOf`, by P6 activity ID), the driving one, i.e. the one that allows the latest
 * start; ties go to the first listed. A lead (negative lag) counts as no lag. Null: none.
 */
export function pickPredecessor(
  a: Pick<XerActivity, "predecessors">,
  finishOf: ReadonlyMap<string, string>,
): { code: string; lagDays: number } | null {
  let best: { code: string; lagDays: number; earliest: string } | null = null;
  for (const l of a.predecessors) {
    if (l.type !== "FS") continue;
    const finish = finishOf.get(l.code);
    if (!finish) continue;
    const lagDays = Math.min(MAX_LAG_WORKDAYS, Math.max(0, l.lagDays));
    const earliest = addWorkdays(finish, 1 + lagDays);
    if (!best || earliest > best.earliest) best = { code: l.code, lagDays, earliest };
  }
  return best ? { code: best.code, lagDays: best.lagDays } : null;
}

function linkWords(l: XerLink): string {
  const lag = l.lagDays !== 0 ? ` ${l.lagDays > 0 ? "+" : ""}${l.lagDays}d` : "";
  return `${l.type} ${l.code}${lag}`;
}

/**
 * The notes an imported activity carries: where it came from, its WBS, and the P6 links the job's
 * schedule does not hold (other link types, links to activities left out, a second predecessor).
 */
export function xerNotes(
  a: Pick<XerActivity, "code" | "wbs" | "predecessors" | "milestone">,
  kept: { code: string } | null,
): string {
  const parts = [
    `From the GC's P6 schedule, activity ${a.code}${a.milestone ? " (milestone)" : ""}.`,
  ];
  if (a.wbs) parts.push(`WBS: ${a.wbs}.`);
  const others = a.predecessors.filter((l) => !(kept && l.type === "FS" && l.code === kept.code));
  if (others.length > 0) {
    const shown = others.slice(0, 10).map(linkWords).join(", ");
    const more = others.length > 10 ? ` and ${others.length - 10} more` : "";
    parts.push(`Other P6 predecessors: ${shown}${more}.`);
  }
  return parts.join(" ").slice(0, 2000);
}

/** Activities whose name, ID or WBS holds every word of `filter` (case ignored); all when blank. */
export function filterXerActivities<T extends Pick<XerActivity, "code" | "name" | "wbs">>(
  list: readonly T[],
  filter: string,
): T[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter((a) => {
    const hay = `${a.code} ${a.name} ${a.wbs ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

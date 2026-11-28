// Punch lists: the items a GC, architect or owner lists at a walk-through near the end of a job
// ("touch up paint at corridor 2", "missing cover plate in room 104"), which the subcontractor fixes,
// marks done, and asks the GC to back-check and accept. Pure: status, the list's summary, the next
// number, the date checks and the back-check email, shared by the Worker
// (services/payapps/punch-list.ts, the PDF and CSV) and the SPA (components/punch-list.tsx).
// Nothing is estimated: every date is one the contractor entered, and "overdue" only means the due
// date they entered has passed.

import { daysBetween } from "./cash-report";
import { pmGreeting } from "./change-order-email";
import { formatCents } from "./money";

/** Who listed the item at the walk-through (or that it is the contractor's own). */
export const PUNCH_SOURCES = ["gc", "architect", "owner", "inspector", "own"] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];

export const PUNCH_SOURCE_LABELS: Record<PunchSource, string> = {
  gc: "General contractor",
  architect: "Architect",
  owner: "Owner",
  inspector: "Inspector",
  own: "Our own walk",
};

/**
 * open: not fixed, not past due; overdue: past its due date; done: fixed, waiting on the GC's
 * back-check; accepted: the GC signed it off; disputed: the contractor says it is not their work
 * (another trade's, or already as the contract asks), so it is out of the count until settled.
 */
export type PunchStatus = "open" | "overdue" | "done" | "accepted" | "disputed";

export const PUNCH_STATUS_LABELS: Record<PunchStatus, string> = {
  open: "Open",
  overdue: "Overdue",
  done: "Done, awaiting back-check",
  accepted: "Accepted",
  disputed: "Not ours",
};

export interface PunchItemFacts {
  number: number;
  description: string;
  location: string | null;
  source: PunchSource | null;
  /** ISO dates (YYYY-MM-DD); null: not entered. */
  listedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  completedBy: string | null;
  acceptedOn: string | null;
  acceptedBy: string | null;
  /** Why the contractor says it is not theirs; set means disputed. */
  disputeNote: string | null;
}

export function punchStatus(
  item: Pick<PunchItemFacts, "dueOn" | "completedOn" | "acceptedOn" | "disputeNote">,
  today: string,
): PunchStatus {
  if (item.acceptedOn) return "accepted";
  if (item.disputeNote?.trim()) return "disputed";
  if (item.completedOn) return "done";
  if (item.dueOn && item.dueOn < today) return "overdue";
  return "open";
}

/** Calendar days past the due date, for an item not fixed yet; 0 when not overdue. */
export function punchDaysOverdue(
  item: Pick<PunchItemFacts, "dueOn" | "completedOn" | "acceptedOn" | "disputeNote">,
  today: string,
): number {
  if (punchStatus(item, today) !== "overdue" || !item.dueOn) return 0;
  return daysBetween(item.dueOn, today);
}

export interface PunchListSummary {
  total: number;
  open: number;
  overdue: number;
  done: number;
  accepted: number;
  disputed: number;
  /** Items still to fix (open + overdue). */
  toFix: number;
  /**
   * Accepted share of the items that count (disputed ones left out), in whole percent; null when
   * none counts. 100 means every item that is the contractor's has been signed off.
   */
  acceptedPct: number | null;
  /** True when there are items and every one that counts is accepted. */
  closed: boolean;
}

export function summarizePunchList(items: PunchItemFacts[], today: string): PunchListSummary {
  const s: PunchListSummary = {
    total: items.length,
    open: 0,
    overdue: 0,
    done: 0,
    accepted: 0,
    disputed: 0,
    toFix: 0,
    acceptedPct: null,
    closed: false,
  };
  for (const i of items) s[punchStatus(i, today)]++;
  s.toFix = s.open + s.overdue;
  const counted = s.total - s.disputed;
  if (counted > 0) {
    s.acceptedPct = Math.floor((s.accepted / counted) * 100);
    s.closed = s.accepted === counted;
  }
  return s;
}

/** The next item number on a job: one past the highest on its list (gaps are left as they are). */
export function nextPunchNumber(numbers: number[]): number {
  return numbers.reduce((m, n) => Math.max(m, n), 0) + 1;
}

/** Checks an item's dates as a whole; returns the first problem in words, or null. */
export function punchDateProblem(
  item: Pick<PunchItemFacts, "listedOn" | "dueOn" | "completedOn" | "acceptedOn">,
  today: string,
): string | null {
  if (item.listedOn && item.listedOn > today) return "The date listed cannot be in the future";
  if (item.completedOn && item.completedOn > today) {
    return "The date fixed cannot be in the future";
  }
  if (item.acceptedOn && item.acceptedOn > today) {
    return "The date accepted cannot be in the future";
  }
  if (item.listedOn && item.dueOn && item.dueOn < item.listedOn) {
    return "The due date cannot be before the date listed";
  }
  if (item.listedOn && item.completedOn && item.completedOn < item.listedOn) {
    return "The date fixed cannot be before the date listed";
  }
  if (item.completedOn && item.acceptedOn && item.acceptedOn < item.completedOn) {
    return "The date accepted cannot be before the date fixed";
  }
  return null;
}

/** "P-007": item numbers print padded to three digits. */
export function punchLabel(n: number): string {
  return `P-${String(n).padStart(3, "0")}`;
}

/** One line per item in an email or the PDF: "P-003, Room 104: Missing cover plate". */
export function punchLine(item: Pick<PunchItemFacts, "number" | "location" | "description">) {
  const where = item.location?.trim() ? `, ${item.location.trim()}` : "";
  return `${punchLabel(item.number)}${where}: ${item.description.trim()}`;
}

/** The items fixed and waiting on the GC's back-check, in number order. */
export function readyForBackCheck<T extends PunchItemFacts>(items: T[], today: string): T[] {
  return items.filter((i) => punchStatus(i, today) === "done").sort((a, b) => a.number - b.number);
}

export interface PunchEmailJob {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

export interface PunchEmail {
  to: string | null;
  subject: string;
  body: string;
}

/**
 * The email that tells the GC's project manager which items are fixed and asks for a back-check.
 * Null when nothing is done and waiting. The text lists only what was entered; the punch list PDF
 * goes with it as the record. It says how many are still to fix, so the GC is not surprised.
 */
export function backCheckEmail(
  job: PunchEmailJob,
  items: PunchItemFacts[],
  from: { name: string; company: string },
  today: string,
): PunchEmail | null {
  const ready = readyForBackCheck(items, today);
  if (ready.length === 0) return null;
  const s = summarizePunchList(items, today);
  const label = job.number ? `${job.name} (job ${job.number})` : job.name;
  const sign = [from.name.trim() || "[your name]", from.company.trim()].filter(Boolean).join("\n");
  const n = ready.length;
  const lines: string[] = [
    pmGreeting(job),
    `The following punch list item${n === 1 ? " is" : "s are"} complete on ${label} and ready for your back-check:`,
    ready
      .map((i) => `- ${punchLine(i)}${i.completedOn ? ` (fixed ${i.completedOn})` : ""}`)
      .join("\n"),
  ];
  if (s.toFix > 0) {
    lines.push(
      `${s.toFix} item${s.toFix === 1 ? " is" : "s are"} still open on our side; we will let you know when ${s.toFix === 1 ? "it is" : "they are"} done.`,
    );
  } else {
    lines.push(
      "With these, every item on our punch list is complete. Once they are accepted, please let us know what else you need from us to close out our scope and release our retainage.",
    );
  }
  lines.push(
    "Could you let us know when you can walk them, or confirm them accepted? The current punch list is attached.",
    `Thank you,\n${sign}`,
  );
  return {
    to: job.gcPmEmail?.trim() || null,
    subject: `Punch list ready for back-check: ${n} item${n === 1 ? "" : "s"} (${label})`,
    body: lines.join("\n\n"),
  };
}

/** The job page's anchor for its punch list (components/punch-list.tsx scrolls to it). */
export const PUNCH_LIST_ANCHOR = "punch-list";

/** The longest location the pasted-list reader splits off; anything longer stays in the item. */
const PASTE_LOCATION_MAX = 60;

/**
 * Reads a punch list pasted from the GC's email or walk-through notes: one item per line, a leading
 * number ("1.", "2)", "#3", "P-004") dropped, and a location split off when the line has one before
 * a tab, " - ", " – " or ": " ("Room 104 - missing cover plate"). Blank lines are skipped. Nothing
 * is guessed beyond that: a line with no separator is all item, no location.
 */
export function parsePastedPunchList(
  text: string,
): { location: string | null; description: string }[] {
  const out: { location: string | null; description: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^[-*•]\s+/, "");
    line = line.replace(/^(?:p-?|#)?\d{1,5}\s*[.)\]:-]?\s+/i, "").trim();
    if (!line) continue;
    const m = /^(.+?)(?:\t+|\s+[-–—]\s+|:\s+)(.+)$/.exec(line);
    const loc = m?.[1]?.trim();
    const desc = m?.[2]?.trim();
    if (loc && desc && loc.length <= PASTE_LOCATION_MAX) {
      out.push({ location: loc, description: desc });
    } else {
      out.push({ location: null, description: line });
    }
  }
  return out;
}

/** One punch item as the weekly email reads it across the company's active jobs. */
export interface CompanyPunchInput
  extends Pick<
    PunchItemFacts,
    "number" | "description" | "location" | "dueOn" | "completedOn" | "acceptedOn" | "disputeNote"
  > {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
}

/** One job's punch items past the due date the contractor entered, not yet fixed. */
export interface PunchJobOverdue {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  /** How many items on the job are overdue. */
  overdue: number;
  /** The item longest past due (lowest number on a tie). */
  oldest: Pick<PunchItemFacts, "number" | "location" | "description"> & { dueOn: string };
  /** Calendar days the oldest is past due. */
  daysOverdue: number;
  /** Retainage held on the job, from the cash report; 0 when none or not known. */
  retainageHeldCents: number;
}

/**
 * Jobs with punch items past the due date entered and not fixed (open, not done, accepted or
 * disputed), grouped by job, the longest overdue first. A done item waiting on the GC's back-check
 * is not the contractor's to chase, so it never counts; nor does an item with no due date.
 */
export function punchOverdueByJob(
  inputs: readonly CompanyPunchInput[],
  today: string,
  retainageByJob: ReadonlyMap<string, number> = new Map(),
): PunchJobOverdue[] {
  const byJob = new Map<string, PunchJobOverdue>();
  for (const i of inputs) {
    if (punchStatus(i, today) !== "overdue" || !i.dueOn) continue;
    const days = punchDaysOverdue(i, today);
    const cur = byJob.get(i.projectId);
    const oldest = {
      number: i.number,
      location: i.location,
      description: i.description,
      dueOn: i.dueOn,
    };
    if (!cur) {
      byJob.set(i.projectId, {
        projectId: i.projectId,
        projectName: i.projectName,
        projectNumber: i.projectNumber,
        gcName: i.gcName,
        overdue: 1,
        oldest,
        daysOverdue: days,
        retainageHeldCents: Math.max(0, retainageByJob.get(i.projectId) ?? 0),
      });
      continue;
    }
    cur.overdue++;
    if (days > cur.daysOverdue || (days === cur.daysOverdue && i.number < cur.oldest.number)) {
      cur.oldest = oldest;
      cur.daysOverdue = days;
    }
  }
  return [...byJob.values()].sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      b.overdue - a.overdue ||
      a.projectName.localeCompare(b.projectName),
  );
}

/**
 * "Clinic TI (#2207, Harbor Builders): 3 punch items past due. Longest: P-004, Room 104: Missing
 * cover plate, due 2026-11-16, 12 days ago. $18,400.00 retainage held on the job."
 */
export function punchOverdueText(j: PunchJobOverdue): string {
  const job = `${j.projectName.trim()} (${j.projectNumber?.trim() ? `#${j.projectNumber.trim()}, ` : ""}${j.gcName.trim()})`;
  const count = `${j.overdue} punch item${j.overdue === 1 ? "" : "s"} past due`;
  // Overdue means the due date is before today, so it is at least a day ago.
  const age = j.daysOverdue === 1 ? "yesterday" : `${j.daysOverdue} days ago`;
  const which = j.overdue === 1 ? "" : "Longest: ";
  const held =
    j.retainageHeldCents > 0
      ? ` ${formatCents(j.retainageHeldCents)} retainage held on the job.`
      : "";
  return `${job}: ${count}. ${which}${punchLine(j.oldest)}, due ${j.oldest.dueOn}, ${age}.${held}`;
}

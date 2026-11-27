// Submittal log per job (docs/SUBMITTALS.md): the shop drawings, product data and samples a
// subcontractor sends the GC for review, what came back, and which ones put the schedule at risk.
// Pure functions, shared by the Worker (the CSV) and the SPA (the page). Dates are YYYY-MM-DD and
// every date and number is one the user typed: nothing here assumes a review period or a lead time.

export const SUBMITTAL_TYPES = [
  "shop_drawings",
  "product_data",
  "samples",
  "mock_up",
  "test_report",
  "certificate",
  "o_and_m",
  "warranty",
  "other",
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

export const SUBMITTAL_TYPE_LABELS: Record<SubmittalType, string> = {
  shop_drawings: "Shop drawings",
  product_data: "Product data",
  samples: "Samples",
  mock_up: "Mock-up",
  test_report: "Test report",
  certificate: "Certificate",
  o_and_m: "O&M manual",
  warranty: "Warranty",
  other: "Other",
};

/** What the GC (or architect, through the GC) stamped on the returned submittal. */
export const SUBMITTAL_ACTIONS = [
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "for_record",
] as const;
export type SubmittalAction = (typeof SUBMITTAL_ACTIONS)[number];

export const SUBMITTAL_ACTION_LABELS: Record<SubmittalAction, string> = {
  approved: "Approved",
  approved_as_noted: "Approved as noted",
  revise_resubmit: "Revise and resubmit",
  rejected: "Rejected",
  for_record: "Received for record",
};

/** Actions that clear the submittal: material can be released. */
export const CLOSING_ACTIONS: readonly SubmittalAction[] = [
  "approved",
  "approved_as_noted",
  "for_record",
];
/** Actions that need a new revision sent. */
export const RESUBMIT_ACTIONS: readonly SubmittalAction[] = ["revise_resubmit", "rejected"];

export const MAX_SUBMITTALS_PER_JOB = 500;
/** Longest lead time or review period accepted, in calendar days (two years). */
export const MAX_SUBMITTAL_DAYS = 730;

export interface SubmittalFacts {
  number: number;
  revision: number;
  specSection: string | null;
  title: string;
  type: SubmittalType;
  submittedOn: string | null;
  /** The date the GC is to return it by (from the spec's review period or the GC's log). */
  requiredBy: string | null;
  returnedOn: string | null;
  action: SubmittalAction | null;
  /** When the material has to be on site. */
  neededOnSite: string | null;
  /** Calendar days from approval to delivery (fabrication and shipping). */
  leadTimeDays: number | null;
  /** Calendar days the GC and design team take to review. */
  reviewDays: number | null;
}

export type SubmittalState = "not_submitted" | "with_gc" | "approved" | "resubmit" | "superseded";

export const SUBMITTAL_STATE_LABELS: Record<SubmittalState, string> = {
  not_submitted: "Not submitted",
  with_gc: "With the GC",
  approved: "Closed",
  resubmit: "Resubmit needed",
  superseded: "Superseded",
};

export interface SubmittalStatus {
  state: SubmittalState;
  /** With the GC past the required-back date. */
  overdue: boolean;
  /** Days past the required-back date while with the GC (0 when not overdue). */
  daysOverdue: number;
  /** Days with the GC: submitted to returned, or to today while out. */
  daysWithGc: number | null;
  /**
   * Latest day to send it and still have material on site in time: needed on site minus the lead
   * time minus the review days (zero when none typed). Null without a needed-on-site date and a
   * lead time.
   */
  submitBy: string | null;
  /** Not yet sent and today is past `submitBy`. */
  lateToSubmit: boolean;
  /**
   * Returned (or expected back, by the required-back date or the review days) too late for the
   * lead time to make the needed-on-site date. Null when the dates to tell are missing.
   */
  deliveryAtRisk: boolean | null;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Calendar days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Where a submittal stands on `today` (the user's local date). `superseded` is true when a later
 * revision of the same number exists: only the newest revision drives the open lists.
 */
export function submittalStatus(
  s: SubmittalFacts,
  today: string,
  superseded = false,
): SubmittalStatus {
  let state: SubmittalState;
  if (superseded) state = "superseded";
  else if (!s.submittedOn) state = "not_submitted";
  else if (!s.returnedOn || !s.action) state = "with_gc";
  else if (CLOSING_ACTIONS.includes(s.action)) state = "approved";
  else state = "resubmit";

  const out = s.submittedOn && !s.returnedOn;
  const daysWithGc = s.submittedOn
    ? Math.max(0, daysBetween(s.submittedOn, s.returnedOn ?? today))
    : null;
  const daysOverdue =
    !superseded && out && s.requiredBy ? Math.max(0, daysBetween(s.requiredBy, today)) : 0;

  const submitBy =
    s.neededOnSite && s.leadTimeDays !== null
      ? addDays(s.neededOnSite, -(s.leadTimeDays + (s.reviewDays ?? 0)))
      : null;
  const lateToSubmit = state === "not_submitted" && submitBy !== null && today > submitBy;

  // When the approval lands (or is expected to), plus the lead time, against the needed date.
  let deliveryAtRisk: boolean | null = null;
  if (!superseded && state !== "resubmit" && s.neededOnSite && s.leadTimeDays !== null) {
    let back: string | null = null;
    if (state === "approved") back = s.returnedOn;
    else if (state === "with_gc") {
      back =
        s.requiredBy ??
        (s.reviewDays !== null && s.submittedOn ? addDays(s.submittedOn, s.reviewDays) : null);
      // Still out past the expected date: it cannot come back before today.
      if (back !== null && back < today) back = today;
    } else if (submitBy !== null) {
      // Not sent: sent today at the earliest, then the review days.
      back = addDays(today > submitBy ? today : submitBy, s.reviewDays ?? 0);
    }
    if (back !== null) deliveryAtRisk = addDays(back, s.leadTimeDays) > s.neededOnSite;
  } else if (!superseded && state === "resubmit" && s.neededOnSite && s.leadTimeDays !== null) {
    // A resubmittal goes back through review: today plus the review days, then the lead time.
    deliveryAtRisk = addDays(today, (s.reviewDays ?? 0) + s.leadTimeDays) > s.neededOnSite;
  }

  return {
    state,
    overdue: daysOverdue > 0,
    daysOverdue,
    daysWithGc,
    submitBy,
    lateToSubmit,
    deliveryAtRisk,
  };
}

/** "#7", "#7 Rev 1"; with a spec section, "03 30 00 #7 Rev 1". */
export function submittalLabel(s: Pick<SubmittalFacts, "number" | "revision" | "specSection">) {
  const base = `#${s.number}${s.revision > 0 ? ` Rev ${s.revision}` : ""}`;
  return s.specSection ? `${s.specSection} ${base}` : base;
}

export interface SubmittalRow extends SubmittalFacts {
  id: string;
}

/** The newest revision of each number (the ones the open lists count). */
export function latestRevisionIds(rows: readonly SubmittalRow[]): Set<string> {
  const best = new Map<number, SubmittalRow>();
  for (const r of rows) {
    const cur = best.get(r.number);
    if (!cur || r.revision > cur.revision) best.set(r.number, r);
  }
  return new Set([...best.values()].map((r) => r.id));
}

export function nextSubmittalNumber(rows: readonly Pick<SubmittalFacts, "number">[]): number {
  return rows.reduce((m, r) => Math.max(m, r.number), 0) + 1;
}

export interface SubmittalSummary {
  /** Newest revisions only. */
  total: number;
  notSubmitted: number;
  withGc: number;
  overdue: number;
  closed: number;
  resubmit: number;
  lateToSubmit: number;
  deliveryAtRisk: number;
}

export function summarizeSubmittals(
  rows: readonly SubmittalRow[],
  today: string,
): { summary: SubmittalSummary; status: Map<string, SubmittalStatus> } {
  const latest = latestRevisionIds(rows);
  const status = new Map<string, SubmittalStatus>();
  const summary: SubmittalSummary = {
    total: 0,
    notSubmitted: 0,
    withGc: 0,
    overdue: 0,
    closed: 0,
    resubmit: 0,
    lateToSubmit: 0,
    deliveryAtRisk: 0,
  };
  for (const r of rows) {
    const st = submittalStatus(r, today, !latest.has(r.id));
    status.set(r.id, st);
    if (st.state === "superseded") continue;
    summary.total += 1;
    if (st.state === "not_submitted") summary.notSubmitted += 1;
    if (st.state === "with_gc") summary.withGc += 1;
    if (st.state === "approved") summary.closed += 1;
    if (st.state === "resubmit") summary.resubmit += 1;
    if (st.overdue) summary.overdue += 1;
    if (st.lateToSubmit) summary.lateToSubmit += 1;
    if (st.deliveryAtRisk) summary.deliveryAtRisk += 1;
  }
  return { summary, status };
}

/**
 * Checks on one submittal's dates and action, returning the first problem in words, or null. A
 * returned date needs a sent date on or before it, and a returned date and an action go together.
 */
export function submittalProblem(s: SubmittalFacts): string | null {
  if (s.returnedOn && !s.submittedOn)
    return "Enter the date it was sent before the date it came back";
  if (s.returnedOn && s.submittedOn && s.returnedOn < s.submittedOn)
    return "The date it came back is before the date it was sent";
  if (s.requiredBy && s.submittedOn && s.requiredBy < s.submittedOn)
    return "The required-back date is before the date it was sent";
  if (s.action && !s.returnedOn) return "Enter the date it came back with the GC's action";
  if (s.returnedOn && !s.action) return "Pick the GC's action for the date it came back";
  return null;
}

export const SUBMITTAL_NOTE =
  "Dates, lead times and review days are the ones you typed. The submittal log tracks what you " +
  "sent and what came back; the GC's stamp and the contract documents govern what was approved.";

/**
 * What the transmittal asks the GC to do with what is enclosed (the checkbox row on its cover
 * sheet). Not stored: the user picks one when printing, and the default comes from the type.
 */
export const TRANSMITTAL_REQUESTS = ["approval", "review", "record", "information"] as const;
export type TransmittalRequest = (typeof TRANSMITTAL_REQUESTS)[number];

export const TRANSMITTAL_REQUEST_LABELS: Record<TransmittalRequest, string> = {
  approval: "For approval",
  review: "For review and comment",
  record: "For record",
  information: "For information",
};

/** Close-out and test documents go for record; drawings, data, samples and mock-ups for approval. */
const FOR_RECORD_TYPES: readonly SubmittalType[] = [
  "test_report",
  "certificate",
  "o_and_m",
  "warranty",
];

export function defaultTransmittalRequest(type: SubmittalType): TransmittalRequest {
  return FOR_RECORD_TYPES.includes(type) ? "record" : "approval";
}

/**
 * The date the transmittal asks for it back: the required-back date as typed, else the sent date
 * plus the review days. Null when neither is known.
 */
export function transmittalReturnBy(
  s: Pick<SubmittalFacts, "requiredBy" | "submittedOn" | "reviewDays">,
): string | null {
  if (s.requiredBy) return s.requiredBy;
  if (s.submittedOn && s.reviewDays !== null) return addDays(s.submittedOn, s.reviewDays);
  return null;
}

/** One submittal revision with its job, as the company-wide lists (weekly email, projects page) read it. */
export interface CompanySubmittalInput extends SubmittalFacts {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
}

/**
 * Why a submittal is on the company's list to chase:
 * - `overdue_back`: with the GC past the required-back date typed for it;
 * - `late_to_send`: not sent, and today is past the last day to send it (needed on site minus the
 *   lead time and review days typed);
 * - `resubmit`: returned "Revise and resubmit" or "Rejected", and no next revision entered yet.
 */
export type SubmittalChaseReason = "overdue_back" | "late_to_send" | "resubmit";

export interface SubmittalToChase {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  number: number;
  revision: number;
  specSection: string | null;
  title: string;
  reason: SubmittalChaseReason;
  /**
   * Calendar days late: past the required-back date (overdue_back), past the last day to send
   * (late_to_send), or since it came back (resubmit). 1 or more, except a resubmit returned today (0).
   */
  days: number;
  /** The date the count runs from (required-back, send-by or returned), YYYY-MM-DD. */
  since: string;
  /** The material's needed-on-site date can no longer be met from the dates typed. */
  deliveryAtRisk: boolean;
}

/**
 * The submittals across the company's jobs that are waiting on someone: overdue back from the GC,
 * late to send, or returned for resubmittal. Only the newest revision of each number on each job
 * counts. Delivery-at-risk ones first, then most days late, then job name, number. Only typed dates
 * decide it: a submittal with no required-back date is never overdue back, and one with no
 * needed-on-site date and lead time is never late to send.
 */
export function submittalsToChase(
  list: readonly CompanySubmittalInput[],
  today: string,
): SubmittalToChase[] {
  const byJob = new Map<string, CompanySubmittalInput[]>();
  for (const r of list) {
    const rows = byJob.get(r.projectId) ?? [];
    rows.push(r);
    byJob.set(r.projectId, rows);
  }
  const out: SubmittalToChase[] = [];
  for (const rows of byJob.values()) {
    const latest = latestRevisionIds(rows);
    for (const r of rows) {
      if (!latest.has(r.id)) continue;
      const st = submittalStatus(r, today);
      let reason: SubmittalChaseReason | null = null;
      let since: string | null = null;
      if (st.overdue && r.requiredBy) {
        reason = "overdue_back";
        since = r.requiredBy;
      } else if (st.lateToSubmit && st.submitBy) {
        reason = "late_to_send";
        since = st.submitBy;
      } else if (st.state === "resubmit" && r.returnedOn) {
        reason = "resubmit";
        since = r.returnedOn;
      }
      if (!reason || !since) continue;
      out.push({
        id: r.id,
        projectId: r.projectId,
        projectName: r.projectName,
        projectNumber: r.projectNumber,
        gcName: r.gcName,
        number: r.number,
        revision: r.revision,
        specSection: r.specSection,
        title: r.title.trim(),
        reason,
        days: Math.max(0, daysBetween(since, today)),
        since,
        deliveryAtRisk: st.deliveryAtRisk === true,
      });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.deliveryAtRisk) - Number(a.deliveryAtRisk) ||
      b.days - a.days ||
      a.projectName.localeCompare(b.projectName) ||
      a.number - b.number,
  );
}

const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * "Clinic TI (#2207), 23 31 13 #4 Ductwork shop drawings: back from the GC by 2026-11-16, 7 days
 * overdue (Harbor Builders). Delivery on site is at risk."
 */
export function submittalToChaseText(s: SubmittalToChase): string {
  const job = `${s.projectName}${s.projectNumber ? ` (#${s.projectNumber})` : ""}`;
  const what = `${submittalLabel(s)} ${s.title}`;
  const why =
    s.reason === "overdue_back"
      ? `back from the GC by ${s.since}, ${dayWord(s.days)} overdue`
      : s.reason === "late_to_send"
        ? `not sent, last day to send was ${s.since}, ${dayWord(s.days)} ago`
        : `returned for resubmittal ${s.since}${s.days > 0 ? `, ${dayWord(s.days)} ago` : ", today"}: send Rev ${s.revision + 1}`;
  const risk = s.deliveryAtRisk ? " Delivery on site is at risk." : "";
  return `${job}, ${what}: ${why} (${s.gcName}).${risk}`;
}

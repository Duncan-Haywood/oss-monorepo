// SPRS affirmation record: what the organization's affirming official entered in SPRS, and when the
// next affirmation and self-assessment fall due. Pure functions, shared by the Worker and the SPA.
//
// The rules, read on eCFR 2026-11-25 (32 CFR part 170, final rule 89 FR 83092):
// - § 170.22(a): the Affirming Official "must affirm the continuing compliance of their respective
//   organizations with the specified security requirement after every assessment, including POA&M
//   closeout, and annually thereafter. Affirmations are entered electronically in SPRS."
// - § 170.22(a)(2): each affirmation includes "(i) Name, title, and contact information for the
//   Affirming Official" and "(ii) Affirmation statement ...".
// - § 170.15(a)(1): for Final Level 1 (Self), "the OSA must conduct a Level 1 self-assessment on an
//   annual basis and submit the results in SPRS".
// - § 170.16(a)(1): for Level 2 (Self), "the OSA must conduct a Level 2 self-assessment every three
//   years"; (a)(1)(ii)(B): a POA&M closeout self-assessment with results posted to SPRS "within 180
//   days of the CMMC Status Date associated with the Conditional Level 2 (Self)".
//
// These dates are reminders computed from what the user recorded, not a determination of anything:
// the app never submits to SPRS, and the affirming official decides what is due and when.

export const AFFIRMATION_KINDS = ["assessment", "annual", "poam_closeout"] as const;
export type AffirmationKind = (typeof AFFIRMATION_KINDS)[number];

export const CMMC_STATUSES = ["final", "conditional"] as const;
export type CmmcStatus = (typeof CMMC_STATUSES)[number];

export const AFFIRMATION_KIND_LABEL: Record<AffirmationKind, string> = {
  assessment: "After a self-assessment",
  annual: "Annual affirmation",
  poam_closeout: "After a POA&M closeout self-assessment",
};

export const CMMC_STATUS_LABEL: Record<CmmcStatus, string> = {
  final: "Final",
  conditional: "Conditional",
};

/** The affirmation statement's substance, quoted from 32 CFR 170.22(a)(2)(ii). */
export const AFFIRMATION_STATEMENT_RULE =
  "Affirmation statement attesting that the OSA has implemented and will maintain implementation of all applicable CMMC security requirements to their CMMC Status for all information systems within the relevant CMMC Assessment Scope.";

/** Days of warning before a due date on the dashboard. */
export const DUE_SOON_DAYS = 60;

/** The fields the schedule reads from a stored affirmation. Dates are YYYY-MM-DD. */
export interface AffirmationLike {
  level: 1 | 2;
  kind: AffirmationKind;
  cmmcStatus: CmmcStatus;
  cmmcStatusDate: string;
  affirmedOn: string;
}

export interface AffirmationInput extends AffirmationLike {
  officialName: string;
  officialTitle: string;
  officialContact: string;
  /** Level 2 only: the score entered in SPRS (110 to -203). */
  sprsScore: number | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};

const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

/**
 * The same date `years` later. February 29 becomes February 28, never March 1: a reminder that
 * falls a day early is safe, one a day late is not.
 */
export function addYears(date: string, years: number): string {
  const { y, m, d } = parse(date);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay))));
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + days)));
}

export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Problems with an affirmation before it is stored; an empty list means it can be saved. */
export function validateAffirmation(a: AffirmationInput, today: string): string[] {
  const errors: string[] = [];
  if (!isIsoDate(a.affirmedOn)) errors.push("Date affirmed must be a date (YYYY-MM-DD).");
  if (!isIsoDate(a.cmmcStatusDate)) errors.push("CMMC Status Date must be a date (YYYY-MM-DD).");
  if (errors.length) return errors;
  if (a.affirmedOn > today) errors.push("Date affirmed cannot be in the future.");
  if (a.cmmcStatusDate > a.affirmedOn)
    errors.push("The CMMC Status Date cannot be after the date affirmed.");
  if (!a.officialName.trim()) errors.push("Name the affirming official (32 CFR 170.22(a)(2)(i)).");
  if (!a.officialTitle.trim())
    errors.push("Give the affirming official's title (32 CFR 170.22(a)(2)(i)).");
  if (!a.officialContact.trim())
    errors.push("Give the affirming official's contact information (32 CFR 170.22(a)(2)(i)).");
  if (a.level === 1) {
    if (a.cmmcStatus !== "final")
      errors.push("Level 1 has no conditional status: no POA&Ms are permitted (32 CFR 170.15).");
    if (a.kind === "poam_closeout") errors.push("Level 1 has no POA&M closeout (32 CFR 170.15).");
    if (a.sprsScore !== null) errors.push("Level 1 has no score; leave it empty.");
  } else if (a.sprsScore !== null) {
    if (!Number.isInteger(a.sprsScore) || a.sprsScore > 110 || a.sprsScore < -203)
      errors.push("A Level 2 score is a whole number from -203 to 110.");
  }
  if (a.kind === "poam_closeout" && a.cmmcStatus !== "final")
    errors.push("A POA&M closeout that passes gives a Final status; record the Final status date.");
  return errors;
}

export interface Deadline {
  key: "annual_affirmation" | "self_assessment" | "poam_closeout";
  label: string;
  due: string;
  /** Days from today; negative when past. */
  daysLeft: number;
  state: "overdue" | "due_soon" | "ok";
  basis: string;
}

export interface AffirmationSchedule {
  level: 1 | 2;
  /** The most recent affirmation for this level, or null when none is recorded. */
  last: AffirmationLike | null;
  deadlines: Deadline[];
}

const byAffirmed = (a: AffirmationLike, b: AffirmationLike) =>
  a.affirmedOn === b.affirmedOn ? 0 : a.affirmedOn < b.affirmedOn ? -1 : 1;

/**
 * When the next affirmation and self-assessment fall due for one level, from the records alone.
 * The annual affirmation is counted from the last recorded affirmation of any kind; the
 * self-assessment from the latest CMMC Status Date; a conditional status adds the 180-day closeout
 * until a later affirmation records a Final status.
 */
export function affirmationSchedule(
  records: readonly AffirmationLike[],
  level: 1 | 2,
  today: string,
): AffirmationSchedule {
  const mine = records.filter((r) => r.level === level).sort(byAffirmed);
  const last = mine.at(-1) ?? null;
  if (!last) return { level, last: null, deadlines: [] };
  const deadline = (key: Deadline["key"], label: string, due: string, basis: string): Deadline => {
    const daysLeft = daysBetween(today, due);
    const state = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "ok";
    return { key, label, due, daysLeft, state, basis };
  };
  // Records are in affirmation order, so `>=` lets the later of two equal status dates win.
  const latestBy = (rows: AffirmationLike[]) =>
    rows.reduce((acc, r) => (r.cmmcStatusDate >= acc.cmmcStatusDate ? r : acc));
  const latestStatus = latestBy(mine);
  // A closeout does not restart the self-assessment clock: § 170.16(a)(1) counts the three years
  // from the Conditional status date, so the anchor is the latest assessment or annual record.
  const notCloseouts = mine.filter((r) => r.kind !== "poam_closeout");
  const assessmentAnchor = notCloseouts.length ? latestBy(notCloseouts) : latestStatus;
  const deadlines: Deadline[] = [];
  if (latestStatus.cmmcStatus === "conditional") {
    deadlines.push(
      deadline(
        "poam_closeout",
        "POA&M closeout self-assessment, results posted to SPRS",
        addDays(latestStatus.cmmcStatusDate, 180),
        "32 CFR 170.16(a)(1)(ii)(B): within 180 days of the Conditional Level 2 (Self) CMMC Status Date",
      ),
    );
  }
  deadlines.push(
    deadline(
      "annual_affirmation",
      "Annual affirmation in SPRS",
      addYears(last.affirmedOn, 1),
      "32 CFR 170.22(a): after every assessment, including POA&M closeout, and annually thereafter (counted here from the last recorded affirmation)",
    ),
  );
  deadlines.push(
    level === 1
      ? deadline(
          "self_assessment",
          "Annual Level 1 self-assessment, results in SPRS",
          addYears(assessmentAnchor.cmmcStatusDate, 1),
          "32 CFR 170.15(a)(1): a Level 1 self-assessment on an annual basis (counted here from the CMMC Status Date)",
        )
      : deadline(
          "self_assessment",
          "Level 2 self-assessment, results in SPRS",
          addYears(assessmentAnchor.cmmcStatusDate, 3),
          "32 CFR 170.16(a)(1): a Level 2 self-assessment every three years, within three years of the CMMC Status Date (counted here from the assessment's status date, not a closeout's)",
        ),
  );
  return { level, last, deadlines: deadlines.sort((a, b) => a.daysLeft - b.daysLeft) };
}

/** The affirmation as an API returns it. */
export interface AffirmationDto extends AffirmationInput {
  id: string;
  notes: string;
  /** The score this workspace computed when the record was made (Level 2), to compare with SPRS. */
  workspaceScore: number | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface AffirmationsResponse {
  items: AffirmationDto[];
  schedules: AffirmationSchedule[];
  today: string;
}

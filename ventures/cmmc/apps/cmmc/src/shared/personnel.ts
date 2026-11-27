// Personnel and training records for the Awareness and Training (3.2.1-3.2.3) and Personnel
// Security (3.9.1-3.9.2) requirements of NIST SP 800-171 Rev. 2. Pure: the checks take today's
// date as an argument.
//
// The requirement text shown with these records comes from the control library
// (src/shared/controls, generated from the official sources). NIST SP 800-171 Rev. 2 sets no
// interval for refresher training, so the interval here is the organization's own choice, saved
// in its profile (default 12 months, the common policy choice), and the page says so.

import { addDays, isIsoDate } from "./affirmation";
import { controlById } from "./controls";

export const TRAININGS = ["awareness", "roleBased", "insiderThreat"] as const;
export type Training = (typeof TRAININGS)[number];

export const TRAINING_INFO: Record<Training, { label: string; controlId: string; who: string }> = {
  awareness: {
    label: "Security awareness",
    controlId: "AT.L2-3.2.1",
    who: "Everyone who uses the organization's systems: managers, system administrators and users.",
  },
  roleBased: {
    label: "Role-based security training",
    controlId: "AT.L2-3.2.2",
    who: "People with assigned information security duties (IT, the system administrator, whoever runs the firewall or backups).",
  },
  insiderThreat: {
    label: "Insider threat awareness",
    controlId: "AT.L2-3.2.3",
    who: "Managers and employees. Often part of the same course as security awareness; record the date for both if so.",
  },
};

export const PERSONNEL_CONTROL_IDS = [
  "AT.L2-3.2.1",
  "AT.L2-3.2.2",
  "AT.L2-3.2.3",
  "PS.L2-3.9.1",
  "PS.L2-3.9.2",
] as const;

export const DEPARTURE_KINDS = ["termination", "transfer"] as const;
export type DepartureKind = (typeof DEPARTURE_KINDS)[number];
export const DEPARTURE_LABEL: Record<DepartureKind, string> = {
  termination: "Left the organization",
  transfer: "Transferred to a role without this access",
};

export const DEFAULT_REFRESH_MONTHS = 12;
export const REFRESH_MONTH_CHOICES = [6, 12, 24, 36] as const;
/** A training falls "due soon" this many days before its refresher date. */
export const TRAINING_DUE_SOON_DAYS = 30;
export const MAX_PEOPLE_PER_ORG = 1000;

export const REFRESH_NOTE =
  "NIST SP 800-171 Rev. 2 does not set how often training is repeated. The interval is your organization's choice; write it in your Awareness and Training policy and keep to it.";

export interface PersonLike {
  id: string;
  name: string;
  cuiAccess: boolean;
  securityDuties: boolean;
  dutiesDescription: string;
  screenedOn: string | null;
  accessGrantedOn: string | null;
  awarenessOn: string | null;
  roleBasedOn: string | null;
  insiderThreatOn: string | null;
  leftOn: string | null;
  departureKind: DepartureKind | null;
  accessRemovedOn: string | null;
}

export type TrainingState = "not_required" | "missing" | "overdue" | "due_soon" | "current";

export interface TrainingStatus {
  state: TrainingState;
  lastOn: string | null;
  /** When the refresher is due under the organization's interval, or null with no date. */
  dueOn: string | null;
}

/**
 * The same day `months` later. A day past the end of the target month becomes its last day
 * (31 Jan + 1 month is 28 or 29 Feb), never the 1st of the next: a reminder a day early is safe.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export const isActive = (p: Pick<PersonLike, "leftOn">) => p.leftOn === null;

export function trainingRequired(p: PersonLike, t: Training): boolean {
  if (!isActive(p)) return false;
  return t === "roleBased" ? p.securityDuties : true;
}

const lastOf = (p: PersonLike, t: Training) =>
  t === "awareness" ? p.awarenessOn : t === "roleBased" ? p.roleBasedOn : p.insiderThreatOn;

export function trainingStatus(
  p: PersonLike,
  t: Training,
  today: string,
  refreshMonths: number,
): TrainingStatus {
  const lastOn = lastOf(p, t);
  const dueOn = lastOn ? addMonths(lastOn, refreshMonths) : null;
  if (!trainingRequired(p, t)) return { state: "not_required", lastOn, dueOn };
  if (!lastOn || !dueOn) return { state: "missing", lastOn, dueOn };
  if (dueOn < today) return { state: "overdue", lastOn, dueOn };
  if (dueOn <= addDays(today, TRAINING_DUE_SOON_DAYS)) return { state: "due_soon", lastOn, dueOn };
  return { state: "current", lastOn, dueOn };
}

/** People whose refresher of one training falls on one date, for the calendar file. */
export interface TrainingDueDate {
  training: Training;
  /** YYYY-MM-DD */
  dueOn: string;
  /** How many current people this date applies to. Names stay out of the calendar. */
  people: number;
}

/**
 * Every refresher date on the records, grouped by training and date: current people only, and
 * only trainings that apply to them (role-based only for people with security duties). A person
 * with no date yet has no refresher date; the People tab and the dashboard list them instead.
 * Ordered by date, then training, so the calendar file is the same for the same records.
 */
export function trainingDueDates(people: PersonLike[], refreshMonths: number): TrainingDueDate[] {
  const groups = new Map<string, TrainingDueDate>();
  for (const p of people) {
    for (const t of TRAININGS) {
      if (!trainingRequired(p, t)) continue;
      const last = lastOf(p, t);
      if (!last || !isIsoDate(last)) continue;
      const dueOn = addMonths(last, refreshMonths);
      const key = `${dueOn}|${t}`;
      const g = groups.get(key);
      if (g) g.people++;
      else groups.set(key, { training: t, dueOn, people: 1 });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) ||
      TRAININGS.indexOf(a.training) - TRAININGS.indexOf(b.training),
  );
}

export interface TrainingAttention {
  personId: string;
  name: string;
  training: Training;
  state: "missing" | "overdue" | "due_soon";
  dueOn: string | null;
}

/**
 * What the dashboard lists: overdue refreshers first (oldest first), then ones falling due within
 * TRAINING_DUE_SOON_DAYS, then people with no date recorded for a training that applies to them.
 */
export function trainingAttention(
  people: PersonLike[],
  today: string,
  refreshMonths: number,
): TrainingAttention[] {
  const out: TrainingAttention[] = [];
  for (const p of people) {
    for (const t of TRAININGS) {
      const s = trainingStatus(p, t, today, refreshMonths);
      if (s.state === "missing" || s.state === "overdue" || s.state === "due_soon")
        out.push({ personId: p.id, name: p.name, training: t, state: s.state, dueOn: s.dueOn });
    }
  }
  const rank = { overdue: 0, due_soon: 1, missing: 2 } as const;
  return out.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.dueOn ?? "").localeCompare(b.dueOn ?? "") ||
      a.name.localeCompare(b.name) ||
      TRAININGS.indexOf(a.training) - TRAININGS.indexOf(b.training),
  );
}

const DATE_FIELDS = [
  ["screenedOn", "Screened on"],
  ["accessGrantedOn", "Access granted on"],
  ["awarenessOn", "Security awareness training"],
  ["roleBasedOn", "Role-based training"],
  ["insiderThreatOn", "Insider threat training"],
  ["leftOn", "Left or transferred on"],
  ["accessRemovedOn", "Access removed on"],
] as const;

/** Problems with a person's record before it is stored; an empty list means it can be saved. */
export function validatePerson(p: Omit<PersonLike, "id">, today: string): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push("Enter the person's name.");
  for (const [key, label] of DATE_FIELDS) {
    const v = p[key];
    if (v === null) continue;
    if (!isIsoDate(v)) errors.push(`${label}: use a real date (YYYY-MM-DD).`);
    else if (v > today) errors.push(`${label}: a date in the future cannot be recorded yet.`);
  }
  if (p.leftOn === null && (p.departureKind !== null || p.accessRemovedOn !== null))
    errors.push("Enter the date they left or transferred before recording the departure.");
  if (p.leftOn !== null && p.departureKind === null)
    errors.push("Say whether they left the organization or transferred.");
  return errors;
}

export interface PersonnelIssue {
  personId: string | null;
  controlId: string;
  message: string;
}

export interface RequirementSummary {
  controlId: string;
  text: string;
  /** People the requirement applies to under these records. */
  applies: number;
  /** Of those, how many the records show as covered. */
  covered: number;
  /** One-line reading of the numbers (the app's wording, not an assessment result). */
  reading: string;
}

export interface PersonnelCheck {
  active: number;
  departed: number;
  issues: PersonnelIssue[];
  requirements: RequirementSummary[];
}

const fmtCount = (covered: number, applies: number, what: string) =>
  applies === 0 ? "Nobody to count yet." : `${covered} of ${applies} ${what}.`;

/** What the records show for each requirement, and the gaps an assessor would ask about. Pure. */
export function checkPersonnel(
  people: PersonLike[],
  today: string,
  refreshMonths: number,
): PersonnelCheck {
  const issues: PersonnelIssue[] = [];
  const active = people.filter(isActive);
  const departed = people.filter((p) => !isActive(p));
  if (people.length === 0)
    issues.push({
      personId: null,
      controlId: "AT.L2-3.2.1",
      message: "No people recorded yet. Add everyone who uses the systems in scope.",
    });
  else if (active.length > 0 && !active.some((p) => p.securityDuties))
    issues.push({
      personId: null,
      controlId: "AT.L2-3.2.2",
      message:
        "Nobody is marked as having security duties. 3.2.2 expects those duties assigned to named people (often the owner or an outside IT provider's contact).",
    });

  const counts: Record<string, { applies: number; covered: number }> = {};
  for (const id of PERSONNEL_CONTROL_IDS) counts[id] = { applies: 0, covered: 0 };

  for (const p of active) {
    for (const t of TRAININGS) {
      const s = trainingStatus(p, t, today, refreshMonths);
      if (s.state === "not_required") continue;
      const { controlId, label } = TRAINING_INFO[t];
      const c = counts[controlId] as { applies: number; covered: number };
      c.applies++;
      if (s.state === "current" || s.state === "due_soon") c.covered++;
      if (s.state === "missing")
        issues.push({
          personId: p.id,
          controlId,
          message: `${p.name}: no ${label.toLowerCase()} date recorded.`,
        });
      else if (s.state === "overdue")
        issues.push({
          personId: p.id,
          controlId,
          message: `${p.name}: ${label.toLowerCase()} was due again on ${s.dueOn} (last ${s.lastOn}).`,
        });
    }
    if (p.securityDuties && !p.dutiesDescription.trim())
      issues.push({
        personId: p.id,
        controlId: "AT.L2-3.2.2",
        message: `${p.name}: write down which security duties they carry, so the training can be matched to them.`,
      });
    if (p.cuiAccess) {
      const c = counts["PS.L2-3.9.1"] as { applies: number; covered: number };
      c.applies++;
      if (!p.screenedOn)
        issues.push({
          personId: p.id,
          controlId: "PS.L2-3.9.1",
          message: `${p.name}: no screening date recorded before their access to systems containing CUI.`,
        });
      else if (p.accessGrantedOn && p.screenedOn > p.accessGrantedOn)
        issues.push({
          personId: p.id,
          controlId: "PS.L2-3.9.1",
          message: `${p.name}: screened on ${p.screenedOn}, after access was granted on ${p.accessGrantedOn}. 3.9.1 asks for screening before access.`,
        });
      else c.covered++;
    }
  }
  for (const p of departed) {
    const c = counts["PS.L2-3.9.2"] as { applies: number; covered: number };
    c.applies++;
    if (p.accessRemovedOn) c.covered++;
    else
      issues.push({
        personId: p.id,
        controlId: "PS.L2-3.9.2",
        message: `${p.name}: ${p.departureKind === "transfer" ? "transferred" : "left"} on ${p.leftOn}; record when their system access and credentials were removed.`,
      });
  }

  const what: Record<string, string> = {
    "AT.L2-3.2.1": "current people have up-to-date security awareness training",
    "AT.L2-3.2.2": "people with security duties have up-to-date role-based training",
    "AT.L2-3.2.3": "current people have up-to-date insider threat training",
    "PS.L2-3.9.1": "people with CUI access were screened before access",
    "PS.L2-3.9.2": "departures and transfers have the access removal recorded",
  };
  const requirements = PERSONNEL_CONTROL_IDS.map((controlId) => {
    const c = counts[controlId] as { applies: number; covered: number };
    return {
      controlId,
      text: controlById(controlId)?.text ?? "",
      applies: c.applies,
      covered: c.covered,
      reading: fmtCount(c.covered, c.applies, what[controlId] ?? ""),
    };
  });
  return { active: active.length, departed: departed.length, issues, requirements };
}

export interface PersonCsvRow extends PersonLike {
  jobTitle: string;
  email: string;
  screeningMethod: string;
  notes: string;
}

/** The roster with each training's next due date, for an assessor or the org's own files. */
export function personnelCsv(rows: PersonCsvRow[], today: string, refreshMonths: number): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // Spreadsheet formula injection: a leading =, +, - or @ is read as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const yn = (b: boolean) => (b ? "Yes" : "No");
  const header = [
    "Name",
    "Job title",
    "Email",
    "Access to systems containing CUI",
    "Security duties",
    "Duties",
    "Screened on",
    "Screening",
    "Access granted on",
    "Security awareness training (3.2.1)",
    "Next due",
    "Role-based training (3.2.2)",
    "Next due",
    "Insider threat training (3.2.3)",
    "Next due",
    "Left or transferred on",
    "Departure",
    "Access removed on (3.9.2)",
    "Notes",
  ];
  const due = (p: PersonLike, t: Training) => {
    const s = trainingStatus(p, t, today, refreshMonths);
    return s.state === "not_required" ? "" : (s.dueOn ?? "Not trained");
  };
  const lines = rows.map((r) =>
    [
      r.name,
      r.jobTitle,
      r.email,
      yn(r.cuiAccess),
      yn(r.securityDuties),
      r.dutiesDescription,
      r.screenedOn,
      r.screeningMethod,
      r.accessGrantedOn,
      r.awarenessOn,
      due(r, "awareness"),
      r.roleBasedOn,
      due(r, "roleBased"),
      r.insiderThreatOn,
      due(r, "insiderThreat"),
      r.leftOn,
      r.departureKind ? DEPARTURE_LABEL[r.departureKind] : "",
      r.accessRemovedOn,
      r.notes,
    ]
      .map(cell)
      .join(","),
  );
  return `${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}

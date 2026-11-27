// Personnel, part 2: a roster (a spreadsheet saved as CSV, this app's own People export, or the chosen
// sheet of an .xlsx turned into CSV in the browser) or a training provider's completion export, read
// into People records. Pure: the worker matches the rows against the org's people and applies them;
// the browser shows the same preview.
//
// Nothing is guessed:
// - A person is matched by email when both sides have one, otherwise by name (ignoring case, spacing
//   and punctuation). A roster row with no match is a new person; a completion row with no match is
//   listed and left out, because a course list is not a list of who uses the systems in scope.
// - A blank cell keeps what is recorded. A training date only moves forward: an older date than the
//   one recorded is ignored, so importing last year's export never undoes this year's training.
// - Which requirement a provider's course counts for (security awareness 3.2.1, role-based 3.2.2,
//   insider threat 3.2.3) is the person's choice, per course name, never read from the course title.
// - Dates are read with the POA&M importer's reader: unambiguous forms, or numeric dates in one order
//   for the whole file (month/day/year by default, day/month/year when the file can only be that, or
//   as chosen). A future date is refused.

import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv } from "./controls/csv-import";
import type { DateOrder, DateOrderRead } from "./controls/poam-import";
import { parsePoamDate, readDateOrder } from "./controls/poam-import";
import { type DepartureKind, TRAINING_INFO, TRAININGS, type Training } from "./personnel";
import { UNCALCULATED } from "./xlsx";

export type { DateOrder } from "./controls/poam-import";

export const PERSON_NAME_MAX = 200;
export const PERSON_TEXT_MAX: Record<
  "jobTitle" | "dutiesDescription" | "screeningMethod" | "notes",
  number
> = {
  jobTitle: 200,
  dutiesDescription: 1000,
  screeningMethod: 500,
  notes: 2000,
};
export const EMAIL_MAX = 320;

export type PersonColumnKind =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "jobTitle"
  | "cuiAccess"
  | "securityDuties"
  | "dutiesDescription"
  | "screenedOn"
  | "screeningMethod"
  | "accessGrantedOn"
  | "awarenessOn"
  | "roleBasedOn"
  | "insiderThreatOn"
  | "completedOn"
  | "course"
  | "status"
  | "leftOn"
  | "departureKind"
  | "accessRemovedOn"
  | "notes";

export const DATE_FIELDS = [
  "screenedOn",
  "accessGrantedOn",
  "awarenessOn",
  "roleBasedOn",
  "insiderThreatOn",
  "leftOn",
  "accessRemovedOn",
] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const TRAINING_FIELD: Record<Training, "awarenessOn" | "roleBasedOn" | "insiderThreatOn"> = {
  awareness: "awarenessOn",
  roleBased: "roleBasedOn",
  insiderThreat: "insiderThreatOn",
};

/** The fields an import can set on a person. */
export interface PersonImportFields {
  email?: string;
  jobTitle?: string;
  cuiAccess?: boolean;
  securityDuties?: boolean;
  dutiesDescription?: string;
  screenedOn?: string;
  screeningMethod?: string;
  accessGrantedOn?: string;
  awarenessOn?: string;
  roleBasedOn?: string;
  insiderThreatOn?: string;
  leftOn?: string;
  departureKind?: DepartureKind;
  accessRemovedOn?: string;
  notes?: string;
}
export type PersonImportField = keyof PersonImportFields;

export interface PersonImportRow {
  /** 1-based line in the file (the Excel row for a workbook); a person's first line in a completion export. */
  line: number;
  /** Empty only in a completion export that gives an email and no name. */
  name: string;
  fields: PersonImportFields;
}

export interface PersonImportIssue {
  line: number | null;
  message: string;
}

export interface CourseSeen {
  /** The key the course choice is sent back under: the course name as normalised, "" with no course column. */
  key: string;
  /** The course name as the file writes it (the first spelling seen). */
  name: string;
  /** Completed rows for it. */
  rows: number;
  /** The trainings this course was chosen to count for (empty when none was chosen). */
  counts: Training[];
}

export interface PersonImportPlan {
  /** A roster (one row a person, the People columns) or a completion export (a completion date column). */
  mode: "roster" | "completions";
  columns: Record<PersonColumnKind, string | null>;
  rows: PersonImportRow[];
  issues: PersonImportIssue[];
  dates: DateOrderRead;
  /** Completion exports: each course found and what it counts for. */
  courses: CourseSeen[];
}

export interface PersonImportOptions {
  /** Today's date (YYYY-MM-DD): later dates are refused. */
  today: string;
  dateOrder?: DateOrder;
  /** Completion exports: course key (CourseSeen.key) to the trainings it counts for. */
  courseMap?: Record<string, Training[]>;
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same person by name: ignoring case, spacing and punctuation. */
export const personNameKey = (name: string) => normalise(name);
export const personEmailKey = (email: string) => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Undo the export's formula guard: a leading ' before = + - @ is the guard, not the value. */
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

const YES = new Set(["yes", "y", "true", "1", "x", "checked"]);
const NO = new Set(["no", "n", "false", "0", "unchecked"]);
/** A yes/no cell, or null when the cell says neither. */
export function parseYesNo(cell: string): boolean | null {
  const v = cell.trim().toLowerCase().replace(/[✓✔]/g, "x");
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}

/** The departure a cell names (this app's labels, or the usual words), else null. */
export function parseDepartureKind(cell: string): DepartureKind | null {
  const v = normalise(cell);
  if (!v) return null;
  if (/\btransfer(red|s)?\b|\b(role change|changed roles?|reassigned|moved to)\b/.test(v))
    return "transfer";
  if (
    /^(left( the organi[sz]ation)?|termination|terminated|resigned|resignation|retired|retirement|quit|laid off|dismissed|separated|separation|fired|end of contract|contract ended|leaver)$/.test(
      v,
    )
  )
    return "termination";
  return null;
}

/** True when a status cell reads as finished training. */
export function isCompletedStatus(cell: string): boolean {
  const v = cell.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(complete|completed|passed|pass|finished|done|yes|100 ?%|100 percent)$/.test(v);
}

// ---- columns ----

// Headers skipped before any kind is tried: the export's own "Next due" columns, and a provider's
// due, assigned or expiry dates, which are not training dates.
const SKIP_HEADER =
  /^(next due|due|due date|due on|assigned|assigned on|assigned date|date assigned|enrollment date|enrolled|enrolled on|start date|started|started on|expires|expiry|expiration|expiration date|expires on|last login|last sign in)$/;

// Tried in this order, each taking the first free column whose header matches, so "Insider threat
// awareness" is not read as security awareness, "Security duties" (yes/no) not as the duties text,
// and "Access to systems containing CUI" not as an access date.
const HEADER_HINTS: [PersonColumnKind, RegExp][] = [
  ["roleBasedOn", /\brole based\b|\b3 2 2\b/],
  ["insiderThreatOn", /\binsider threat\b|\binsider risk\b|\b3 2 3\b/],
  ["awarenessOn", /\bawareness\b|\b3 2 1\b/],
  [
    "accessRemovedOn",
    /\b(access|credentials?|accounts?|login|logins)( and credentials)? (were )?(removed|revoked|disabled|deactivated|terminated)\b|\b3 9 2\b|\bdeprovisioned\b/,
  ],
  [
    "accessGrantedOn",
    /\baccess (granted|given|started|start|provisioned)\b|\b(provisioned|account created)( on| date)?$/,
  ],
  ["cuiAccess", /\bcui\b|\bcontrolled unclassified\b/],
  [
    "departureKind",
    /^(departure|departure kind|departure type|leaving reason|reason for leaving|reason left|exit type|separation type)$/,
  ],
  [
    "leftOn",
    /\b(left|transferred|termination date|terminated on|terminated|separation date|separated on|departure date|departed|end date|last day|exit date)\b/,
  ],
  [
    "screenedOn",
    /\bscreened\b|\bscreening (date|on|completed)\b|\bbackground check (date|on|completed)\b/,
  ],
  ["screeningMethod", /\bscreening\b|\bbackground check\b|\bvetting\b/],
  [
    "securityDuties",
    /^(security duties|has security duties|security role|security responsibilities|security staff)$/,
  ],
  ["dutiesDescription", /\b(duties|security duties description|responsibilities)\b/],
  ["status", /\bstatus\b|\bresult\b|\bprogress\b/],
  [
    "completedOn",
    /\b(completed|completion|completion date|date completed|completed on|finished|finished on|passed on|date passed|training date|trained on)\b/,
  ],
  [
    "course",
    /\b(course|course name|module|training|training name|campaign|assignment|content|program|programme|class|lesson)\b/,
  ],
  ["email", /\b(e ?mail|email address|user email|work email)\b/],
  ["firstName", /^(first name|first|given name|forename)$/],
  ["lastName", /^(last name|last|surname|family name)$/],
  [
    "name",
    /^(name|full name|person|employee|employee name|user|user name|learner|learner name|trainee|staff|staff member|display name|student|student name|member)$/,
  ],
  ["jobTitle", /\b(job title|title|role|position|job)\b/],
  ["notes", /\b(notes?|comments?|remarks?)\b/],
];

const LABEL: Record<PersonColumnKind, string> = {
  name: "name",
  firstName: "first name",
  lastName: "last name",
  email: "email",
  jobTitle: "job title",
  cuiAccess: "CUI access",
  securityDuties: "security duties",
  dutiesDescription: "duties",
  screenedOn: "screened on",
  screeningMethod: "screening",
  accessGrantedOn: "access granted on",
  awarenessOn: "security awareness training date",
  roleBasedOn: "role-based training date",
  insiderThreatOn: "insider threat training date",
  completedOn: "completion date",
  course: "course",
  status: "status",
  leftOn: "left or transferred on",
  departureKind: "departure",
  accessRemovedOn: "access removed on",
  notes: "notes",
};

const ALL_KINDS = Object.keys(LABEL) as PersonColumnKind[];
const emptyColumns = () =>
  Object.fromEntries(ALL_KINDS.map((k) => [k, null])) as Record<PersonColumnKind, string | null>;

function mapColumns(header: string[]) {
  const col = Object.fromEntries(ALL_KINDS.map((k) => [k, -1])) as Record<PersonColumnKind, number>;
  const taken = new Set<number>();
  header.forEach((h, c) => {
    if (SKIP_HEADER.test(normalise(h))) taken.add(c);
  });
  for (const [kind, re] of HEADER_HINTS) {
    for (let c = 0; c < header.length; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header[c] ?? "");
      if (h && re.test(h)) {
        taken.add(c);
        col[kind] = c;
        break;
      }
    }
  }
  return col;
}

const hasPersonColumn = (col: Record<PersonColumnKind, number>) =>
  col.name >= 0 || col.email >= 0 || (col.firstName >= 0 && col.lastName >= 0);

/** Index of the header row: the first of the top 20 that names a person (name, first and last, or email). */
function findHeader(table: string[][]): number {
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const row = table[r] ?? [];
    if (!row.some((v) => v.trim())) continue;
    const col = mapColumns(row);
    const dataCols = ALL_KINDS.filter(
      (k) => !["name", "firstName", "lastName", "email"].includes(k) && col[k] >= 0,
    );
    if (hasPersonColumn(col) && (dataCols.length > 0 || col.name >= 0)) return r;
  }
  return -1;
}

const DATE_KINDS: (DateField | "completedOn")[] = [...DATE_FIELDS, "completedOn"];

export function planPersonnelImport(csv: string, opts: PersonImportOptions): PersonImportPlan {
  const columns = emptyColumns();
  const issues: PersonImportIssue[] = [];
  const plan: PersonImportPlan = {
    mode: "roster",
    columns,
    rows: [],
    issues,
    dates: {
      order: opts.dateOrder ?? "mdy",
      source: opts.dateOrder ? "chosen" : "default",
      numeric: 0,
      evidenceLine: null,
    },
    courses: [],
  };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the people sheet as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the people sheet as CSV.`,
    });
    return plan;
  }
  const headerRow = findHeader(table);
  if (headerRow < 0) {
    issues.push({
      line: null,
      message:
        'No header row naming the people was found. Head the columns "Name" (or "First name" and "Last name") and "Email", with one column per date (for example "Security awareness training"), and import again.',
    });
    return plan;
  }
  const header = table[headerRow] ?? [];
  const col = mapColumns(header);
  for (const k of ALL_KINDS) if (col[k] >= 0) columns[k] = (header[col[k]] ?? "").trim();
  const specific = col.awarenessOn >= 0 || col.roleBasedOn >= 0 || col.insiderThreatOn >= 0;
  plan.mode = col.completedOn >= 0 && !specific ? "completions" : "roster";
  if (col.completedOn >= 0 && specific)
    issues.push({
      line: null,
      message: `The "${columns.completedOn}" column is not read: the file has a column for each training, and those are used.`,
    });

  const cell = (r: number, kind: PersonColumnKind) => {
    const c = col[kind];
    return c < 0 ? "" : unguard((table[r]?.[c] ?? "").replace(/\r\n?/g, "\n").trim());
  };

  // One date order for the whole file, read from every date column.
  const dateCells: { line: number; value: string }[] = [];
  for (let r = headerRow + 1; r < table.length; r++)
    for (const k of DATE_KINDS) {
      if (k === "completedOn" && plan.mode !== "completions") continue;
      const v = cell(r, k);
      if (v) dateCells.push({ line: r + 1, value: v });
    }
  plan.dates = readDateOrder(dateCells, opts.dateOrder);
  if (plan.dates.source === "detected")
    issues.push({
      line: null,
      message: `Dates such as 03/04/2026 are read as day/month/year (4 March 2026), because line ${plan.dates.evidenceLine}'s date can only be day first. Choose month/day/year if that is wrong.`,
    });
  else if (
    plan.dates.source === "default" &&
    plan.dates.numeric > 0 &&
    plan.dates.evidenceLine === null
  )
    issues.push({
      line: null,
      message:
        "Dates such as 03/04/2026 are read as month/day/year (March 4). Choose day/month/year if the file is written that way.",
    });

  const readDate = (r: number, kind: DateField | "completedOn", name: string): string | null => {
    const raw = cell(r, kind);
    if (!raw) return null;
    const d = parsePoamDate(raw, plan.dates.order);
    const line = r + 1;
    if (!d) {
      issues.push({
        line,
        message: `${name}: "${raw.slice(0, 40)}" in ${LABEL[kind]} is not a date this import reads (2026-03-31, 31 Mar 2026, or a numeric date in the file's order); that cell is not imported.`,
      });
      return null;
    }
    if (d > opts.today) {
      issues.push({
        line,
        message: `${name}: ${LABEL[kind]} ${d} is in the future, so it is not imported.`,
      });
      return null;
    }
    return d;
  };

  const rosterSeen = new Map<string, number>();
  const byPerson = new Map<string, PersonImportRow>();
  const courses = new Map<string, CourseSeen>();
  let notCompleted = 0;
  let noCourseChoice = 0;

  for (let r = headerRow + 1; r < table.length; r++) {
    const line = r + 1;
    if (!(table[r] ?? []).some((v) => v.trim())) continue;
    const used = ALL_KINDS.filter((k) => cell(r, k) === UNCALCULATED);
    if (used.length) {
      issues.push({
        line,
        message: `The ${used.map((k) => LABEL[k]).join(" and ")} cell is a formula saved without its result; open the file in Excel, save it, and import again. The row is left out.`,
      });
      continue;
    }
    let name = cell(r, "name");
    if (!name && (col.firstName >= 0 || col.lastName >= 0))
      name = [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ");
    name = name.replace(/\s+/g, " ");
    if (name.length > PERSON_NAME_MAX) {
      issues.push({
        line,
        message: `The name is over ${PERSON_NAME_MAX} characters; the row is left out.`,
      });
      continue;
    }
    const fields: PersonImportFields = {};
    const emailCell = cell(r, "email");
    if (emailCell) {
      if (EMAIL_RE.test(emailCell) && emailCell.length <= EMAIL_MAX) fields.email = emailCell;
      else
        issues.push({
          line,
          message: `${name || "This row"}: "${emailCell.slice(0, 60)}" is not an email address, so it is not imported.`,
        });
    }
    const who = name || fields.email || "";
    if (!who) {
      if ((table[r] ?? []).some((v) => v.trim()))
        issues.push({ line, message: "The row has no name or email, so it is left out." });
      continue;
    }

    if (plan.mode === "completions") {
      const status = cell(r, "status");
      if (col.status >= 0 && status && !isCompletedStatus(status)) {
        notCompleted++;
        continue;
      }
      const courseName = col.course >= 0 ? cell(r, "course").replace(/\s+/g, " ") : "";
      const key = col.course >= 0 ? normalise(courseName) : "";
      const done = readDate(r, "completedOn", who);
      if (!done) {
        if (!cell(r, "completedOn")) notCompleted++;
        continue;
      }
      const counts = (opts.courseMap?.[key] ?? []).filter((t) => TRAININGS.includes(t));
      const seen = courses.get(key) ?? {
        key,
        name: courseName || "(no course column)",
        rows: 0,
        counts,
      };
      seen.rows++;
      courses.set(key, seen);
      const pKey = fields.email ? `e:${personEmailKey(fields.email)}` : `n:${personNameKey(name)}`;
      const row = byPerson.get(pKey) ?? { line, name, fields: {} };
      if (!row.name && name) row.name = name;
      if (fields.email && !row.fields.email) row.fields.email = fields.email;
      if (!counts.length) {
        noCourseChoice++;
        byPerson.set(pKey, row);
        continue;
      }
      for (const t of counts) {
        const f = TRAINING_FIELD[t];
        const cur = row.fields[f];
        if (!cur || done > cur) row.fields[f] = done;
      }
      byPerson.set(pKey, row);
      continue;
    }

    // Roster: one row a person.
    const pKey = fields.email ? `e:${personEmailKey(fields.email)}` : `n:${personNameKey(name)}`;
    const prior =
      rosterSeen.get(pKey) ?? (name ? rosterSeen.get(`n:${personNameKey(name)}`) : undefined);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `${who}: the same person as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    rosterSeen.set(pKey, line);
    if (name) rosterSeen.set(`n:${personNameKey(name)}`, line);

    for (const k of Object.keys(PERSON_TEXT_MAX) as (keyof typeof PERSON_TEXT_MAX)[]) {
      const v = cell(r, k);
      if (!v) continue;
      const max = PERSON_TEXT_MAX[k];
      if (v.length > max)
        issues.push({
          line,
          message: `${who}: the ${LABEL[k]} is over ${max} characters; the first ${max} are imported.`,
        });
      fields[k] = v.slice(0, max);
    }
    for (const k of ["cuiAccess", "securityDuties"] as const) {
      const v = cell(r, k);
      if (!v) continue;
      const yn = parseYesNo(v);
      if (yn === null)
        issues.push({
          line,
          message: `${who}: "${v.slice(0, 30)}" in ${LABEL[k]} is not yes or no; that cell is not imported.`,
        });
      else fields[k] = yn;
    }
    for (const k of DATE_FIELDS) {
      const d = readDate(r, k, who);
      if (d) fields[k] = d;
    }
    const dep = cell(r, "departureKind");
    if (dep) {
      const kind = parseDepartureKind(dep);
      if (kind) fields.departureKind = kind;
      else
        issues.push({
          line,
          message: `${who}: "${dep.slice(0, 40)}" in ${LABEL.departureKind} is neither leaving the organization nor a transfer; that cell is not imported.`,
        });
    }
    plan.rows.push({ line, name, fields });
  }

  if (plan.mode === "completions") {
    plan.rows = [...byPerson.values()].sort((a, b) => a.line - b.line);
    plan.courses = [...courses.values()].sort(
      (a, b) => b.rows - a.rows || a.name.localeCompare(b.name),
    );
    if (notCompleted)
      issues.push({
        line: null,
        message: `${notCompleted} row${notCompleted === 1 ? " is" : "s are"} not completed (no completion date, or a status other than completed or passed) and ${notCompleted === 1 ? "is" : "are"} left out.`,
      });
    if (noCourseChoice)
      issues.push({
        line: null,
        message: `${noCourseChoice} completion${noCourseChoice === 1 ? "" : "s"} belong to a course not yet matched to a requirement. Choose which training each course counts for (security awareness 3.2.1, role-based 3.2.2, insider threat 3.2.3); this import never reads that from the course title.`,
      });
  }
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "No people were found under the header." });
  return plan;
}

/** How many people a sheet would import; the browser picks the sheet with the most. */
export function personRowsIn(csv: string, today: string): number {
  return planPersonnelImport(csv, { today }).rows.length;
}

export const TRAINING_CHOICES = TRAININGS.map((key) => ({
  key,
  label: TRAINING_INFO[key].label,
  controlId: TRAINING_INFO[key].controlId,
}));

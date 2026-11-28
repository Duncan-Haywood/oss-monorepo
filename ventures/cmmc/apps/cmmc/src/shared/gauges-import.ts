// Gauges and calibration, part 3: an existing gauge list (a spreadsheet saved as CSV, or the chosen
// sheet of an .xlsx turned into CSV in the browser by controls/sheet-import.ts) read into the gauge
// register, so a shop that keeps its calibration list in Excel moves in without retyping it. Pure: the
// worker checks rows against the org's gauges and writes them (services/calibration/import.ts); the
// browser shows the same preview. This register's own CSV export (gaugeListCsv) reads back in.
//
// Nothing is guessed that an auditor would read as a record:
// - a row needs a gauge id and a description; an id already on the list is left as it is;
// - a gauge in use needs a calibration interval: from the file's interval column, or the whole number
//   of months between its last calibration and its due date when those two say so exactly;
// - the last calibration becomes a calibration record only when its result is known: from a result
//   ("as found", "pass/fail") cell, or from the person's statement, for the whole file, that the last
//   calibrations it lists were found in tolerance and went back into use. Without either, the gauge
//   comes in with no calibration and the register shows it as never calibrated until one is recorded;
// - who calibrated it comes from a "calibrated by" cell (in-house words read as in house, any other
//   name as the outside lab), else from the person's whole-file choice, else the record is left out.
// The kind of gauge is a label for sorting, not a record: it is read from a type cell, else from words
// in the description ("0-6 in caliper"), else Other, and the preview says which.

import {
  type AsFound,
  CAL_INTERVAL_MAX,
  CAL_INTERVAL_MIN,
  CAL_TEXT_MAX,
  type CalPerformer,
  GAUGE_KIND_LABEL,
  GAUGE_KINDS,
  GAUGE_OWNER_LABEL,
  GAUGE_TAG_MAX,
  GAUGE_TEXT_MAX,
  type GaugeKind,
  type GaugeOwner,
  type GaugeStatus,
  nextDue,
} from "./calibration";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv } from "./controls/csv-import";
import {
  type DateOrder,
  type DateOrderRead,
  parsePoamDate,
  readDateOrder,
} from "./controls/poam-import";
import { UNCALCULATED } from "./xlsx";

export type GaugeColumnKind =
  | "tag"
  | "description"
  | "kind"
  | "manufacturer"
  | "serial"
  | "range"
  | "location"
  | "owner"
  | "assignedTo"
  | "status"
  | "interval"
  | "lastCalibratedOn"
  | "dueOn"
  | "calibratedBy"
  | "result"
  | "certificateNo"
  | "traceability"
  | "method"
  | "notes";

/** Columns found and never imported: the export's "State today" is worked out, not recorded. */
type IgnoredKind = "stateToday";

export interface GaugeImportRow {
  /** 1-based line in the file (the Excel row for a workbook). */
  line: number;
  tag: string;
  description: string;
  kind: GaugeKind;
  kindSource: "file" | "description" | "default";
  manufacturer: string;
  serial: string;
  range: string;
  location: string;
  owner: GaugeOwner;
  assignedTo: string;
  status: GaugeStatus;
  intervalMonths: number | null;
  /** From the interval cell, or worked out from the last calibration and the due date. */
  intervalSource: "file" | "due" | null;
  lastCalibratedOn: string | null;
  /** The due date the file gives (checked against the last calibration). */
  dueOn: string | null;
  /** The "calibrated by" cell as written; empty when the file has none. */
  calibratedBy: string;
  /** Read from the cell: in-house words, else the outside lab; null when the cell is empty. */
  performerFromFile: CalPerformer | null;
  /** The result cell; null when the file does not say. */
  result: AsFound | null;
  certificateNo: string;
  traceability: string;
  method: string;
  notes: string;
}

export interface GaugeImportIssue {
  line: number | null;
  message: string;
}

export interface GaugeImportPlan {
  columns: Record<GaugeColumnKind, string | null>;
  dates: DateOrderRead;
  rows: GaugeImportRow[];
  issues: GaugeImportIssue[];
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same gauge: the same id, ignoring case and spaces at either end. */
export const gaugeTagKey = (tag: string) => tag.trim().toLowerCase();

/** Undo the export's formula guard: a leading ' before = + - @ is the guard, not the value. */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

const CLEAN = /^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$/u;

// ---- cells ----

// Tried in order: "thread ring gauge" is a thread gauge, "height gauge" not a gauge block, "dial
// caliper" a caliper and "bore gauge" an indicator-type gauge left as Other.
const KIND_WORDS: [GaugeKind, RegExp][] = [
  ["thread_gauge", /\bthread\b/],
  ["height_gauge", /\bheight (gauge|gage|master)\b|\bheight gauges?\b/],
  ["gauge_blocks", /\b(gauge|gage|jo) blocks?\b/],
  ["caliper", /\b(calipers?|callipers?|vernier)\b/],
  ["micrometer", /\b(micrometers?|mics?)\b/],
  ["indicator", /\b(indicators?|dti|dial test|test indicator)\b/],
  ["pin_plug_gauge", /\b(pin|plug|pins|go no go) ?(gauges?|gages?|set)?\b/],
  ["ring_gauge", /\bring (gauges?|gages?)\b|\brings?\b/],
  ["cmm", /\bcmm\b|\bcoordinate measuring\b/],
  ["torque_tool", /\btorque\b/],
  ["surface_plate", /\bsurface plate\b|\bgranite plate\b/],
  ["hardness_tester", /\bhardness\b|\brockwell\b|\bdurometer\b|\bbrinell\b/],
  ["scale", /\b(balance|weigh(ing)? scale|scale)\b/],
];

const LABEL_TO_KIND = new Map(
  GAUGE_KINDS.map((k) => [normalise(GAUGE_KIND_LABEL[k]), k] as [string, GaugeKind]),
);

/** The kind of gauge from words; null when none say it. */
export function parseGaugeKind(cell: string): GaugeKind | null {
  const n = normalise(cell);
  if (!n) return null;
  const exact = LABEL_TO_KIND.get(n);
  if (exact) return exact;
  for (const [kind, re] of KIND_WORDS) if (re.test(n)) return kind;
  return n === "other" ? "other" : null;
}

/** In use, reference only, out of service or retired, from the words a gauge list uses. */
export function parseGaugeStatus(cell: string): GaugeStatus | null {
  const n = normalise(cell);
  if (!n) return null;
  if (/^(in use|active|in service|current|in cal|calibrated|ok|available)$/.test(n))
    return "active";
  if (/\b(reference|ref|nfc|not for calibration|no cal(ibration)? required|ncr)\b/.test(n))
    return "reference_only";
  if (
    /\b(out of service|tagged out|out for repair|repair|damaged|on hold|hold|quarantine)\b/.test(n)
  )
    return "out_of_service";
  if (/\b(retired|scrapped|scrap|lost|sold|disposed|discarded|obsolete)\b/.test(n))
    return "retired";
  return null;
}

/** Company, employee's own or customer's; null when the cell says something else. */
export function parseGaugeOwner(cell: string): GaugeOwner | null {
  const n = normalise(cell);
  if (!n) return null;
  const exact = (Object.keys(GAUGE_OWNER_LABEL) as GaugeOwner[]).find(
    (k) => normalise(GAUGE_OWNER_LABEL[k]) === n,
  );
  if (exact) return exact;
  if (/^(company|shop|house|plant|in house)( owned)?$/.test(n)) return "company";
  if (/\b(employee|personal|operator|machinist|own)\b/.test(n)) return "employee";
  if (/\bcustomer\b/.test(n)) return "customer";
  return null;
}

/** In tolerance or out of tolerance, from a result cell. */
export function parseCalResult(cell: string): AsFound | null {
  const n = normalise(cell);
  if (!n) return null;
  if (/^(out of tolerance|oot|fail|failed|reject|rejected|nc|nonconforming|out)$/.test(n))
    return "out_of_tolerance";
  if (/^(in tolerance|in tol|it|pass|passed|accept|accepted|ok|good|conforming|in)$/.test(n))
    return "in_tolerance";
  return null;
}

const IN_HOUSE = /^(in house|inhouse|internal|self|qc|qa|quality|inspection|metrology|shop)$/;

/**
 * A calibration interval in months. `unit` is what the header says the numbers are in. Days read as
 * months only at the counts calibration labs use for them (30, 90, 180, 365, 730), and the note says so.
 */
export function parseIntervalMonths(
  cell: string,
  unit: "months" | "days" | "weeks" | "years" = "months",
): { months: number; note?: string } | null {
  const n = normalise(cell);
  if (!n) return null;
  const words: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    "semi annual": 6,
    "semi annually": 6,
    semiannual: 6,
    "twice a year": 6,
    "bi annual": 6,
    annual: 12,
    annually: 12,
    yearly: 12,
    "every year": 12,
    biennial: 24,
    biennially: 24,
    "every 2 years": 24,
    "every two years": 24,
  };
  if (words[n] !== undefined) return { months: words[n] as number };
  const m = /^(?:every )?(\d+)(?: ?(months?|mos?|m|years?|yrs?|y|days?|d|weeks?|wks?|w))?$/.exec(n);
  if (!m) return null;
  const count = Number(m[1]);
  const u = m[2] ?? "";
  const kind = /^(y|yrs?|years?)$/.test(u)
    ? "years"
    : /^(d|days?)$/.test(u)
      ? "days"
      : /^(w|wks?|weeks?)$/.test(u)
        ? "weeks"
        : u
          ? "months"
          : unit;
  if (kind === "months") return { months: count };
  if (kind === "years") return { months: count * 12 };
  const days = kind === "weeks" ? count * 7 : count;
  const byDays: Record<number, number> = {
    30: 1,
    31: 1,
    90: 3,
    91: 3,
    180: 6,
    182: 6,
    183: 6,
    365: 12,
    730: 24,
  };
  const months = byDays[days];
  if (months === undefined) return null;
  return { months, note: `${cell.trim()} is read as ${months} month${months === 1 ? "" : "s"}.` };
}

/** The whole number of months from one date to another, when the second is exactly that many on. */
export function wholeMonthsBetween(from: string, to: string): number | null {
  for (let n = CAL_INTERVAL_MIN; n <= CAL_INTERVAL_MAX; n++) if (nextDue(from, n) === to) return n;
  return null;
}

// ---- columns ----

// Tried in this order, each taking the first free column whose header matches, so "Calibrated by" is
// not the calibration date, "Next cal due" is not the last calibration, "Cert #" is not the serial and
// "Gauge id" is not the description.
const HEADER_HINTS: [GaugeColumnKind | IgnoredKind, RegExp][] = [
  ["stateToday", /\bstate today\b/],
  [
    "calibratedBy",
    /\b(calibrated|performed|done|cal d) by\b|\bcal(ibration)? (vendor|lab|laboratory|provider|source|agency|house)\b|^(vendor|lab|laboratory|calibrator|technician)$/,
  ],
  ["dueOn", /\bdue\b|\bnext cal(ibration)?\b|\bnext (date|calibration date)\b|\brecall date\b/],
  [
    "lastCalibratedOn",
    /\blast cal(ibrat(ed|ion))?\b|\bcal(ibration)? date\b|\bdate (last )?calibrated\b|^calibrated( on)?$|\bdate of (last )?cal(ibration)?\b/,
  ],
  [
    "interval",
    /\binterval\b|\bfrequency\b|\bcycle\b|\bcal(ibration)? period\b|\bperiod\b|\bevery\b/,
  ],
  ["result", /\bresult\b|\bas found\b|\bpass( or)? fail\b|\bcondition found\b|\bin tolerance\b/],
  ["certificateNo", /\bcert(ificate|s)?( no| number| num| id)?$|\bcertificate\b/],
  [
    "traceability",
    /\btrace(ability|able)?\b|\bstandard used\b|\bmasters? used\b|\breference standard\b/,
  ],
  ["serial", /\bserial\b|^s n$|^sn$|\bs n\b/],
  ["manufacturer", /\bmanufacturer\b|^(mfr|mfg|make|brand|maker)$/],
  ["range", /\brange\b|\bresolution\b|\bcapacity\b|^size$|\bgraduation\b/],
  [
    "assignedTo",
    /\bassigned( to)?\b|\bissued to\b|\bcustodian\b|^(user|employee|machinist|operator)$/,
  ],
  ["owner", /\bowner(ship)?\b|\bowned by\b/],
  ["location", /\blocation\b|^(area|department|dept|stored|work center|storage)$/],
  ["method", /\bmethod\b|\bprocedure\b|\bwork instruction\b|\bcal(ibration)? (instruction|spec)\b/],
  ["kind", /^(gauge |gage |instrument |equipment |tool )?(type|kind|category|class)$/],
  ["status", /^(gauge |gage |instrument |equipment |cal(ibration)? )?status$/],
  [
    "tag",
    /^(gauge|gage|instrument|equipment|asset|tool|inventory|control|cal(ibration)?)( (id|no|number|num|tag|code))?$|^(id|tag|tag no|tag number|id no|id number)$/,
  ],
  [
    "description",
    /^(gauge |gage |instrument |equipment |tool |item )?(description|name)$|^desc(ription)?$|^item$/,
  ],
  ["notes", /\b(notes?|comments?|remarks?)\b/],
];

const LABEL: Record<GaugeColumnKind, string> = {
  tag: "gauge id",
  description: "description",
  kind: "kind",
  manufacturer: "manufacturer",
  serial: "serial",
  range: "range",
  location: "location",
  owner: "owner",
  assignedTo: "assigned to",
  status: "status",
  interval: "interval",
  lastCalibratedOn: "last calibrated",
  dueOn: "due date",
  calibratedBy: "calibrated by",
  result: "result",
  certificateNo: "certificate",
  traceability: "traceability",
  method: "method",
  notes: "notes",
};

export const GAUGE_COLUMN_KINDS = Object.keys(LABEL) as GaugeColumnKind[];

const TAG_RE = HEADER_HINTS.find(([k]) => k === "tag")?.[1] as RegExp;
const DESC_RE = HEADER_HINTS.find(([k]) => k === "description")?.[1] as RegExp;

/** Index of the header row: the first of the top 20 with both a gauge id and a description header. */
function findHeader(table: string[][]): number {
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const cells = (table[r] ?? []).map(normalise);
    if (cells.some((v) => TAG_RE.test(v)) && cells.some((v) => DESC_RE.test(v))) return r;
  }
  return -1;
}

const DATE_KINDS = ["lastCalibratedOn", "dueOn"] as const;

/**
 * Read a gauge list. `today` (YYYY-MM-DD) refuses a last calibration in the future (a due date may be
 * in the future); `dateOrder` is the person's choice for numeric dates, else it is detected.
 */
export function planGaugeImport(
  csv: string,
  today: string,
  dateOrder?: DateOrder,
): GaugeImportPlan {
  const columns = Object.fromEntries(GAUGE_COLUMN_KINDS.map((k) => [k, null])) as Record<
    GaugeColumnKind,
    string | null
  >;
  const issues: GaugeImportIssue[] = [];
  const plan: GaugeImportPlan = { columns, dates: readDateOrder([], dateOrder), rows: [], issues };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({ line: null, message: "The file is over 1 MB. Save only the gauge list as CSV." });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the gauge list as CSV.`,
    });
    return plan;
  }
  const headerRow = findHeader(table);
  if (headerRow < 0) {
    issues.push({
      line: null,
      message:
        'No header row with a gauge id and a description was found. Name the columns "Gauge ID" and "Description" and import again.',
    });
    return plan;
  }
  const header = table[headerRow] ?? [];
  const col = Object.fromEntries(GAUGE_COLUMN_KINDS.map((k) => [k, -1])) as Record<
    GaugeColumnKind,
    number
  >;
  const taken = new Set<number>();
  for (const [kind, re] of HEADER_HINTS) {
    for (let c = 0; c < header.length; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header[c] ?? "");
      if (h && re.test(h)) {
        taken.add(c);
        if (kind !== "stateToday") {
          col[kind] = c;
          columns[kind] = (header[c] ?? "").trim();
        }
        break;
      }
    }
  }
  const intervalHeader = normalise(columns.interval ?? "");
  const unit = /\bdays?\b/.test(intervalHeader)
    ? "days"
    : /\bweeks?\b/.test(intervalHeader)
      ? "weeks"
      : /\b(years?|yrs?)\b/.test(intervalHeader)
        ? "years"
        : "months";

  const cellAt = (r: number, kind: GaugeColumnKind) => {
    const c = col[kind];
    return c < 0 ? "" : unguard((table[r]?.[c] ?? "").replace(/\r\n?/g, "\n").trim());
  };
  const dateCells: { line: number; value: string }[] = [];
  for (let r = headerRow + 1; r < table.length; r++)
    for (const k of DATE_KINDS) {
      const value = cellAt(r, k);
      if (value) dateCells.push({ line: r + 1, value });
    }
  plan.dates = readDateOrder(dateCells, dateOrder);
  const order = plan.dates.order;

  const seen = new Map<string, number>();
  for (let r = headerRow + 1; r < table.length; r++) {
    const line = r + 1;
    if (!(table[r] ?? []).some((v) => v.trim())) continue;
    const raw = (kind: GaugeColumnKind) => cellAt(r, kind);
    const used = GAUGE_COLUMN_KINDS.filter((k) => raw(k) === UNCALCULATED);
    if (used.length) {
      issues.push({
        line,
        message: `The ${used.map((k) => LABEL[k]).join(" and ")} cell is a formula saved without its result; open the file in Excel, save it, and import again. The row is left out.`,
      });
      continue;
    }
    const clip = (kind: GaugeColumnKind, max: number) => {
      const v = kind === "notes" ? raw(kind) : raw(kind).replace(/\s+/g, " ");
      if (v.length <= max) return v;
      issues.push({
        line,
        message: `The ${LABEL[kind]} is over ${max} characters; the first ${max} are imported.`,
      });
      return v.slice(0, max).trim();
    };
    const tag = raw("tag").replace(/\s+/g, " ");
    const description = clip("description", GAUGE_TEXT_MAX);
    if (!tag) {
      if ((table[r] ?? []).some((v, c) => c !== col.tag && v.trim()))
        issues.push({ line, message: "The row has no gauge id, so it is left out." });
      continue;
    }
    if (tag.length > GAUGE_TAG_MAX || !CLEAN.test(tag)) {
      issues.push({
        line,
        message: `"${tag.slice(0, 50)}" is not a gauge id this register keeps (up to ${GAUGE_TAG_MAX} printable characters); the row is left out.`,
      });
      continue;
    }
    if (!description) {
      issues.push({ line, message: `${tag}: no description, so the row is left out.` });
      continue;
    }
    const key = gaugeTagKey(tag);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `${tag}: same gauge id as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    seen.set(key, line);
    const note = (message: string) => issues.push({ line, message: `${tag}: ${message}` });

    const kindCell = raw("kind");
    let kind = parseGaugeKind(kindCell);
    let kindSource: GaugeImportRow["kindSource"] = "file";
    if (!kind) {
      if (kindCell)
        note(
          `"${kindCell.slice(0, 40)}" is not a kind this register lists; it is read from the description.`,
        );
      kind = parseGaugeKind(description);
      kindSource = kind ? "description" : "default";
      kind = kind ?? "other";
    }
    const statusCell = raw("status");
    let status = parseGaugeStatus(statusCell);
    if (statusCell && !status)
      note(
        `"${statusCell.slice(0, 40)}" is not a status this import reads (in use, reference only, out of service, retired); it is read as in use.`,
      );
    status = status ?? "active";
    const ownerCell = raw("owner");
    let owner = parseGaugeOwner(ownerCell);
    if (ownerCell && !owner)
      note(
        `"${ownerCell.slice(0, 40)}" is not company, employee's own or customer's; it is read as company.`,
      );
    owner = owner ?? "company";

    const dates: Partial<Record<(typeof DATE_KINDS)[number], string>> = {};
    for (const k of DATE_KINDS) {
      const v = raw(k);
      if (!v) continue;
      if (/^(n ?a|none|ref(erence)?( only)?|nfc|ncr|-+)$/i.test(normalise(v) || v)) continue;
      const d = parsePoamDate(v, order);
      if (!d)
        note(
          `"${v.slice(0, 30)}" in ${LABEL[k]} is not a date this import reads; it is left blank.`,
        );
      else if (k === "lastCalibratedOn" && d > today)
        note(`the last calibration ${d} is in the future; it is left blank.`);
      else dates[k] = d;
    }
    const lastCalibratedOn = dates.lastCalibratedOn ?? null;
    let dueOn = dates.dueOn ?? null;
    if (lastCalibratedOn && dueOn && dueOn <= lastCalibratedOn) {
      note(
        `the due date ${dueOn} is not after the last calibration ${lastCalibratedOn}; the due date is left blank.`,
      );
      dueOn = null;
    }

    let intervalMonths: number | null = null;
    let intervalSource: GaugeImportRow["intervalSource"] = null;
    const intervalCell = raw("interval");
    if (
      intervalCell &&
      !/^(n ?a|none|ref(erence)?( only)?|nfc|ncr|0|-+)$/.test(
        normalise(intervalCell) || intervalCell,
      )
    ) {
      const read = parseIntervalMonths(intervalCell, unit);
      if (!read || read.months < CAL_INTERVAL_MIN || read.months > CAL_INTERVAL_MAX)
        note(
          `"${intervalCell.slice(0, 30)}" is not an interval this import reads (a whole number of months from ${CAL_INTERVAL_MIN} to ${CAL_INTERVAL_MAX}, or words like Annual); it is left blank.`,
        );
      else {
        intervalMonths = read.months;
        intervalSource = "file";
        if (read.note) note(read.note);
      }
    }
    if (intervalMonths === null && lastCalibratedOn && dueOn) {
      const n = wholeMonthsBetween(lastCalibratedOn, dueOn);
      if (n !== null) {
        intervalMonths = n;
        intervalSource = "due";
      } else
        note(
          `the due date ${dueOn} is not a whole number of months after ${lastCalibratedOn}, so no interval is read from them.`,
        );
    }
    if (status !== "active" && intervalSource === "due") {
      intervalMonths = null;
      intervalSource = null;
    }
    if (status === "active" && intervalMonths === null) {
      note(
        `in use with no calibration interval, so the row is left out. Add an interval column (for example "12" or "Annual"), or mark it reference only.`,
      );
      continue;
    }
    if (!lastCalibratedOn && dueOn)
      note(
        `a due date with no last calibration date: the gauge comes in as never calibrated; record its last certificate on the Gauges tab.`,
      );
    if (!lastCalibratedOn) dueOn = null;

    const resultCell = raw("result");
    const result = parseCalResult(resultCell);
    if (resultCell && !result)
      note(
        `"${resultCell.slice(0, 30)}" in ${LABEL.result} is not in or out of tolerance (pass or fail); it is read as not stated.`,
      );
    const calibratedBy = clip("calibratedBy", GAUGE_TEXT_MAX);
    const performerFromFile: CalPerformer | null = calibratedBy
      ? IN_HOUSE.test(normalise(calibratedBy))
        ? "in_house"
        : "external"
      : null;
    plan.rows.push({
      line,
      tag,
      description,
      kind,
      kindSource,
      manufacturer: clip("manufacturer", GAUGE_TEXT_MAX),
      serial: clip("serial", GAUGE_TEXT_MAX),
      range: clip("range", GAUGE_TEXT_MAX),
      location: clip("location", GAUGE_TEXT_MAX),
      owner,
      assignedTo: clip("assignedTo", GAUGE_TEXT_MAX),
      status,
      intervalMonths,
      intervalSource,
      lastCalibratedOn,
      dueOn,
      calibratedBy,
      performerFromFile,
      result,
      certificateNo: clip("certificateNo", GAUGE_TEXT_MAX),
      traceability: clip("traceability", GAUGE_TEXT_MAX),
      method: clip("method", GAUGE_TEXT_MAX),
      notes: clip("notes", CAL_TEXT_MAX),
    });
  }
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "No gauge rows were found under the header." });
  return plan;
}

/** How many rows of a sheet would import; the browser picks the sheet with the most. */
export function gaugeRowsIn(csv: string, today: string): number {
  return planGaugeImport(csv, today).rows.length;
}

/** What the person says, for the whole file, about the last calibrations it lists. */
export interface GaugeImportOptions {
  /** The last calibrations with no result cell were found in tolerance and went back into use. */
  lastCalPassed: boolean;
  /** Who calibrated the rows with no "calibrated by" cell; null leaves those records out. */
  performerDefault: CalPerformer | null;
  dateOrder?: DateOrder;
}

export const NOT_NAMED = "Not named in the imported gauge list";

export interface PlannedCalibration {
  calibratedOn: string;
  performer: CalPerformer;
  performedBy: string;
  asFound: AsFound;
  asLeft: "returned" | "removed";
  certificateNo: string;
  traceability: string;
  readings: string;
  intervalMonths: number | null;
  dueOn: string | null;
  /** Where the result came from: the file's cell, or the person's statement at import. */
  resultSource: "file" | "statement";
}

export type CalibrationPlan =
  | { kind: "none" }
  | { kind: "record"; calibration: PlannedCalibration }
  | { kind: "needs"; result: boolean; performer: boolean; message?: string };

/**
 * The calibration record one row's last calibration becomes, or why it does not. An out-of-tolerance
 * result on a gauge in use is left out: what was done (adjusted, repaired) is not in the list, so it is
 * recorded on the Gauges tab with its impact.
 */
export function plannedCalibration(
  row: GaugeImportRow,
  opts: Pick<GaugeImportOptions, "lastCalPassed" | "performerDefault">,
  today: string,
): CalibrationPlan {
  if (!row.lastCalibratedOn) return { kind: "none" };
  const result: AsFound | null = row.result ?? (opts.lastCalPassed ? "in_tolerance" : null);
  const performer = row.performerFromFile ?? opts.performerDefault;
  if (!result || !performer) return { kind: "needs", result: !result, performer: !performer };
  if (result === "out_of_tolerance" && row.status === "active")
    return {
      kind: "needs",
      result: false,
      performer: false,
      message: `found out of tolerance on ${row.lastCalibratedOn} and still in use: the list does not say what was done, so that calibration is left out. Record it on the Gauges tab, with what was adjusted and the parts it measured.`,
    };
  const asLeft = result === "out_of_tolerance" ? "removed" : "returned";
  const resultSource = row.result ? "file" : "statement";
  const dueOn =
    asLeft === "removed" || row.intervalMonths === null
      ? null
      : (row.dueOn ?? nextDue(row.lastCalibratedOn, row.intervalMonths));
  return {
    kind: "record",
    calibration: {
      calibratedOn: row.lastCalibratedOn,
      performer,
      performedBy: row.calibratedBy || NOT_NAMED,
      asFound: result,
      asLeft,
      certificateNo: row.certificateNo,
      traceability: row.traceability,
      readings:
        resultSource === "file"
          ? `Recorded from the imported gauge list on ${today}.`
          : `Recorded from the imported gauge list on ${today}; the list gives no result, and the person importing it stated that the last calibrations it lists were found in tolerance and went back into use.`,
      intervalMonths: row.intervalMonths,
      dueOn,
      resultSource,
    },
  };
}

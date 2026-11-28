// Document control, part 3b: an existing master list of controlled documents (the spreadsheet most
// shops keep before they have any software, or this register's own CSV export) read into the
// register, so a shop moves in without retyping forty procedures and their revisions. Pure: the
// worker skips numbers already on the list, matches names to members and writes the rows and their
// history; the browser shows the same preview.
//
// Nothing is guessed. A row needs a document number and a title. A revision counts as released (in
// force) only when the row gives both the revision and the date it was approved or released; a row
// without them comes in as a draft, which the register then shows as never released, the gap an
// auditor would see. A cell this reader cannot read with certainty (a date that is no date, a review
// interval other than 12, 24 or 36 months, a status it does not know) leaves that one field out with
// a note. The type comes from the type cell, else from the title's own words ("Work Instruction",
// "Inspection Checklist"); with neither it is Other. The shop's names for people are matched to
// members by name or email only when exactly one member matches.
//
// ISO 9001's text is copyrighted, so nothing here quotes it (docs/SOURCES.md, "Document control").
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv } from "./controls/csv-import";
import {
  type DateOrder,
  type DateOrderRead,
  parsePoamDate,
  readDateOrder,
} from "./controls/poam-import";
import {
  DOC_NUMBER_MAX,
  DOC_REVIEW_MONTHS,
  DOC_REVISION_MAX,
  DOC_TITLE_MAX,
  type DocKind,
  type DocOrigin,
  type DocStatus,
  validateDocumentFields,
} from "./document-control";
import { UNCALCULATED } from "./xlsx";

export const DOC_ISSUER_MAX = 200;
export const DOC_LOCATION_MAX = 500;
export const DOC_NOTES_MAX = 4000;
export const DOC_PERSON_MAX = 200;

export type DocColumnKind =
  | "docNumber"
  | "title"
  | "kind"
  | "origin"
  | "issuer"
  | "revision"
  | "status"
  | "approvedBy"
  | "approvedOn"
  | "effectiveOn"
  | "lastReviewedOn"
  | "reviewDue"
  | "withdrawnOn"
  | "owner"
  | "location"
  | "reviewMonths"
  | "notes";

/** Columns found only so they are not read as another kind; their cells are never imported. */
type IgnoredKind = "draftRevision" | "openGaps";

export interface DocImportRow {
  /** 1-based line in the file (the Excel row for a workbook). */
  line: number;
  docNumber: string;
  title: string;
  kind: DocKind;
  /** Where the type came from: its own cell, the title's words, or neither (Other). */
  kindSource: "file" | "title" | "default";
  origin: DocOrigin;
  issuer: string;
  revision: string;
  status: DocStatus;
  approvedOn: string | null;
  effectiveOn: string | null;
  lastReviewedOn: string | null;
  /** The file's own next review date, used as is; else the worker counts it from the interval. */
  reviewDue: string | null;
  withdrawnOn: string | null;
  /** Names as the file gives them; the worker matches them to members. */
  approvedByName: string;
  ownerName: string;
  location: string;
  reviewMonths: number | null;
  notes: string;
}

export interface DocImportIssue {
  line: number | null;
  message: string;
}

export interface DocImportPlan {
  columns: Record<DocColumnKind, string | null>;
  dates: DateOrderRead;
  rows: DocImportRow[];
  issues: DocImportIssue[];
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same document: the same number, ignoring case and spacing at the ends. */
export const docNumberKey = (n: string) => n.trim().toUpperCase();

/** Same person: the same name or email, ignoring case, spacing and punctuation. */
export const personKey = (s: string) => normalise(s);

const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

// ---- cells ----

const KIND_WORDS: [DocKind, RegExp][] = [
  ["quality_manual", /\b(quality )?manual\b|\bqm\b/],
  ["work_instruction", /\bwork instructions?\b|\bwi\b|\binstructions?\b/],
  ["procedure", /\bprocedures?\b|\bsops?\b|\bqps?\b|\bprocess(es)?\b/],
  ["record_template", /\brecord( templates?)?\b|\btemplates?\b/],
  ["form", /\bforms?\b|\bchecklists?\b|\blogs?\b|\btags?\b|\blabels?\b/],
  ["specification", /\bspec(ification)?s?\b|\bstandards?\b/],
  ["drawing", /\bdrawings?\b|\bprints?\b|\bblueprints?\b|\bdwgs?\b/],
  ["other", /^other$/],
];

/** The type from a type cell's words; null when it says none of them. */
export function parseDocKind(cell: string): DocKind | null {
  const n = normalise(cell);
  if (!n) return null;
  for (const [kind, re] of KIND_WORDS) if (re.test(n)) return kind;
  return null;
}

// The title is read for longer phrases only, so "Manual deburring" is not a quality manual and
// "Process for anodize" not a procedure: the words a title uses when it names its own type.
const TITLE_WORDS: [DocKind, RegExp][] = [
  ["quality_manual", /\bquality (system |management system )?manual\b/],
  ["work_instruction", /\bwork instructions?\b/],
  ["procedure", /\bprocedures?\b|\bsop\b/],
  ["form", /\bforms?\b|\bchecklists?\b/],
  ["specification", /\bspecifications?\b/],
  ["drawing", /\bdrawings?\b/],
];

export function kindFromTitle(title: string): DocKind | null {
  const n = normalise(title);
  for (const [kind, re] of TITLE_WORDS) if (re.test(n)) return kind;
  return null;
}

/** Internal or external from an origin cell; null when it says neither. */
export function parseDocOrigin(cell: string): DocOrigin | null {
  const n = normalise(cell);
  if (!n) return null;
  if (/^(internal|ours?|in house|inhouse|company|own|i)$/.test(n)) return "internal";
  if (/^(external|customer|supplier|vendor|standard|outside|third party|e)\b/.test(n))
    return "external";
  return null;
}

/** The status a status cell gives; null when it is not one this reader knows. */
export function parseDocStatus(cell: string): DocStatus | null {
  const n = normalise(cell);
  if (!n) return null;
  if (
    /^(obsolete|obsoleted|withdrawn|superseded|retired|archived|inactive|void|voided|cancell?ed|discontinued)\b/.test(
      n,
    )
  )
    return "obsolete";
  if (
    /^(draft|in draft|in review|under review|pending( approval)?|in work|wip|in progress|for review|not released|unreleased)$/.test(
      n,
    )
  )
    return "draft";
  if (/^(released|active|current|approved|in use|issued|effective|in force|live)$/.test(n))
    return "released";
  return null;
}

/** 12, 24 or 36 months from "12", "Annual", "Every 2 years", "24 months"; null otherwise. */
export function parseReviewMonths(cell: string): number | null | "none" {
  const n = normalise(cell);
  if (!n) return null;
  if (/^(none|no|n a|na|as needed|as required|on change|when changed|0)$/.test(n)) return "none";
  let months: number | null = null;
  if (/^(annual|annually|yearly|every year|1 year|one year|12 months?|12)$/.test(n)) months = 12;
  else if (/^(biennial|biennially|every (2|two) years|(2|two) years|24 months?|24)$/.test(n))
    months = 24;
  else if (/^(triennial|triennially|every (3|three) years|(3|three) years|36 months?|36)$/.test(n))
    months = 36;
  else {
    const m = /^(?:every )?(\d+)(?: months?)?$/.exec(n);
    if (m) months = Number(m[1]);
  }
  return months !== null && (DOC_REVIEW_MONTHS as readonly number[]).includes(months)
    ? months
    : null;
}

// ---- columns ----

// Tried in this order, each taking the first free column whose header matches, so "Revision date"
// is the approval date and not the revision, "Approved by" is not the approval date, "Revision in
// draft" and "Open gaps" (this register's export) are never imported, and "Review due" is not the
// review interval.
const HEADER_HINTS: [DocColumnKind | IgnoredKind, RegExp][] = [
  ["draftRevision", /\brevision in draft\b|\bdraft rev(ision)?\b|\bpending rev(ision)?\b/],
  ["openGaps", /\bopen gaps?\b|\bgaps?\b/],
  ["approvedBy", /\bapproved by\b|\bapprover\b|\bauthori[sz]ed by\b|\breleased by\b/],
  ["effectiveOn", /\beffective( on| date|$)/],
  ["reviewDue", /\b(next review|review due|due for review|review by)\b/],
  [
    "lastReviewedOn",
    /\blast review(ed)?\b|\breviewed( on| date)?$|\bdate (last )?reviewed\b|\breview date\b/,
  ],
  [
    "withdrawnOn",
    /\b(withdrawn|obsolete(d)?|superseded|retired)( on| date)\b|\bdate (withdrawn|obsoleted)\b/,
  ],
  [
    "approvedOn",
    /\bapprov(al|ed)( on| date)?\b|\bdate approved\b|\brelease(d)?( on| date)?\b|\bdate released\b|\bissue date\b|\bdate issued\b|\brev(ision)? date\b|\bdate of (approval|release|revision)\b|^date$/,
  ],
  [
    "reviewMonths",
    /\breview (every|interval|frequency|period|cycle)\b|\breview(ed)? every\b|\bfrequency\b/,
  ],
  [
    "docNumber",
    /^(doc(ument)?|form|procedure|drawing)? ?(number|no|num|id|ref|reference|control number|control no)$|^doc$|^document$|^number$/,
  ],
  ["title", /^(document |doc )?(title|name|description)$|^title of (the )?document$/],
  [
    "revision",
    /^(current |latest )?rev(ision)?( level| in force| no| number| letter)?$|^version$|^ver$|^issue( no| number)?$/,
  ],
  ["kind", /^(document |doc )?(type|kind|category|class)$/],
  ["origin", /\borigin\b|\binternal (or )?external\b|^source$/],
  [
    "issuer",
    /\bissued by\b|\bissuer\b|\bissuing (body|organi[sz]ation)\b|^customer$|\bpublisher\b|\bsource organi[sz]ation\b/,
  ],
  ["status", /^(document |doc )?status$/],
  ["owner", /\bowner\b|\bresponsible( person)?\b|\bcustodian\b|\bauthor\b/],
  ["location", /\blocation\b|\bstored\b|\bkept\b|\bpath\b|\blink\b|\bwhere\b|\bfile( name)?$/],
  ["notes", /\b(notes?|comments?|remarks?)\b/],
];

const LABEL: Record<DocColumnKind, string> = {
  docNumber: "document number",
  title: "title",
  kind: "type",
  origin: "origin",
  issuer: "issued by",
  revision: "revision",
  status: "status",
  approvedBy: "approved by",
  approvedOn: "approved on",
  effectiveOn: "effective on",
  lastReviewedOn: "last reviewed",
  reviewDue: "review due",
  withdrawnOn: "withdrawn on",
  owner: "owner",
  location: "location",
  reviewMonths: "review every",
  notes: "notes",
};

export const DOC_COLUMN_KINDS = Object.keys(LABEL) as DocColumnKind[];

const NUMBER_RE = HEADER_HINTS.find(([k]) => k === "docNumber")?.[1] as RegExp;
const TITLE_RE = HEADER_HINTS.find(([k]) => k === "title")?.[1] as RegExp;

/** Index of the header row: the first of the top 20 with both a number and a title header. */
function findHeader(table: string[][]): number {
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const cells = (table[r] ?? []).map(normalise);
    if (cells.some((v) => NUMBER_RE.test(v)) && cells.some((v) => TITLE_RE.test(v))) return r;
  }
  return -1;
}

const DATE_KINDS = [
  "approvedOn",
  "effectiveOn",
  "lastReviewedOn",
  "reviewDue",
  "withdrawnOn",
] as const;

const CLEAN = /^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$/u;

/**
 * Read a master list. `today` (YYYY-MM-DD) refuses past-tense dates in the future (approval, effective,
 * reviewed, withdrawn); a review due date may be in the future. `dateOrder` is the person's choice for
 * numeric dates, else it is detected.
 */
export function planDocumentImport(
  csv: string,
  today: string,
  dateOrder?: DateOrder,
): DocImportPlan {
  const columns = Object.fromEntries(DOC_COLUMN_KINDS.map((k) => [k, null])) as Record<
    DocColumnKind,
    string | null
  >;
  const issues: DocImportIssue[] = [];
  const plan: DocImportPlan = { columns, dates: readDateOrder([], dateOrder), rows: [], issues };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the master list as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the master list as CSV.`,
    });
    return plan;
  }
  const headerRow = findHeader(table);
  if (headerRow < 0) {
    issues.push({
      line: null,
      message:
        'No header row with a document number and a title was found. Name the columns "Document number" (or "Doc No") and "Title", and import again.',
    });
    return plan;
  }
  const header = table[headerRow] ?? [];
  const col: Record<string, number> = {};
  const taken = new Set<number>();
  for (const [kind, re] of HEADER_HINTS) {
    col[kind] = -1;
    for (let c = 0; c < header.length; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header[c] ?? "");
      if (h && re.test(h)) {
        taken.add(c);
        col[kind] = c;
        if (kind in LABEL) columns[kind as DocColumnKind] = (header[c] ?? "").trim();
        break;
      }
    }
  }
  const cellAt = (r: number, kind: DocColumnKind) => {
    const c = col[kind] ?? -1;
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
    const raw = (kind: DocColumnKind) => cellAt(r, kind);
    const used = DOC_COLUMN_KINDS.filter((k) => raw(k) === UNCALCULATED);
    if (used.length) {
      issues.push({
        line,
        message: `The ${used.map((k) => LABEL[k]).join(" and ")} cell is a formula saved without its result; open the file in Excel, save it, and import again. The row is left out.`,
      });
      continue;
    }
    const docNumber = raw("docNumber").replace(/\s+/g, " ");
    const title = raw("title").replace(/\s+/g, " ");
    if (!docNumber || !title) {
      const other = (table[r] ?? []).some(
        (v, c) => c !== col.docNumber && c !== col.title && v.trim(),
      );
      if (other || docNumber || title)
        issues.push({
          line,
          message: `The row has no ${docNumber ? "title" : "document number"}, so it is left out.`,
        });
      continue;
    }
    const key = docNumberKey(docNumber);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `${docNumber}: same document number as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    seen.set(key, line);
    const note = (message: string) => issues.push({ line, message: `${docNumber}: ${message}` });
    if (docNumber.length > DOC_NUMBER_MAX || !CLEAN.test(docNumber)) {
      note(
        `a document number is up to ${DOC_NUMBER_MAX} printable characters; the row is left out.`,
      );
      continue;
    }
    const clip = (kind: DocColumnKind, max: number) => {
      const v = kind === "title" ? title : raw(kind);
      if (v.length <= max) return v;
      note(`the ${LABEL[kind]} is over ${max} characters; the first ${max} are imported.`);
      return v.slice(0, max).trimEnd();
    };

    // Type: the cell, else the title's words, else Other.
    let kind: DocKind = "other";
    let kindSource: DocImportRow["kindSource"] = "default";
    const kindCell = raw("kind");
    const fromCell = kindCell ? parseDocKind(kindCell) : null;
    if (fromCell) {
      kind = fromCell;
      kindSource = "file";
    } else {
      if (kindCell) note(`"${kindCell.slice(0, 40)}" is not a document type this import reads.`);
      const fromTitle = kindFromTitle(title);
      if (fromTitle) {
        kind = fromTitle;
        kindSource = "title";
      }
    }

    const issuer = clip("issuer", DOC_ISSUER_MAX);
    const originCell = raw("origin");
    let origin: DocOrigin = issuer ? "external" : "internal";
    if (originCell) {
      const o = parseDocOrigin(originCell);
      if (o) origin = o;
      else
        note(
          `"${originCell.slice(0, 40)}" does not say internal or external; read as ${origin === "external" ? "external, since it names who issued it" : "internal"}.`,
        );
    }

    let revision = raw("revision");
    if (revision && (revision.length > DOC_REVISION_MAX || !CLEAN.test(revision))) {
      note(
        `"${revision.slice(0, 20)}" is not a revision (up to ${DOC_REVISION_MAX} printable characters); it is left blank.`,
      );
      revision = "";
    }

    const dates: Record<(typeof DATE_KINDS)[number], string | null> = {
      approvedOn: null,
      effectiveOn: null,
      lastReviewedOn: null,
      reviewDue: null,
      withdrawnOn: null,
    };
    for (const k of DATE_KINDS) {
      const v = raw(k);
      if (!v || /^(n ?a|none|-+)$/i.test(v)) continue;
      const d = parsePoamDate(v, order);
      if (!d)
        note(
          `"${v.slice(0, 30)}" in ${LABEL[k]} is not a date this import reads; it is left blank.`,
        );
      else if (k !== "reviewDue" && d > today)
        note(`${LABEL[k]} ${d} is in the future; it is left blank.`);
      else dates[k] = d;
    }
    if (dates.effectiveOn && dates.approvedOn && dates.effectiveOn < dates.approvedOn) {
      note(
        `effective on ${dates.effectiveOn} is before approved on ${dates.approvedOn}; a revision takes effect once approved, so the effective date is left blank.`,
      );
      dates.effectiveOn = null;
    }
    if (dates.lastReviewedOn && dates.approvedOn && dates.lastReviewedOn < dates.approvedOn) {
      // A review before the revision in force was approved reviewed an older revision.
      dates.lastReviewedOn = null;
    }

    // Status: what the cell says, then whether the row has what a release needs.
    const statusCell = raw("status");
    let said = statusCell ? parseDocStatus(statusCell) : null;
    // This register's export writes Status "Draft" with the revision in force and its approval for a
    // released document whose next revision is being drafted: the release is what is imported.
    const draftRev =
      col.draftRevision !== undefined && col.draftRevision >= 0
        ? unguard((table[r]?.[col.draftRevision] ?? "").trim())
        : "";
    if (said === "draft" && draftRev && revision && dates.approvedOn) {
      note(
        `revision ${draftRev} in draft is not imported; start it again with "Start rev" on the document.`,
      );
      said = "released";
    }
    if (statusCell && !said)
      note(
        `"${statusCell.slice(0, 40)}" is not a status this import reads (Released, Draft, Obsolete).`,
      );
    if (!said && dates.withdrawnOn) said = "obsolete";
    let status: DocStatus;
    if (said === "draft") status = "draft";
    else if (said === "obsolete") {
      if (revision) status = "obsolete";
      else {
        note(
          "marked obsolete with no revision; it comes in as a draft (delete it if it is not used).",
        );
        status = "draft";
      }
    } else if (revision && dates.approvedOn) status = "released";
    else {
      status = "draft";
      if (said === "released" || revision)
        note(
          `${revision ? `revision ${revision}` : "no revision"}${dates.approvedOn ? "" : " and no approval date"}, so it comes in as a draft; release it with its approval date.`,
        );
    }
    if (status !== "released") dates.effectiveOn = status === "obsolete" ? dates.effectiveOn : null;
    if (status === "draft") {
      dates.approvedOn = null;
      dates.lastReviewedOn = null;
      dates.withdrawnOn = null;
    }
    if (status === "obsolete") dates.reviewDue = null;

    const monthsCell = raw("reviewMonths");
    let reviewMonths: number | null = null;
    if (monthsCell) {
      const m = parseReviewMonths(monthsCell);
      if (m === null)
        note(
          `"${monthsCell.slice(0, 30)}" is not a review interval this register keeps (12, 24 or 36 months); set it on the document.`,
        );
      else if (m !== "none") reviewMonths = m;
    }
    if (status !== "released") dates.reviewDue = null;

    const fields = {
      docNumber,
      title: clip("title", DOC_TITLE_MAX),
      kind,
      origin,
      revision,
      issuer,
      location: clip("location", DOC_LOCATION_MAX),
      reviewMonths,
    };
    const errors = validateDocumentFields(fields);
    if (errors.length) {
      note(`${errors.join(" ")} The row is left out.`);
      continue;
    }
    plan.rows.push({
      line,
      ...fields,
      kindSource,
      status,
      approvedOn: dates.approvedOn,
      effectiveOn: dates.effectiveOn,
      lastReviewedOn: dates.lastReviewedOn,
      reviewDue: dates.reviewDue,
      withdrawnOn: dates.withdrawnOn,
      approvedByName: status === "draft" ? "" : clip("approvedBy", DOC_PERSON_MAX),
      ownerName: clip("owner", DOC_PERSON_MAX),
      notes: clip("notes", DOC_NOTES_MAX),
    });
  }
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "No document rows were found under the header." });
  return plan;
}

/** How many rows of a sheet would import; the browser picks the sheet with the most. */
export function documentRowsIn(csv: string, today: string): number {
  return planDocumentImport(csv, today).rows.length;
}

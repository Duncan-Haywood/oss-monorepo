// Submittal register import (docs/SUBMITTALS.md, "Importing a register"): the list of submittals a
// job needs, read from the GC's register (a spreadsheet or CSV export, or a printed PDF of it) or
// from the specification sections themselves (each section's "SUBMITTALS" article), into rows the
// user checks before they are added to the job's log. Pure: the SPA reads the file in the browser
// and only the rows the user keeps go to the server.
//
// What is read: a spec section, what is to be submitted, its type, the GC's number, and, when the
// register has them, the required-back date, the needed-on-site date, the lead time and the review
// days. What is never guessed: a date or a number of days not printed in the file. Sent and
// returned dates and the GC's action are left for the user (a register lists what is due, the log
// records what happened).

import { normalizeHeader } from "./payroll-report";
import { readDate } from "./sov-import/schedule";
import type { Grid } from "./sov-import/xlsx";
import { readSpecSubmittals } from "./spec-submittals";
import {
  MAX_SUBMITTAL_DAYS,
  MAX_SUBMITTALS_PER_JOB,
  SUBMITTAL_TYPE_LABELS,
  type SubmittalType,
} from "./submittals";

export interface ImportedSubmittal {
  specSection: string | null;
  title: string;
  type: SubmittalType;
  /** Where the type came from: a type column, words in the title, or nothing matched ("other"). */
  typeFrom: "column" | "title" | "none";
  gcReference: string | null;
  requiredBy: string | null;
  neededOnSite: string | null;
  leadTimeDays: number | null;
  reviewDays: number | null;
  notes: string | null;
  /** Where it was read: "row 7", "page 3". */
  source: string;
}

export interface RegisterSkip {
  source: string;
  reason: string;
}

export interface RegisterImportOk {
  ok: true;
  /** "register" (a table with a header) or "spec" (SUBMITTALS articles in spec sections). */
  kind: "register" | "spec";
  items: ImportedSubmittal[];
  skipped: RegisterSkip[];
  /** The register columns matched, by field, as the header text read (register imports only). */
  columns: Partial<Record<RegisterField, string>>;
  /** Things the user should know about the read as a whole. */
  notes: string[];
}
export interface RegisterImportFail {
  ok: false;
  error: string;
}
export type RegisterImportResult = RegisterImportOk | RegisterImportFail;

export const REGISTER_FIELDS = [
  "specSection",
  "title",
  "type",
  "gcReference",
  "requiredBy",
  "neededOnSite",
  "leadTimeDays",
  "reviewDays",
] as const;
export type RegisterField = (typeof REGISTER_FIELDS)[number];

/** Header names per field, after `normalizeHeader` (lower case, punctuation to spaces). */
const HEADERS: Record<RegisterField, readonly string[]> = {
  specSection: [
    "spec section",
    "spec section number",
    "spec section no",
    "spec",
    "spec no",
    "spec number",
    "specification",
    "specification section",
    "section",
    "section no",
    "section number",
    "csi",
    "csi section",
    "csi code",
  ],
  title: [
    "title",
    "submittal title",
    "description",
    "submittal description",
    "item",
    "item description",
    "submittal",
    "submittal item",
    "name",
    "subject",
  ],
  type: ["type", "submittal type", "category", "kind", "submittal category"],
  gcReference: [
    "number",
    "no",
    "submittal number",
    "submittal no",
    "submittal",
    "id",
    "ref",
    "reference",
    "item no",
    "item number",
  ],
  requiredBy: [
    "due date",
    "response due",
    "response due date",
    "required back",
    "required back by",
    "return by",
    "return date required",
    "review due",
    "review due date",
  ],
  neededOnSite: [
    "required on site date",
    "required on site",
    "required onsite date",
    "required onsite",
    "needed on site",
    "need on site",
    "on site date",
    "onsite date",
    "need by",
    "needed by",
    "required delivery",
    "delivery date",
  ],
  leadTimeDays: [
    "lead time",
    "lead time days",
    "lead time d",
    "lead days",
    "fabrication lead time",
    "lead time calendar days",
  ],
  reviewDays: [
    "review time",
    "review days",
    "review period",
    "review period days",
    "design team review time",
    "design team review time days",
    "review time days",
    "review duration",
  ],
};

/** Fields matched in this order, so "submittal" is a title before it is a number. */
const MATCH_ORDER: RegisterField[] = [
  "specSection",
  "neededOnSite",
  "requiredBy",
  "leadTimeDays",
  "reviewDays",
  "type",
  "title",
  "gcReference",
];

/** Rows searched for the header (registers print a title block above it). */
const HEADER_SEARCH_ROWS = 30;

export type RegisterColumns = Record<RegisterField, number | null>;

/** The register's columns from a header row, or null when it has no title column. */
export function registerColumns(header: readonly string[]): RegisterColumns | null {
  const norm = header.map((h) => normalizeHeader(h ?? ""));
  const out = Object.fromEntries(REGISTER_FIELDS.map((f) => [f, null])) as RegisterColumns;
  const taken = new Set<number>();
  for (const f of MATCH_ORDER) {
    const names = HEADERS[f];
    // An exact name first, in the order listed; then a header that starts with one ("Lead Time (wks)").
    let at = -1;
    for (const n of names) {
      at = norm.findIndex((h, i) => !taken.has(i) && h === n);
      if (at >= 0) break;
    }
    if (at < 0 && f !== "gcReference" && f !== "title") {
      for (const n of names) {
        at = norm.findIndex((h, i) => !taken.has(i) && h.startsWith(`${n} `));
        if (at >= 0) break;
      }
    }
    if (at >= 0) {
      out[f] = at;
      taken.add(at);
    }
  }
  return out.title === null ? null : out;
}

/**
 * A spec section number as MasterFormat prints it: "033000" and "03-30-00" become "03 30 00", a
 * level-4 suffix is kept ("23 31 13.13"), and the 1995 five-digit form ("03300") is kept as typed.
 * Anything else is kept trimmed (a GC's own scheme), up to 40 characters.
 */
export function normalizeSpecSection(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Spaces inside the number are dropped first: a PDF can draw a kerned "11" as "1 1".
  const m = /^(\d{2})\.?(\d{2})\.?(\d{2})(\.\d{2})?$/.exec(t.replace(/[\s-]/g, ""));
  if (m) return `${m[1]} ${m[2]} ${m[3]}${m[4] ?? ""}`;
  return t.slice(0, 40);
}

/** Words that name a submittal type, most specific first. */
const TYPE_WORDS: [RegExp, SubmittalType][] = [
  [
    /\bshop\s*drawings?\b|\bshops\b|\bcoordination drawings?\b|\blayout drawings?\b/i,
    "shop_drawings",
  ],
  [/\bmock[\s-]?ups?\b/i, "mock_up"],
  [
    /\bo\s*&\s*m\b|\bo\s*and\s*m\b|\boperation(s|al)?\s+(and|&)\s+maintenance\b|\bmaintenance (data|manuals?)\b/i,
    "o_and_m",
  ],
  [/\bwarrant(y|ies)\b|\bguarantees?\b/i, "warranty"],
  [
    /\btest(ing)? (reports?|results?|data)\b|\breports? of tests?\b|\bfield (quality[- ]control|test) reports?\b|\bsource quality[- ]control reports?\b/i,
    "test_report",
  ],
  [/\bcertific(ate|ates|ation|ations)\b|\bcerts?\b/i, "certificate"],
  [/\bsamples?\b/i, "samples"],
  [
    /\bproduct (data|information|literature)\b|\bdata sheets?\b|\bcut ?sheets?\b|\bmanufacturer'?s? (data|literature)\b|\bsubmittal data\b/i,
    "product_data",
  ],
];

/** The type a text names ("Shop Drawings", "PD", "Samples for Verification"), or null. */
export function typeFromText(raw: string): SubmittalType | null {
  const t = raw.trim();
  if (!t) return null;
  // Short codes some registers use.
  const code = t.toUpperCase().replace(/[^A-Z&]/g, "");
  const codes: Record<string, SubmittalType> = {
    SD: "shop_drawings",
    PD: "product_data",
    SA: "samples",
    MU: "mock_up",
    TR: "test_report",
    CE: "certificate",
    OM: "o_and_m",
    "O&M": "o_and_m",
    WA: "warranty",
  };
  if (t.length <= 4 && codes[code]) return codes[code];
  for (const [re, type] of TYPE_WORDS) if (re.test(t)) return type;
  // The app's own labels, as the log's CSV writes them.
  for (const [type, label] of Object.entries(SUBMITTAL_TYPE_LABELS))
    if (label.toLowerCase() === t.toLowerCase()) return type as SubmittalType;
  return null;
}

/**
 * Whole calendar days from a cell: "14", "14 days", "14d", "3 weeks", "3 wks", "2 wk". Weeks are
 * seven days (a unit, not an assumption); "business days" and "working days" are refused (null),
 * since turning them into calendar days needs a calendar the file does not give.
 */
export function readDays(raw: string): number | null | "business" {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (/\b(business|working|work)\s*days?\b|\bbd\b|\bwd\b/.test(t)) return "business";
  const m = /^(\d+(?:\.\d+)?)\s*(d|day|days|cd|calendar days?|w|wk|wks|week|weeks)?\.?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith("w") ? 7 : 1);
  if (!Number.isInteger(n) || n < 0 || n > MAX_SUBMITTAL_DAYS) return null;
  return n;
}

const cell = (row: readonly string[], i: number | null) =>
  i === null
    ? ""
    : String(row[i] ?? "")
        .replace(/\s+/g, " ")
        .trim();

/** A row that is a heading inside the table ("DIVISION 09 - FINISHES") rather than a submittal. */
const HEADING = /^(division|div\.?)\s*\d+\b/i;

/**
 * The submittals in a register grid (a sheet, a CSV, or a table read from a PDF). `labels[r]` names
 * where grid row r came from (for a PDF, "page 2, line 14"); rows are "row N" otherwise.
 */
export function readRegister(grid: Grid, labels?: readonly string[]): RegisterImportResult {
  let headerRow = -1;
  let cols: RegisterColumns | null = null;
  for (let r = 0; r < Math.min(grid.length, HEADER_SEARCH_ROWS); r++) {
    const c = registerColumns(grid[r] ?? []);
    // A header names the title and at least one more register column.
    if (c && REGISTER_FIELDS.filter((f) => c[f] !== null).length >= 2) {
      headerRow = r;
      cols = c;
      break;
    }
  }
  if (!cols || headerRow < 0)
    return {
      ok: false,
      error:
        "No register header found: the first rows need a title or description column and a spec section, type or number column.",
    };
  const header = grid[headerRow] ?? [];
  const columns: Partial<Record<RegisterField, string>> = {};
  for (const f of REGISTER_FIELDS) {
    const i = cols[f];
    if (i !== null) columns[f] = cell(header, i);
  }
  const items: ImportedSubmittal[] = [];
  const skipped: RegisterSkip[] = [];
  const notes: string[] = [];
  let businessDays = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const source = labels?.[r] ?? `row ${r + 1}`;
    if (row.every((v) => !String(v ?? "").trim())) continue;
    const title = cell(row, cols.title);
    const spec = cell(row, cols.specSection);
    // A division heading row, in whichever column the table put it.
    const heading = row.map((v) => String(v ?? "").trim()).find((v) => HEADING.test(v));
    if (heading && (!title || title === heading) && !cell(row, cols.type)) {
      skipped.push({ source, reason: `a heading: "${heading.slice(0, 60)}"` });
      continue;
    }
    if (!title) {
      if (spec || cell(row, cols.gcReference))
        skipped.push({ source, reason: "no title or description" });
      continue;
    }
    // A repeated header (a printed register repeats it on every page).
    if (registerColumns(row)?.title === cols.title) continue;
    if (items.length >= MAX_SUBMITTALS_PER_JOB) {
      skipped.push({ source, reason: `over ${MAX_SUBMITTALS_PER_JOB} submittals` });
      continue;
    }
    const typeCell = cell(row, cols.type);
    let type: SubmittalType = "other";
    let typeFrom: ImportedSubmittal["typeFrom"] = "none";
    const fromCol = typeFromText(typeCell);
    if (fromCol) {
      type = fromCol;
      typeFrom = "column";
    } else {
      const fromTitle = typeFromText(title);
      if (fromTitle) {
        type = fromTitle;
        typeFrom = "title";
      }
    }
    const noteParts: string[] = [];
    if (typeCell && !fromCol) noteParts.push(`Type in the register: ${typeCell}`);
    const daysOf = (f: "leadTimeDays" | "reviewDays", label: string) => {
      const raw = cell(row, cols?.[f] ?? null);
      const d = readDays(raw);
      if (d === "business") {
        businessDays += 1;
        noteParts.push(`${label} in the register: ${raw}`);
        return null;
      }
      if (d === null && raw) noteParts.push(`${label} in the register: ${raw}`);
      return d;
    };
    const dateOf = (f: "requiredBy" | "neededOnSite", label: string) => {
      const raw = cell(row, cols?.[f] ?? null);
      const d = raw ? readDate(raw) : null;
      if (raw && !d) noteParts.push(`${label} in the register: ${raw}`);
      return d;
    };
    items.push({
      specSection: normalizeSpecSection(spec),
      title: title.slice(0, 200),
      type,
      typeFrom,
      gcReference: cell(row, cols.gcReference).slice(0, 60) || null,
      requiredBy: dateOf("requiredBy", "Required back"),
      neededOnSite: dateOf("neededOnSite", "Needed on site"),
      leadTimeDays: daysOf("leadTimeDays", "Lead time"),
      reviewDays: daysOf("reviewDays", "Review time"),
      notes: noteParts.length ? noteParts.join("; ").slice(0, 2000) : null,
      source,
    });
  }
  if (!items.length)
    return { ok: false, error: "The register's header was found but no submittals under it." };
  if (businessDays)
    notes.push(
      `${businessDays} lead or review time${businessDays === 1 ? " is" : "s are"} in business days: left blank (kept in the notes), since calendar days need the job's work calendar.`,
    );
  const titled = items.filter((i) => i.typeFrom === "title").length;
  if (titled)
    notes.push(
      `${titled} type${titled === 1 ? " was" : "s were"} read from words in the title; check them.`,
    );
  return { ok: true, kind: "register", items, skipped, columns, notes };
}

// --- Spec sections -------------------------------------------------------------------------------

export interface SpecLine {
  text: string;
  /** "page 3". */
  source: string;
}

const pageOf = (source: string) => {
  const m = /^page (\d+)$/.exec(source);
  return m ? Number(m[1]) : null;
};

/**
 * The submittals the spec sections ask for, read by `readSpecSubmittals` (spec-submittals.ts: the
 * SectionFormat SUBMITTALS articles' lettered paragraphs and UFGS "SD-02 Shop Drawings" lists,
 * running headers and footers dropped, Division 01 left out), as rows for the import preview: titled
 * with the section's title and the item's name, the paragraph kept in the notes. Lines are the
 * spec's text in reading order.
 */
export function readSpecSections(lines: readonly SpecLine[]): RegisterImportResult {
  const r = readSpecSubmittals(lines.map((l) => ({ text: l.text, page: pageOf(l.source) })));
  const where = (page: number | null, specSection: string | null) =>
    page !== null ? `page ${page}` : specSection ? `section ${specSection}` : "the text";
  const items: ImportedSubmittal[] = r.items.map((it) => ({
    specSection: it.specSection,
    title: it.title,
    type: it.type,
    typeFrom: it.type === "other" ? "none" : "title",
    gcReference: null,
    requiredBy: null,
    neededOnSite: null,
    leadTimeDays: null,
    reviewDays: null,
    notes: `${it.specSection ? `Spec ${it.specSection}: ` : ""}${it.text}`.slice(0, 2000),
    source: where(it.page, it.specSection),
  }));
  const skipped: RegisterSkip[] = r.skipped.map((s) => ({
    source: where(s.page, s.specSection),
    reason: `${s.why.startsWith("a procedure") ? "procedure, not a submittal" : s.why}: "${s.text.slice(0, 60)}"`,
  }));
  const trade = r.sections.filter((s) => !r.division01.includes(s.specSection));
  if (!r.sections.length && !items.length)
    return {
      ok: false,
      error:
        'No spec sections found: the text needs "SECTION 09 21 16" style headings. A register (a table) imports from a spreadsheet, CSV or a PDF of the table.',
    };
  if (!items.length)
    return {
      ok: false,
      error: `${r.sections.length} spec section${r.sections.length === 1 ? "" : "s"} found, but no lettered paragraphs under a SUBMITTALS article (or items under an SD heading).`,
    };
  const notes: string[] = [];
  if (r.division01.length)
    notes.push(
      r.division01.length === 1
        ? `Section ${r.division01[0]} sets the submittal procedures, so nothing was listed from it.`
        : `Division 01 (${r.division01.join(", ")}) sets the submittal procedures, so nothing was listed from it.`,
    );
  const without = trade.filter((s) => s.items === 0).length;
  if (without)
    notes.push(
      `${without} section${without === 1 ? " has" : "s have"} no SUBMITTALS article read (check those sections by hand).`,
    );
  // The reader's own notes, less the Division 01 one said above.
  notes.push(...r.notes.filter((n) => !n.startsWith("Division 01")));
  return { ok: true, kind: "spec", items, skipped, columns: {}, notes };
}

/** Lowercased spec section + title, to spot a row already on the log. */
export const submittalKey = (s: { specSection: string | null; title: string }) =>
  `${(s.specSection ?? "").replace(/\s+/g, "")}|${s.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

/** Indexes of imported rows that are already on the job's log (same spec section and title). */
export function alreadyOnLog(
  items: readonly ImportedSubmittal[],
  log: readonly { specSection: string | null; title: string }[],
): Set<number> {
  const keys = new Set(log.map(submittalKey));
  const out = new Set<number>();
  items.forEach((it, i) => {
    if (keys.has(submittalKey(it))) out.add(i);
  });
  return out;
}

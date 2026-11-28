// Suppliers, part 2: an approved-supplier list (a spreadsheet saved as CSV, or the chosen sheet of an
// .xlsx turned into CSV in the browser by controls/sheet-import.ts) read into the supplier register, so
// a shop that keeps its ASL in Excel moves in without retyping it. Pure: the worker matches rows to the
// org's suppliers by name and applies them; the browser shows the same preview. This register's own
// CSV export (suppliersCsv) reads back in unchanged, so a list exported, edited and imported again
// updates only what was edited.
//
// Nothing is guessed. A row needs a supplier name. What the order sends (CUI, FCI only or neither) is
// the flow-down decision every check rests on, so it is read only from a cell that says it; a row
// without one is left out unless the person picked, for the whole file, what such rows send (an ASL
// usually has no such column). A cell this reader cannot read with certainty (a date that is no date,
// "Level 2" with no assessor, an ASL's own "Approved" status) leaves that one field out with a note,
// never a guess, and the register then shows the gap the empty field opens.
//
// An ASL's "Status" column is the shop's approval status (Approved, Conditional, Disqualified), not the
// CMMC status, so only a header that says CMMC (or "certification") is read as the CMMC status.
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv } from "./controls/csv-import";
import {
  type DateOrder,
  type DateOrderRead,
  parsePoamDate,
  readDateOrder,
} from "./controls/poam-import";
import { type InfoFlowed, parseUids, type SupplierLevel, type SupplierStatus } from "./suppliers";
import { UNCALCULATED } from "./xlsx";

export const SUPPLIER_NAME_MAX = 200;
export const SUPPLIER_SUPPLIES_MAX = 500;
export const SUPPLIER_UIDS_MAX = 400;
export const SUPPLIER_REF_MAX = 200;
export const SUPPLIER_NOTES_MAX = 4000;

export type SupplierColumnKind =
  | "name"
  | "supplies"
  | "infoFlowed"
  | "cots"
  | "requiredLevel"
  | "status"
  | "statusDate"
  | "affirmedOn"
  | "cmmcUids"
  | "clauseFlowedDown"
  | "subcontractRef"
  | "checkedOn"
  | "awardedOn"
  | "notes";

/** The fields a row can fill. Absent means the file says nothing (an update leaves it as it is). */
export interface SupplierImportFields {
  supplies?: string;
  infoFlowed?: InfoFlowed;
  cots?: boolean;
  requiredLevel?: SupplierLevel;
  status?: SupplierStatus;
  statusDate?: string;
  affirmedOn?: string;
  cmmcUids?: string;
  clauseFlowedDown?: boolean;
  subcontractRef?: string;
  checkedOn?: string;
  awardedOn?: string;
  notes?: string;
}

export type SupplierImportField = keyof SupplierImportFields;

export interface SupplierImportRow {
  /** 1-based line in the file (the Excel row for a workbook). */
  line: number;
  name: string;
  /** What the order sends, from the row's own cell; null when the row has none. */
  infoFromFile: InfoFlowed | null;
  fields: SupplierImportFields;
}

export interface SupplierImportIssue {
  line: number | null;
  message: string;
}

export interface SupplierImportPlan {
  /** Column header used for each kind, null if not found. */
  columns: Record<SupplierColumnKind, string | null>;
  /** How numeric dates like 03/04/2026 were read (the same rule as the POA&M import). */
  dates: DateOrderRead;
  rows: SupplierImportRow[];
  issues: SupplierImportIssue[];
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same supplier: the same name, ignoring case, spacing and punctuation. */
export const supplierKey = (name: string) => normalise(name);

/** Undo the export's formula guard: a leading ' before = + - @ is the guard, not the value. */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

// ---- cells ----

/** CUI, FCI only or neither, from the words a cell uses (this register's export writes CUI/FCI/NONE). */
export function parseInfoFlowed(cell: string): InfoFlowed | null {
  const n = normalise(cell);
  if (!n) return null;
  const cui = /\b(cui|controlled unclassified)\b/.test(n);
  const fci = /\b(fci|federal contract information)\b/.test(n);
  if (/^(none|neither|no|n a|na|nothing|no fci or cui|no cui or fci)$/.test(n)) return "none";
  if (cui && !/\bno cui\b/.test(n)) return "cui";
  if (fci) return "fci";
  return null;
}

const YES = /^(yes|y|true|x|1|included|in po|flowed|flowed down)$/;
const NO = /^(no|n|false|0|not included)$/;

/** A yes/no cell; null when it is blank or says something else. */
export function parseYesNo(cell: string): boolean | null {
  const raw = cell.trim();
  if (raw === "✓" || raw === "✔") return true;
  const n = normalise(raw);
  if (YES.test(n)) return true;
  if (NO.test(n)) return false;
  return null;
}

interface LevelWords {
  level: 1 | 2 | 3 | null;
  assessor: "self" | "c3pao" | "dibcac" | null;
  final: boolean;
  conditional: boolean;
}

function levelWords(cell: string): LevelWords {
  const n = normalise(cell);
  const m = /\b(?:level|lvl|l)\s?([123])\b/.exec(n) ?? /^cmmc ([123])\b/.exec(n);
  const assessor = /\bdibcac\b/.test(n)
    ? "dibcac"
    : /\b(c3pao|third party|certified)\b/.test(n)
      ? "c3pao"
      : /\b(self|self assessment|self assessed)\b/.test(n)
        ? "self"
        : null;
  return {
    level: m ? (Number(m[1]) as 1 | 2 | 3) : null,
    assessor,
    final: /\bfinal\b/.test(n),
    conditional: /\bconditional\b/.test(n),
  };
}

/** A level flowed down: "CMMC Level 2 (C3PAO)", "L2 Self", "Level 1". Level 2 needs its assessor. */
export function parseSupplierLevel(cell: string): SupplierLevel | null {
  const w = levelWords(cell);
  if (w.level === 1) return w.assessor === null || w.assessor === "self" ? "l1_self" : null;
  if (w.level === 3) return w.assessor === null || w.assessor === "dibcac" ? "l3_dibcac" : null;
  if (w.level === 2) {
    if (w.assessor === "self") return "l2_self";
    if (w.assessor === "c3pao") return "l2_c3pao";
  }
  return null;
}

/**
 * A CMMC status: "Final Level 2 (C3PAO)", "Conditional L2 Self". Final or Conditional must be said,
 * except for Level 1, which is only ever Final (Self). Level 2 needs its assessor.
 */
export function parseSupplierStatus(cell: string): SupplierStatus | null {
  const w = levelWords(cell);
  if (w.final === w.conditional && w.level !== 1) return null;
  if (w.level === 1)
    return !w.conditional && (w.assessor === null || w.assessor === "self")
      ? "final_l1_self"
      : null;
  const stage = w.final ? "final" : "conditional";
  if (w.level === 3)
    return w.assessor === null || w.assessor === "dibcac" ? `${stage}_l3_dibcac` : null;
  if (w.level === 2 && (w.assessor === "self" || w.assessor === "c3pao"))
    return `${stage}_l2_${w.assessor}`;
  return null;
}

// ---- columns ----

// Tried in this order, each taking the first free column whose header matches, so "CMMC Status Date"
// is not read as the status, "Level flowed down" not as what the order sends, and "PO date" not as
// the PO number.
const HEADER_HINTS: [SupplierColumnKind, RegExp][] = [
  [
    "statusDate",
    /\b(cmmc )?status date\b|\b(assessment|certification|certificate|cert) date\b|\bdate of (the )?(cmmc )?(status|assessment|certification)\b/,
  ],
  ["affirmedOn", /\baffirm(ation|ed)?\b/],
  ["checkedOn", /\b(checked|verified|verification)( on| date)?\b|\bsprs check\b/],
  ["awardedOn", /\b(award(ed)?|po date|order date)\b/],
  [
    "requiredLevel",
    /\blevel (flowed down|flowdown|required)\b|\b(required|flowed down|flowdown|flow down) (cmmc )?level\b|\blevel required\b/,
  ],
  ["status", /\bcmmc (status|certification|cert)\b|^certification$/],
  ["cmmcUids", /\buids?\b|\bunique identifiers?\b/],
  ["cots", /\bcots\b|\boff the shelf\b/],
  ["clauseFlowedDown", /\bclause\b|\b7021\b/],
  [
    "infoFlowed",
    /\b(information|info|data) (flowed|shared|sent|provided)\b|^(cui|fci|cui fci|fci cui)\b|\bcui or fci\b|\bfci or cui\b/,
  ],
  [
    "name",
    /^(approved )?(supplier|vendor|subcontractor|company)s?( name)?$|^name$|^(supplier|vendor) (company|legal name)$/,
  ],
  [
    "supplies",
    /\b(what they supply|supplies|commodit(y|ies)|products?|services?|scope|process(es)?|capabilit(y|ies)|description)\b/,
  ],
  [
    "subcontractRef",
    /\b(subcontract|purchase order|po|contract)( (number|no|num|ref|reference))?\b|^po$/,
  ],
  ["notes", /\b(notes?|comments?|remarks?)\b/],
];

const LABEL: Record<SupplierColumnKind, string> = {
  name: "supplier name",
  supplies: "what they supply",
  infoFlowed: "information flowed",
  cots: "COTS",
  requiredLevel: "level flowed down",
  status: "CMMC status",
  statusDate: "CMMC Status Date",
  affirmedOn: "latest affirmation",
  cmmcUids: "CMMC UIDs",
  clauseFlowedDown: "clause in the subcontract",
  subcontractRef: "subcontract or PO",
  checkedOn: "checked on",
  awardedOn: "awarded on",
  notes: "notes",
};

const emptyColumns = (): Record<SupplierColumnKind, string | null> => ({
  name: null,
  supplies: null,
  infoFlowed: null,
  cots: null,
  requiredLevel: null,
  status: null,
  statusDate: null,
  affirmedOn: null,
  cmmcUids: null,
  clauseFlowedDown: null,
  subcontractRef: null,
  checkedOn: null,
  awardedOn: null,
  notes: null,
});

const NAME_RE = HEADER_HINTS.find(([k]) => k === "name")?.[1] as RegExp;

/** Index of the header row: the first of the top 20 with a supplier name header. */
function findHeader(table: string[][]): number {
  for (let r = 0; r < Math.min(table.length, 20); r++)
    if ((table[r] ?? []).some((v) => NAME_RE.test(normalise(v)))) return r;
  return -1;
}

const DATE_KINDS = ["statusDate", "affirmedOn", "checkedOn", "awardedOn"] as const;

/**
 * Read a supplier list. `today` (YYYY-MM-DD) refuses dates in the future, as the form does;
 * `dateOrder` is the person's choice for numeric dates, else it is detected.
 */
export function planSupplierImport(
  csv: string,
  today: string,
  dateOrder?: DateOrder,
): SupplierImportPlan {
  const columns = emptyColumns();
  const issues: SupplierImportIssue[] = [];
  const plan: SupplierImportPlan = {
    columns,
    dates: readDateOrder([], dateOrder),
    rows: [],
    issues,
  };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the supplier sheet as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the supplier sheet as CSV.`,
    });
    return plan;
  }
  const headerRow = findHeader(table);
  if (headerRow < 0) {
    issues.push({
      line: null,
      message:
        'No header row with a supplier name was found. Name the column "Supplier" (or "Vendor", "Subcontractor") and import again.',
    });
    return plan;
  }
  const header = table[headerRow] ?? [];
  const col = Object.fromEntries(
    (Object.keys(columns) as SupplierColumnKind[]).map((k) => [k, -1]),
  ) as Record<SupplierColumnKind, number>;
  const taken = new Set<number>();
  for (const [kind, re] of HEADER_HINTS) {
    for (let c = 0; c < header.length; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header[c] ?? "");
      if (h && re.test(h)) {
        taken.add(c);
        col[kind] = c;
        columns[kind] = (header[c] ?? "").trim();
        break;
      }
    }
  }
  const infoHeader = normalise(columns.infoFlowed ?? "");
  // A yes/no column headed "CUI" (or "CUI?"): yes means CUI goes with the order; no says only that
  // CUI does not, not whether FCI does, so it counts as no cell at all.
  const cuiOnlyHeader = /\bcui\b/.test(infoHeader) && !/\bfci\b/.test(infoHeader);

  const cellAt = (r: number, kind: SupplierColumnKind) => {
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
    const raw = (kind: SupplierColumnKind) => cellAt(r, kind);
    const used = (Object.keys(col) as SupplierColumnKind[]).filter((k) => raw(k) === UNCALCULATED);
    if (used.length) {
      issues.push({
        line,
        message: `The ${used.map((k) => LABEL[k]).join(" and ")} cell is a formula saved without its result; open the file in Excel, save it, and import again. The row is left out.`,
      });
      continue;
    }
    const clip = (kind: SupplierColumnKind, max: number) => {
      const v = raw(kind);
      if (v.length <= max) return v;
      issues.push({
        line,
        message: `The ${LABEL[kind]} is over ${max} characters; the first ${max} are imported.`,
      });
      return v.slice(0, max);
    };
    const name = clip("name", SUPPLIER_NAME_MAX).replace(/\s+/g, " ");
    if (!name) {
      if ((table[r] ?? []).some((v, c) => c !== col.name && v.trim()))
        issues.push({ line, message: "The row has no supplier name, so it is left out." });
      continue;
    }
    const key = supplierKey(name);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `${name}: same supplier name as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    seen.set(key, line);
    const fields: SupplierImportFields = {};
    const note = (message: string) => issues.push({ line, message: `${name}: ${message}` });

    const infoCell = raw("infoFlowed");
    let infoFromFile: InfoFlowed | null = null;
    if (infoCell) {
      const yn = cuiOnlyHeader ? parseYesNo(infoCell) : null;
      infoFromFile = yn === true ? "cui" : yn === false ? null : parseInfoFlowed(infoCell);
      if (!infoFromFile && yn === null)
        note(
          `"${infoCell.slice(0, 40)}" does not say CUI, FCI only or neither, so what the order sends is read as not stated.`,
        );
    }
    if (infoFromFile) fields.infoFlowed = infoFromFile;

    for (const k of ["cots", "clauseFlowedDown"] as const) {
      const v = raw(k);
      if (!v) continue;
      const b = parseYesNo(v);
      if (b === null)
        note(`"${v.slice(0, 30)}" in ${LABEL[k]} is not yes or no; it is left blank.`);
      else fields[k] = b;
    }
    const levelCell = raw("requiredLevel");
    if (levelCell) {
      const lvl = parseSupplierLevel(levelCell);
      if (lvl) fields.requiredLevel = lvl;
      else
        note(
          `"${levelCell.slice(0, 40)}" is not a level this import reads (Level 1, Level 2 (Self), Level 2 (C3PAO), Level 3); the level flowed down is left blank.`,
        );
    }
    const statusCell = raw("status");
    if (statusCell) {
      const st = parseSupplierStatus(statusCell);
      if (st) fields.status = st;
      else
        note(
          `"${statusCell.slice(0, 40)}" is not one of the seven CMMC statuses (say Final or Conditional, the level and, for Level 2, Self or C3PAO); the status is left blank.`,
        );
    }
    for (const k of DATE_KINDS) {
      const v = raw(k);
      if (!v) continue;
      const d = parsePoamDate(v, order);
      if (!d)
        note(
          `"${v.slice(0, 30)}" in ${LABEL[k]} is not a date this import reads; it is left blank.`,
        );
      else if (d > today) note(`${LABEL[k]} ${d} is in the future; it is left blank.`);
      else fields[k] = d;
    }
    const uids = raw("cmmcUids");
    if (uids) {
      const list = parseUids(uids);
      const bad = list.filter((u) => !/^[A-Za-z0-9]{10}$/.test(u));
      if (bad.length || uids.length > SUPPLIER_UIDS_MAX)
        note(
          `"${(bad[0] ?? uids).slice(0, 20)}" is not a CMMC UID (10 letters and digits); the UIDs are left blank.`,
        );
      else fields.cmmcUids = list.join(" ");
    }
    const supplies = clip("supplies", SUPPLIER_SUPPLIES_MAX);
    if (supplies) fields.supplies = supplies;
    const ref = clip("subcontractRef", SUPPLIER_REF_MAX);
    if (ref) fields.subcontractRef = ref;
    const notes = clip("notes", SUPPLIER_NOTES_MAX);
    if (notes) fields.notes = notes;
    plan.rows.push({ line, name, infoFromFile, fields });
  }
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "No supplier rows were found under the header." });
  return plan;
}

/** How many rows of a sheet would import; the browser picks the sheet with the most. */
export function supplierRowsIn(csv: string, today: string): number {
  return planSupplierImport(csv, today).rows.length;
}

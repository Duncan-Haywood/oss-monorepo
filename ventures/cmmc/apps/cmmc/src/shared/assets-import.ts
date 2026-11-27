// Asset inventory, part 2: an existing asset list (a spreadsheet saved as CSV, or the chosen sheet of
// an .xlsx turned into CSV in the browser by controls/sheet-import.ts) read into Level 2 assets, so a
// shop that keeps its inventory in Excel, or filled in the public CMMC scoping worksheet, moves in
// without retyping it. Pure: the worker matches rows against the org's assets and applies them; the
// browser shows the same preview.
//
// Nothing is guessed. A row needs a name and a scoping category written in its own cell, read from
// the category's name in this app's export (`CUI Assets`), the public worksheet's CSV export
// (`CUI Asset`), or the usual short forms (CUI, SPA, CRMA, OOS). A row without a category the reader
// recognises is listed with its line and left out: the category is the scoping decision, so the
// importer never infers it from a device type. The worksheet's "Not resolved" rows are left out
// with that reason. A specialized asset needs its kind (IoT, IIoT, OT, GFE, restricted information
// system, test equipment) from a "Specialized asset type" column, or from the worksheet's kind
// labels that name exactly one kind; "IoT / IIoT device" names two and is listed, not picked.
import {
  type AssetCategory,
  CATEGORY_INFO,
  SPECIALIZED_LABEL,
  SPECIALIZED_TYPES,
  type SpecializedType,
} from "./assets";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv } from "./controls/csv-import";
import {
  classifyWorksheetAsset,
  isWorksheetFile,
  normaliseWorksheet,
  WORKSHEET_KINDS,
  WORKSHEET_MAX_ASSETS,
  type WorksheetCategory,
} from "./scope-worksheet";
import { UNCALCULATED } from "./xlsx";

export const ASSET_NAME_MAX = 200;
export const ASSET_FIELD_MAX = 200;
export const ASSET_NOTES_MAX = 4000;

export type AssetColumnKind =
  | "name"
  | "category"
  | "specializedType"
  | "assetType"
  | "location"
  | "provider"
  | "owner"
  | "notes"
  | "policy"
  | "separation";

export interface AssetImportRow {
  /** 1-based line in the file (the Excel row for a workbook). */
  line: number;
  name: string;
  category: AssetCategory;
  specializedType: SpecializedType | null;
  assetType?: string;
  location?: string;
  provider?: string;
  owner?: string;
  notes?: string;
}

export interface AssetImportIssue {
  line: number | null;
  message: string;
}

export interface AssetImportPlan {
  /** A spreadsheet (CSV, or an .xlsx sheet as CSV), or the scoping worksheet's saved JSON file. */
  format: "sheet" | "worksheet-json";
  /** Column header (or the JSON field) used for each kind, null if not found. */
  columns: Record<AssetColumnKind, string | null>;
  rows: AssetImportRow[];
  issues: AssetImportIssue[];
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same asset: the same name, ignoring case, spacing and punctuation. */
export const assetKey = (name: string) => normalise(name);

/** Undo the export's formula guard: a leading ' before = + - @ is the guard, not the value. */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

// ---- categories ----

const CATEGORY_WORDS: Record<string, AssetCategory | "unresolved"> = {};
const addCat = (k: AssetCategory | "unresolved", ...names: string[]) => {
  for (const n of names) CATEGORY_WORDS[normalise(n)] = k;
};
for (const info of Object.values(CATEGORY_INFO))
  addCat(info.key, info.label, info.label.slice(0, -1));
addCat("cui", "CUI", "CUI asset");
addCat("security_protection", "SPA", "Security protection", "Security protection assets");
addCat(
  "contractor_risk_managed",
  "CRMA",
  "Contractor risk managed",
  "Contractor-risk-managed asset",
);
addCat("specialized", "Specialized", "Specialised", "Specialised asset", "Specialised assets");
addCat("out_of_scope", "OOS", "Out of scope", "Out-of-scope", "Not in scope");
addCat("unresolved", "Not resolved", "Unresolved");

/** The Level 2 category a cell names, "unresolved" for the worksheet's open rows, else null. */
export function parseAssetCategory(cell: string): AssetCategory | "unresolved" | null {
  return CATEGORY_WORDS[normalise(cell)] ?? null;
}

// ---- specialized kinds ----

const KIND_WORDS: Record<string, SpecializedType> = {};
const addKind = (k: SpecializedType, ...names: string[]) => {
  for (const n of names) KIND_WORDS[normalise(n)] = k;
};
for (const k of SPECIALIZED_TYPES) addKind(k, k, SPECIALIZED_LABEL[k]);
addKind("iot", "IoT", "Internet of Things", "IoT device");
addKind("iiot", "IIoT", "Industrial Internet of Things", "IIoT device", "Industrial IoT");
addKind("ot", "OT", "Operational Technology", "CNC machine controller or DNC system");
addKind("gfe", "GFE", "Government furnished equipment");
addKind("restricted_information_system", "Restricted information system", "RIS");
addKind("test_equipment", "Test equipment", "CMM or other inspection / test equipment");

/** The specialized-asset kind a cell names (one kind exactly), else null. */
export function parseSpecializedType(cell: string): SpecializedType | null {
  return KIND_WORDS[normalise(cell)] ?? null;
}

// ---- columns ----

// Tried in this order, each taking the first free column whose header matches, so "Specialized asset
// type" is not read as the asset's type and "Asset name" not as a category.
const HEADER_HINTS: [AssetColumnKind, RegExp][] = [
  ["specializedType", /\bspeciali[sz]ed\b/],
  ["category", /\b(category|classification|scope category|asset class)\b/],
  [
    "name",
    /^(asset|assets|asset name|name|hostname|host name|device|device name|system|system name|item)$/,
  ],
  ["policy", /\bpolicy\b/],
  ["separation", /\b(separation|justification)\b/],
  ["provider", /\b(provider|provided by|vendor|supplier|managed by|msp)\b/],
  ["owner", /\b(owner|custodian|responsible|assigned to|user)\b/],
  ["location", /\b(location|site|room|building)\b/],
  ["notes", /\b(notes?|comments?|remarks?)\b/],
  ["assetType", /\b(type|kind|asset type|device type)\b/],
];

const LABEL: Record<AssetColumnKind, string> = {
  name: "name",
  category: "category",
  specializedType: "specialized asset type",
  assetType: "type",
  location: "location",
  provider: "provided by",
  owner: "owner",
  notes: "notes",
  policy: "policy",
  separation: "separation",
};

const emptyColumns = (): Record<AssetColumnKind, string | null> => ({
  name: null,
  category: null,
  specializedType: null,
  assetType: null,
  location: null,
  provider: null,
  owner: null,
  notes: null,
  policy: null,
  separation: null,
});

/** Index of the header row: the first of the top 20 with both a name and a category header. */
function findHeader(table: string[][]): number {
  const name = HEADER_HINTS.find(([k]) => k === "name")?.[1] as RegExp;
  const cat = HEADER_HINTS.find(([k]) => k === "category")?.[1] as RegExp;
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const cells = (table[r] ?? []).map((v) => normalise(v));
    if (cells.some((h) => name.test(h)) && cells.some((h) => cat.test(h))) return r;
  }
  return -1;
}

export function planAssetImport(csv: string): AssetImportPlan {
  const columns = emptyColumns();
  const issues: AssetImportIssue[] = [];
  const plan: AssetImportPlan = { format: "sheet", columns, rows: [], issues };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the asset sheet as CSV.",
    });
    return plan;
  }
  if (/^\uFEFF?\s*\{/.test(csv)) return planWorksheetJson(csv);
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the asset sheet as CSV.`,
    });
    return plan;
  }
  const headerRow = findHeader(table);
  if (headerRow < 0) {
    issues.push({
      line: null,
      message:
        'No header row with an asset name and a category was found. Name the columns "Asset" and "Category" (one of CUI, Security Protection, Contractor Risk Managed, Specialized, Out-of-Scope) and import again.',
    });
    return plan;
  }
  const header = table[headerRow] ?? [];
  const col = Object.fromEntries(
    (Object.keys(columns) as AssetColumnKind[]).map((k) => [k, -1]),
  ) as Record<AssetColumnKind, number>;
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

  const seen = new Map<string, number>();
  for (let r = headerRow + 1; r < table.length; r++) {
    const line = r + 1;
    const raw = (kind: AssetColumnKind) => {
      const c = col[kind];
      return c < 0 ? "" : unguard((table[r]?.[c] ?? "").replace(/\r\n?/g, "\n").trim());
    };
    if (!(table[r] ?? []).some((v) => v.trim())) continue;
    const used = (Object.keys(col) as AssetColumnKind[]).filter((k) => raw(k) === UNCALCULATED);
    if (used.length) {
      issues.push({
        line,
        message: `The ${used.map((k) => LABEL[k]).join(" and ")} cell is a formula saved without its result; open the file in Excel, save it, and import again. The row is left out.`,
      });
      continue;
    }
    const clip = (kind: AssetColumnKind, max: number) => {
      const v = raw(kind);
      if (v.length <= max) return v;
      issues.push({
        line,
        message: `The ${LABEL[kind]} is over ${max} characters; the first ${max} are imported.`,
      });
      return v.slice(0, max);
    };
    const name = clip("name", ASSET_NAME_MAX).replace(/\s+/g, " ");
    const catCell = raw("category");
    if (!name) {
      if (catCell) issues.push({ line, message: "The row has no asset name, so it is left out." });
      continue;
    }
    const category = parseAssetCategory(catCell);
    if (!category) {
      issues.push({
        line,
        message: catCell
          ? `${name}: "${catCell.slice(0, 60)}" is not a Level 2 category this import reads (CUI, Security Protection, Contractor Risk Managed, Specialized, Out-of-Scope); the row is left out.`
          : `${name} has no category, so it is left out. The category is your scoping decision; this import never guesses it.`,
      });
      continue;
    }
    if (category === "unresolved") {
      issues.push({
        line,
        message: `${name} is "Not resolved" in the worksheet: answer its open questions there (or add it here by hand) once it fits a category. The row is left out.`,
      });
      continue;
    }
    const typeCell = raw("specializedType");
    const kindCell = raw("assetType");
    let specializedType: SpecializedType | null = null;
    if (category === "specialized") {
      specializedType =
        parseSpecializedType(typeCell) ?? (typeCell ? null : parseSpecializedType(kindCell));
      if (!specializedType) {
        const said = typeCell || kindCell;
        issues.push({
          line,
          message: said
            ? `${name}: "${said.slice(0, 60)}" does not name one specialized asset kind (IoT, IIoT, OT, GFE, restricted information system, test equipment); the row is left out.`
            : `${name} is a specialized asset with no kind (IoT, IIoT, OT, GFE, restricted information system, test equipment); add a "Specialized asset type" column. The row is left out.`,
        });
        continue;
      }
    } else if (typeCell) {
      issues.push({
        line,
        message: `${name}: a specialized asset type is only kept for specialized assets, so "${typeCell.slice(0, 40)}" is dropped.`,
      });
    }
    const key = assetKey(name);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `Same asset name as line ${prior}; only line ${prior} is imported.`,
      });
      continue;
    }
    seen.set(key, line);
    const row: AssetImportRow = { line, name, category, specializedType };
    for (const k of ["assetType", "location", "provider", "owner"] as const) {
      const v = clip(k, ASSET_FIELD_MAX);
      if (v) row[k] = v;
    }
    setNotes(row, raw("notes"), raw("policy"), raw("separation"), issues);
    plan.rows.push(row);
  }
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "No asset rows were found under the header." });
  return plan;
}

// The worksheet keeps the CRMA policy and the out-of-scope separation in their own fields; here they
// are what the notes are for (the inventory check asks for exactly that note).
function setNotes(
  row: AssetImportRow,
  notes: string,
  policy: string,
  separation: string,
  issues: AssetImportIssue[],
) {
  const parts = [
    notes.trim(),
    policy.trim() && `Policy: ${policy.trim()}`,
    separation.trim() && `Separation: ${separation.trim()}`,
  ].filter(Boolean);
  if (!parts.length) return;
  const text = parts.join("\n");
  if (text.length > ASSET_NOTES_MAX)
    issues.push({
      line: row.line,
      message: `The notes are over ${ASSET_NOTES_MAX} characters; the first ${ASSET_NOTES_MAX} are imported.`,
    });
  row.notes = text.slice(0, ASSET_NOTES_MAX);
}

const WORKSHEET_CATEGORY: Record<Exclude<WorksheetCategory, "unresolved">, AssetCategory> = {
  cui: "cui",
  spa: "security_protection",
  crma: "contractor_risk_managed",
  specialized: "specialized",
  oos: "out_of_scope",
};

/**
 * The public CMMC scoping worksheet's saved file ("Save as a file (JSON)"). It holds answers, not
 * categories, so each asset is classified the way the worksheet does (src/shared/scope-worksheet.ts)
 * and `line` is the asset's place in the worksheet's list (1 for the first). A file saved at Level 1
 * still carries its CUI answers, which are what the Level 2 categories come from.
 */
export function planWorksheetJson(text: string): AssetImportPlan {
  const issues: AssetImportIssue[] = [];
  const plan: AssetImportPlan = {
    format: "worksheet-json",
    columns: emptyColumns(),
    rows: [],
    issues,
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    issues.push({
      line: null,
      message:
        "This looks like a JSON file but could not be read. Choose the file the CMMC scoping worksheet saved, an .xlsx or a CSV.",
    });
    return plan;
  }
  if (!isWorksheetFile(raw)) {
    issues.push({
      line: null,
      message:
        "This JSON file is not one the CMMC scoping worksheet saved (its format field is missing or different). Choose that file, an .xlsx or a CSV.",
    });
    return plan;
  }
  if ((raw as { version?: unknown }).version !== 1)
    issues.push({
      line: null,
      message:
        "The file is from a newer version of the scoping worksheet than this import knows; its answers are read as version 1. Check the preview before importing.",
    });
  const listed = Array.isArray(raw.assets) ? raw.assets.length : 0;
  if (listed > WORKSHEET_MAX_ASSETS)
    issues.push({
      line: null,
      message: `The file lists ${listed} assets; the worksheet keeps the first ${WORKSHEET_MAX_ASSETS}, and so does this import.`,
    });
  const scope = normaliseWorksheet(raw);
  Object.assign(plan.columns, {
    name: "name",
    category: "the answers, classified as the worksheet does",
    specializedType: "kind",
    assetType: "kind",
    location: "location",
    owner: "owner",
    notes: "notes",
    policy: "policy",
    separation: "separation",
  });
  if (scope.level === "1")
    issues.push({
      line: null,
      message:
        "The worksheet was saved at Level 1. The Level 2 categories here come from its CUI answers; assets with the CUI question unanswered are listed and left out.",
    });
  const seen = new Map<string, number>();
  scope.assets.forEach((a, i) => {
    const line = i + 1;
    const name = a.name.trim().replace(/\s+/g, " ");
    if (!name) {
      issues.push({ line, message: "The asset has no name, so it is left out." });
      return;
    }
    const { cat, gaps } = classifyWorksheetAsset(a);
    if (cat === "unresolved") {
      issues.push({
        line,
        message: `${name} is "Not resolved" in the worksheet (${gaps.join(" ")}) Answer it there and save again, or add it here by hand. The asset is left out.`,
      });
      return;
    }
    const kind = WORKSHEET_KINDS[a.kind] ?? WORKSHEET_KINDS.other;
    let specializedType: SpecializedType | null = null;
    if (cat === "specialized") {
      const k = kind?.specialized;
      if (!k || k === "iot_or_iiot") {
        issues.push({
          line,
          message: `${name} is a Specialized Asset of kind "${kind?.label ?? a.kind}", which names both IoT and IIoT; add it by hand with the one that fits. The asset is left out.`,
        });
        return;
      }
      specializedType = k;
    }
    const key = assetKey(name);
    const prior = seen.get(key);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `Same asset name as asset ${prior}; only asset ${prior} is imported.`,
      });
      return;
    }
    seen.set(key, line);
    const row: AssetImportRow = { line, name, category: WORKSHEET_CATEGORY[cat], specializedType };
    if (kind) row.assetType = kind.label.slice(0, ASSET_FIELD_MAX);
    if (a.location.trim()) row.location = a.location.trim();
    if (a.owner.trim()) row.owner = a.owner.trim();
    setNotes(row, a.notes, a.policy, a.separation, issues);
    plan.rows.push(row);
  });
  if (!plan.rows.length && !issues.length)
    issues.push({ line: null, message: "The worksheet file lists no assets." });
  return plan;
}

/** How many rows of a sheet would import; the browser picks the sheet with the most. */
export function assetRowsIn(csv: string): number {
  return planAssetImport(csv).rows.length;
}

// Rate-card import: the shop's own price list (a CSV, a tab-separated paste from Excel or Google
// Sheets, or an .xlsx read in the browser by ./sheet) into machines, materials or finishing rows.
//
// Two pure steps, the same code in the browser (preview) and the Worker (final check):
// 1. readRateSheet(kind, grid): find the header row, map columns by their names, read each cell.
//    Only columns the sheet has become values; a blank cell sets nothing.
// 2. planRateImport(kind, rows, existing): match each row to an existing rate by name (case and
//    spacing ignored), merge, and validate the merged row with the same schema the editor uses.
//
// No price is ever guessed (docs/ARCHITECTURE.md, "No invented prices"): a cell that is not a clear
// amount, a percentage written as a bare fraction, a unit the card does not use ($/kg, g/cm³) or a
// column whose meaning is ambiguous ("Price" on a material) is an error or an ignored column, named
// with its row and column. Unit conversions are only the exact ones (hours to minutes, weeks to days).
import type { z } from "zod";
import {
  type FinishingOpDto,
  finishingOpInputSchema,
  MAX_RATE_IMPORT_ROWS,
  type MachineDto,
  type MaterialDto,
  machineInputSchema,
  materialInputSchema,
} from "./api";
import { MACHINE_KINDS, type MachineKind, type MaterialPricing } from "./enums";

export type RateImportKind = "machines" | "materials" | "finishing-ops";
export type Grid = string[][];

export interface MachineImportValues {
  name: string;
  kind?: MachineKind;
  hourlyRateCents?: number;
  setupRateCents?: number | null;
  defaultSetupMinutes?: number;
  removalRateIn3PerMin?: number | null;
  cutSpeedInPerMin?: number | null;
  pierceSeconds?: number | null;
  secondsPerBend?: number | null;
  secondsPerHole?: number | null;
  drillFeedInPerMin?: number | null;
  secondsPerTappedHole?: number | null;
  peckDepthDiameters?: number | null;
  secondsPerPeck?: number | null;
  active?: boolean;
}
export interface MaterialImportValues {
  name: string;
  pricingBasis?: MaterialPricing;
  pricePerLbCents?: number | null;
  densityLbPerIn3?: number | null;
  sheetThicknessIn?: number | null;
  stockPriceCents?: number | null;
  stockDescription?: string | null;
  scrapBps?: number;
  minChargeCents?: number;
  active?: boolean;
}
export interface FinishingImportValues {
  name: string;
  perPartCents?: number;
  lotChargeCents?: number;
  outsideService?: boolean;
  leadDays?: number | null;
  active?: boolean;
}
export type ImportValues = MachineImportValues | MaterialImportValues | FinishingImportValues;

export interface ImportRow<V = ImportValues> {
  /** Spreadsheet row number (1 = the first line of the file). */
  row: number;
  values: V;
  warnings: string[];
}
export interface RowProblem {
  row: number;
  message: string;
}
export interface RateSheet<V = ImportValues> {
  kind: RateImportKind;
  /** Row number of the header line, or null when none was found. */
  headerRow: number | null;
  /** Columns used: the sheet's header text and what it was read as. */
  columns: { header: string; field: string; label: string }[];
  /** Columns left out, with why. */
  ignored: { header: string; reason: string }[];
  rows: ImportRow<V>[];
  errors: RowProblem[];
  skipped: RowProblem[];
  /** A problem with the whole sheet (no header, no name column, too many rows). */
  fatal: string | null;
}

// ---------------------------------------------------------------------------------------------
// Columns

type Reader =
  | "text"
  | "money"
  | "percent"
  | "real"
  | "minutes"
  | "minutesFromHours"
  | "days"
  | "daysFromWeeks"
  | "kind"
  | "basis"
  | "bool"
  | "boolInverted";
interface Column {
  field: string;
  label: string;
  read: Reader;
}
interface Rule {
  test: (h: string) => boolean;
  col: Column | { refuse: string };
}

const has = (h: string, ...words: string[]) => words.some((w) => h.includes(w));
const rx = (h: string, re: RegExp) => re.test(h);

/** Lower case, "per" for "/", spaces around symbols collapsed: "Rate ($/HR)" -> "rate ($ per hr)". */
export function normHeader(s: string): string {
  return s
    .replace(/³/g, "3")
    .toLowerCase()
    .replace(/\s*\/\s*/g, " per ")
    .replace(/[_\s]+/g, " ")
    .trim();
}

const MACHINE_RULES: Rule[] = [
  {
    test: (h) => has(h, "setup") && rx(h, /\$|rate|cost|price|per h|per hour|usd/),
    col: { field: "setupRateCents", label: "Setup rate ($/hr)", read: "money" },
  },
  {
    test: (h) => has(h, "setup") && rx(h, /\bmin/),
    col: { field: "defaultSetupMinutes", label: "Setup minutes", read: "minutes" },
  },
  {
    test: (h) => has(h, "setup") && rx(h, /\bh(ou)?rs?\b|\bhours?\b/),
    col: {
      field: "defaultSetupMinutes",
      label: "Setup minutes (from hours)",
      read: "minutesFromHours",
    },
  },
  {
    test: (h) => has(h, "setup"),
    col: { refuse: 'say whether it is a rate ($/hr) or a time ("setup minutes", "setup hours")' },
  },
  {
    test: (h) => rx(h, /removal|\bmrr\b|cubic|in3|in\^3/),
    col: { field: "removalRateIn3PerMin", label: "Removal rate (in³/min)", read: "real" },
  },
  // Peck columns come before the hole, feed and rate rules: "Peck time per hole (s)" is a peck time.
  {
    test: (h) => has(h, "peck") && rx(h, /\bmin|\bh(ou)?rs?\b/),
    col: { refuse: "give the peck time in seconds" },
  },
  {
    test: (h) => has(h, "peck") && rx(h, /\bs\b|\bsec|time/),
    col: { field: "secondsPerPeck", label: "Seconds per peck", read: "real" },
  },
  {
    test: (h) => has(h, "peck") && rx(h, /\bx ?d\b|×d|\bd\b|diam/),
    col: { field: "peckDepthDiameters", label: "Peck depth (×D)", read: "real" },
  },
  {
    test: (h) => has(h, "peck"),
    col: {
      refuse:
        'give the peck depth in drill diameters ("Peck depth (xD)") and the time in seconds ("Seconds per peck")',
    },
  },
  {
    test: (h) => has(h, "drill") && rx(h, /feed|penetration|\bipm\b|in per min|inch(es)? per min/),
    col: { field: "drillFeedInPerMin", label: "Drill feed (in/min)", read: "real" },
  },
  {
    test: (h) =>
      (has(h, "pierce", "bend") || rx(h, /\bholes?\b|\btap(s|ped|ping)?\b/)) &&
      rx(h, /\bmin|\bh(ou)?rs?\b/),
    col: { refuse: "give pierce, bend, hole and tapping times in seconds" },
  },
  {
    test: (h) => rx(h, /\btap(s|ped|ping)?\b/),
    col: { field: "secondsPerTappedHole", label: "Seconds per tapped hole", read: "real" },
  },
  {
    test: (h) => has(h, "pierce"),
    col: { field: "pierceSeconds", label: "Pierce time (s)", read: "real" },
  },
  {
    test: (h) => has(h, "bend"),
    col: { field: "secondsPerBend", label: "Seconds per bend", read: "real" },
  },
  {
    test: (h) => rx(h, /\bholes?\b/),
    col: { field: "secondsPerHole", label: "Seconds per hole", read: "real" },
  },
  {
    test: (h) => rx(h, /cut(ting)? speed|feed ?rate|\bipm\b|in per min|inch(es)? per min/),
    col: { field: "cutSpeedInPerMin", label: "Cut speed (in/min)", read: "real" },
  },
  {
    test: (h) =>
      rx(h, /\brate\b|per h(ou)?r\b|per hour|hourly|\$ per|burden|shop rate|labor|labour/),
    col: { field: "hourlyRateCents", label: "Hourly rate", read: "money" },
  },
  {
    test: (h) => rx(h, /^(type|kind|category|process|machine type|machine kind|equipment type)$/),
    col: { field: "kind", label: "Kind", read: "kind" },
  },
  {
    test: (h) => rx(h, /^(active|in use|status|retired)$/),
    col: { field: "active", label: "Active", read: "bool" },
  },
  {
    test: (h) =>
      rx(
        h,
        /^(machine|machine name|name|equipment|work ?cent(er|re)|resource|description|machine description|asset)$/,
      ),
    col: { field: "name", label: "Name", read: "text" },
  },
];

const MATERIAL_RULES: Rule[] = [
  {
    test: (h) => rx(h, /per (kg|kilo)|\$ ?per ?kg|€/),
    col: { refuse: "the rate card prices material in US$ per lb; convert the column to $/lb" },
  },
  {
    test: (h) => rx(h, /g per cm|g per cc|kg per m|g per ml/),
    col: { refuse: "density on the card is lb/in³; convert the column (g/cm³ × 0.036127)" },
  },
  {
    test: (h) => rx(h, /thick|gauge|\bga\b/) && rx(h, /\b(mm|millimet(er|re)s?)\b|gauge|\bga\b/),
    col: {
      refuse:
        "sheet thickness on the card is in inches; convert the column (mm ÷ 25.4, or the gauge's inches from your supplier's chart)",
    },
  },
  {
    test: (h) => rx(h, /thick/),
    col: { field: "sheetThicknessIn", label: "Sheet thickness (in)", read: "real" },
  },
  {
    test: (h) => rx(h, /density|lb per in/),
    col: { field: "densityLbPerIn3", label: "Density (lb/in³)", read: "real" },
  },
  {
    test: (h) => rx(h, /scrap|waste|\bdrop\b|kerf/),
    col: { field: "scrapBps", label: "Scrap %", read: "percent" },
  },
  {
    test: (h) => rx(h, /\bmin(imum)?\b|\bmin\.? (charge|order)/),
    col: { field: "minChargeCents", label: "Minimum charge", read: "money" },
  },
  {
    test: (h) => rx(h, /per (lb|pound)|\bper lbs?\b|\$ per lb|price lb|cost lb|lb price|\$ ?lb\b/),
    col: { field: "pricePerLbCents", label: "Price per lb", read: "money" },
  },
  {
    test: (h) =>
      rx(
        h,
        /(stock|bar|sheet|plate|piece|tube|length|stick|each|ea)\b.*(price|cost|\$)|(price|cost|\$).*\b(stock|bar|sheet|plate|piece|tube|length|stick|each|ea)\b/,
      ) && !rx(h, /size|desc/),
    col: { field: "stockPriceCents", label: "Stock price (per piece)", read: "money" },
  },
  {
    test: (h) =>
      rx(
        h,
        /^(stock|stock size|stock description|bar size|sheet size|form|shape|size|stock form)$/,
      ),
    col: { field: "stockDescription", label: "Stock description", read: "text" },
  },
  {
    test: (h) => rx(h, /basis|priced by|pricing|sold by|unit$|^uom$|^unit of measure$/),
    col: { field: "pricingBasis", label: "Pricing basis", read: "basis" },
  },
  {
    test: (h) => rx(h, /^(price|cost|\$|amount|rate)$/),
    col: {
      refuse:
        'not clear whether it is per lb or per stock piece: rename it "Price per lb" or "Stock price"',
    },
  },
  {
    test: (h) => rx(h, /^(active|in use|status|retired)$/),
    col: { field: "active", label: "Active", read: "bool" },
  },
  {
    test: (h) =>
      rx(h, /^(material|material name|name|alloy|grade|description|item|material description)$/),
    col: { field: "name", label: "Name", read: "text" },
  },
];

const FINISHING_RULES: Rule[] = [
  {
    test: (h) => rx(h, /\blead\b|turnaround|\bdays\b|\bweeks?\b/) && rx(h, /\bweeks?\b|\bwks?\b/),
    col: { field: "leadDays", label: "Lead days (from weeks)", read: "daysFromWeeks" },
  },
  {
    test: (h) => rx(h, /\blead\b|turnaround|\bdays\b/),
    col: { field: "leadDays", label: "Lead days", read: "days" },
  },
  {
    test: (h) => rx(h, /in.?house/),
    col: {
      field: "outsideService",
      label: "Outside service (from in-house)",
      read: "boolInverted",
    },
  },
  {
    test: (h) => rx(h, /outside|vendor|outsourced?|subcontract|sub-contract|external/),
    col: { field: "outsideService", label: "Outside service", read: "bool" },
  },
  {
    test: (h) => rx(h, /\blot\b|batch|per order|per job|\bmin(imum)?\b|setup|per run/),
    col: { field: "lotChargeCents", label: "Lot charge", read: "money" },
  },
  {
    test: (h) =>
      rx(
        h,
        /per (part|piece|pc|unit|ea|each)|\beach\b|\bea\b|unit (price|cost)|piece price|part price/,
      ),
    col: { field: "perPartCents", label: "Per part", read: "money" },
  },
  {
    test: (h) => rx(h, /^(price|cost|\$|amount|rate)$/),
    col: {
      refuse: 'not clear whether it is per part or per lot: rename it "Per part" or "Lot charge"',
    },
  },
  {
    test: (h) => rx(h, /^(active|in use|status|retired)$/),
    col: { field: "active", label: "Active", read: "bool" },
  },
  {
    test: (h) =>
      rx(
        h,
        /^(finish|finishing|finish name|operation|process|name|service|description|treatment|coating)$/,
      ),
    col: { field: "name", label: "Name", read: "text" },
  },
];

const RULES: Record<RateImportKind, Rule[]> = {
  machines: MACHINE_RULES,
  materials: MATERIAL_RULES,
  "finishing-ops": FINISHING_RULES,
};

/** At least one of these must be a column for a header row to count. */
const PRICE_FIELDS: Record<RateImportKind, string[]> = {
  machines: ["hourlyRateCents", "setupRateCents"],
  materials: ["pricePerLbCents", "stockPriceCents"],
  "finishing-ops": ["perPartCents", "lotChargeCents"],
};

/** Example columns for a blank sheet the shop can fill in (the page offers it as a download). */
export const TEMPLATE_HEADERS: Record<RateImportKind, string[]> = {
  machines: [
    "Machine",
    "Kind",
    "Hourly rate",
    "Setup rate",
    "Setup minutes",
    "Removal rate (in3/min)",
    "Cut speed (in/min)",
    "Pierce seconds",
    "Seconds per bend",
    "Seconds per hole",
    "Drill feed (in/min)",
    "Seconds per tapped hole",
    "Peck depth (xD)",
    "Seconds per peck",
  ],
  materials: [
    "Material",
    "Price per lb",
    "Density (lb/in3)",
    "Sheet thickness (in)",
    "Stock price",
    "Stock description",
    "Scrap %",
    "Minimum charge",
  ],
  "finishing-ops": ["Finish", "Per part", "Lot charge", "Outside service", "Lead days"],
};

interface Mapped {
  /** column index -> column */
  cols: Map<number, Column>;
  ignored: { header: string; reason: string }[];
  hits: number;
}

function mapHeader(kind: RateImportKind, cells: string[]): Mapped {
  const cols = new Map<number, Column>();
  const ignored: { header: string; reason: string }[] = [];
  const taken = new Set<string>();
  cells.forEach((raw, i) => {
    const header = raw.trim();
    if (!header) return;
    const h = normHeader(header);
    const rule = RULES[kind].find((r) => r.test(h));
    if (!rule) {
      ignored.push({ header, reason: "not a column the rate card has" });
      return;
    }
    if ("refuse" in rule.col) {
      ignored.push({ header, reason: rule.col.refuse });
      return;
    }
    if (taken.has(rule.col.field)) {
      ignored.push({
        header,
        reason: `a second "${rule.col.label}" column; the first one is used`,
      });
      return;
    }
    taken.add(rule.col.field);
    cols.set(i, rule.col);
  });
  const fields = new Set([...cols.values()].map((c) => c.field));
  const priced = PRICE_FIELDS[kind].some((f) => fields.has(f));
  return { cols, ignored, hits: fields.has("name") && priced ? fields.size : 0 };
}

// ---------------------------------------------------------------------------------------------
// Cells

type Read<T> = { ok: true; value: T; warning?: string } | { ok: false; error: string };
const ok = <T>(value: T, warning?: string): Read<T> =>
  warning ? { ok: true, value, warning } : { ok: true, value };
const bad = (error: string): Read<never> => ({ ok: false, error });

/**
 * Trimmed cell text, non-breaking spaces as spaces. A leading apostrophe that exportRateCsv put in
 * front of a cell starting with = + - @ (so a spreadsheet shows it as text, not a formula) is removed.
 */
export const clean = (s: string) =>
  s
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^'(?=[=+\-@])/, "");

/** A plain number, commas read by shape: 1,234.50 thousands; 1.234,50 or 29,99 a decimal comma. */
export function readNumber(s: string): number | null {
  let x = clean(s).replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.split(",").join("");
  else if (/^(\d+|\d{1,3}(\.\d{3})+),\d+$/.test(x)) x = x.split(".").join("").replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(x)) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const UNIT_SUFFIX =
  /\s*(\/|per\s+)\s*(hr|hour|h|lb|lbs|pound|part|pc|piece|ea|each|bar|sheet|lot|order|job|run)\.?$/i;

/** Dollars to cents. "$85", "85.00/hr", "1,250", "USD 12.5". Negative, text or #errors refused. */
export function readMoneyCell(s: string): Read<number> {
  const t = clean(s);
  if (/^#/.test(t)) return bad(`shows the spreadsheet error ${t.slice(0, 20)}`);
  let x = t.replace(UNIT_SUFFIX, "").replace(/\s*\bea(ch)?\.?$/i, "");
  x = x
    .replace(/^usd\s*/i, "")
    .replace(/\s*usd$/i, "")
    .replace(/^\$\s*/, "");
  if (/^-|^\(.*\)$/.test(x)) return bad("is negative; a rate cannot be below zero");
  const n = readNumber(x);
  if (n === null) return bad(`is not a dollar amount ("${t.slice(0, 30)}")`);
  const exact = n * 100;
  const cents = Math.round(exact);
  if (cents > 1_000_000_000) return bad("is too large for a rate");
  return Math.abs(exact - cents) > 1e-6 ? ok(cents, `${t} rounded to the cent`) : ok(cents);
}

/** Percent to basis points. "5%" or "5" is five percent; a bare 0.05 is refused (ambiguous). */
export function readPercentCell(s: string): Read<number> {
  const t = clean(s);
  const pct = t.endsWith("%");
  const n = readNumber(pct ? t.slice(0, -1).trim() : t);
  if (n === null) return bad(`is not a percentage ("${t.slice(0, 30)}")`);
  if (!pct && n > 0 && n < 1)
    return bad(`"${t}" could mean ${n}% or ${Math.round(n * 1000) / 10}%: write it with a % sign`);
  const bps = Math.round(n * 100);
  if (bps > 100_000) return bad("is over 1000%");
  return ok(bps);
}

function readReal(s: string): Read<number> {
  const n = readNumber(s);
  return n === null ? bad(`is not a number ("${clean(s).slice(0, 30)}")`) : ok(n);
}

const DURATION_UNIT = /\s*(minutes|mins?|m|hours|hrs?|h|days?|d|weeks?|wks?|w)\.?$/i;
const PER_UNIT: Record<"minutes" | "days", Record<string, number>> = {
  minutes: { m: 1, h: 60 },
  days: { d: 1, w: 7 },
};

/**
 * A whole number of minutes or days. A unit written in the cell ("1.5 hr", "2 weeks") wins over the
 * column's ("Setup hours", "Lead (weeks)"); a unit that does not fit ("3 days" of setup) is refused.
 */
function readInt(s: string, unit: "minutes" | "days", factor = 1, max = 10_000): Read<number> {
  const t0 = clean(s);
  const u = DURATION_UNIT.exec(t0)?.[1]?.toLowerCase();
  if (u) {
    const f = PER_UNIT[unit][u.startsWith("wk") ? "w" : (u[0] ?? "")];
    if (f === undefined) return bad(`"${t0.slice(0, 30)}" is not in ${unit}`);
    factor = f;
  }
  const n = readNumber(u ? t0.replace(DURATION_UNIT, "") : t0);
  if (n === null) return bad(`is not a number of ${unit} ("${t0.slice(0, 30)}")`);
  const exact = n * factor;
  const v = Math.round(exact);
  if (v > max) return bad(`is more than ${max} ${unit}`);
  return Math.abs(v - exact) > 1e-9 ? ok(v, `${clean(s)} rounded to ${v} ${unit}`) : ok(v);
}

const TRUE = /^(y|yes|true|1|x|✓|✔|active|on|outside|outsourced|vendor|sub|subcontract|external)$/i;
const FALSE = /^(n|no|false|0|inactive|retired|off|in-?house|internal)$/i;

function readBool(s: string): Read<boolean> {
  const t = clean(s);
  if (TRUE.test(t)) return ok(true);
  if (FALSE.test(t)) return ok(false);
  return bad(`is not yes or no ("${t.slice(0, 30)}")`);
}

/** Words a shop might write for each machine kind, most specific first. */
const KIND_WORDS: [RegExp, MachineKind][] = [
  [/5[- ]?ax|five[- ]?ax|5ax/, "mill_5axis"],
  [/mill[- ]?turn|multi[- ]?task|turn[- ]?mill/, "mill_turn"],
  [/swiss|sliding head/, "swiss"],
  [/\bedm\b|wire|sinker/, "edm"],
  [/water ?jet/, "waterjet"],
  [/plasma/, "plasma"],
  [/laser/, "laser"],
  [/press ?brake|brake|bend|form(ing)?\b/, "press_brake"],
  [/\bsaw|cut[- ]?off|band/, "saw"],
  [/weld|tig|mig/, "welding"],
  [/deburr|tumbl|vibratory/, "deburr"],
  [/inspect|\bcmm\b|\bqc\b|quality/, "inspection"],
  [/lathe|turn|\bcnc lathe\b/, "lathe"],
  [/3[- ]?ax|three[- ]?ax|\bvmc\b|\bhmc\b|mill|machining cent(er|re)|router/, "mill_3axis"],
];

export function readMachineKind(s: string): Read<MachineKind> {
  const t = clean(s).toLowerCase().replace(/_/g, " ");
  const exact = MACHINE_KINDS.find((k) => k === t.replace(/ /g, "_"));
  if (exact) return ok(exact);
  if (t === "other") return ok("other");
  for (const [re, kind] of KIND_WORDS) if (re.test(t)) return ok(kind);
  return ok("other", `kind "${clean(s).slice(0, 30)}" not recognised; saved as "other"`);
}

function readBasis(s: string): Read<MaterialPricing> {
  const t = clean(s).toLowerCase();
  if (/\b(lb|lbs|pound|weight)\b|per_lb/.test(t)) return ok("per_lb");
  if (/stock|bar|sheet|plate|piece|each|\bea\b|length|stick|tube|per_stock/.test(t))
    return ok("per_stock");
  return bad(`is not "per lb" or "per stock piece" ("${clean(s).slice(0, 30)}")`);
}

function readCell(col: Column, s: string): Read<unknown> {
  switch (col.read) {
    case "text":
      return ok(clean(s).slice(0, 200));
    case "money":
      return readMoneyCell(s);
    case "percent":
      return readPercentCell(s);
    case "real":
      return readReal(s);
    case "minutes":
      return readInt(s, "minutes");
    case "days":
      return readInt(s, "days", 1, 365);
    case "minutesFromHours":
      return readInt(s, "minutes", 60);
    case "daysFromWeeks":
      return readInt(s, "days", 7, 365);
    case "kind":
      return readMachineKind(s);
    case "basis":
      return readBasis(s);
    case "bool":
      return readBool(s);
    case "boolInverted": {
      const r = readBool(s);
      return r.ok ? ok(!r.value) : r;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sheet

const TOTAL_ROW = /^(sub-?)?totals?\b|^grand total/i;

/** Reads one rate kind from a grid of cell text (a CSV, a paste, or one worksheet). Never throws. */
export function readRateSheet(kind: RateImportKind, grid: Grid): RateSheet {
  const empty: RateSheet = {
    kind,
    headerRow: null,
    columns: [],
    ignored: [],
    rows: [],
    errors: [],
    skipped: [],
    fatal: null,
  };
  let best: { r: number; m: Mapped } | null = null;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const m = mapHeader(kind, grid[r] ?? []);
    if (m.hits > (best?.m.hits ?? 0)) best = { r, m };
  }
  if (!best) {
    const need = TEMPLATE_HEADERS[kind].slice(0, 3).join('", "');
    return {
      ...empty,
      fatal: `No header row found. The sheet needs a name column and a price column, for example "${need}".`,
    };
  }
  const { r: hr, m } = best;
  const headerCells = grid[hr] ?? [];
  const out: RateSheet = {
    ...empty,
    headerRow: hr + 1,
    columns: [...m.cols.entries()].map(([i, c]) => ({
      header: (headerCells[i] ?? "").trim(),
      field: c.field,
      label: c.label,
    })),
    ignored: m.ignored,
  };
  const nameCol = [...m.cols.entries()].find(([, c]) => c.field === "name")?.[0] ?? 0;
  const seen = new Map<string, number>();
  for (let r = hr + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const rowNo = r + 1;
    if (cells.every((c) => clean(c) === "")) continue;
    const name = clean(cells[nameCol] ?? "");
    if (!name) {
      out.skipped.push({ row: rowNo, message: "no name in the name column" });
      continue;
    }
    if (TOTAL_ROW.test(name)) {
      out.skipped.push({ row: rowNo, message: `"${name.slice(0, 40)}" looks like a total row` });
      continue;
    }
    const key = nameKey(name);
    const first = seen.get(key);
    if (first !== undefined) {
      out.errors.push({ row: rowNo, message: `"${name}" is already on row ${first}` });
      continue;
    }
    seen.set(key, rowNo);
    const values: Record<string, unknown> = { name: name.slice(0, 120) };
    const warnings: string[] = [];
    const errs: string[] = [];
    for (const [i, col] of m.cols) {
      if (col.field === "name") continue;
      const cell = cells[i] ?? "";
      if (clean(cell) === "" || clean(cell) === "-" || clean(cell) === "–") continue;
      const res = readCell(col, cell);
      if (!res.ok) errs.push(`${col.label}: ${res.error}`);
      else {
        values[col.field] = res.value;
        if (res.warning) warnings.push(`${col.label}: ${res.warning}`);
      }
    }
    if (kind === "materials" && values.pricingBasis === undefined) {
      const lb = values.pricePerLbCents !== undefined;
      const stock = values.stockPriceCents !== undefined;
      if (lb && stock)
        errs.push(
          'has both a price per lb and a stock price: add a "Pricing basis" column (per lb or per stock) to say which one quotes use',
        );
      else if (lb) values.pricingBasis = "per_lb";
      else if (stock) values.pricingBasis = "per_stock";
    }
    if (errs.length) {
      for (const e of errs) out.errors.push({ row: rowNo, message: e });
      continue;
    }
    out.rows.push({ row: rowNo, values: values as unknown as ImportValues, warnings });
  }
  if (out.rows.length + out.errors.length > MAX_RATE_IMPORT_ROWS) {
    out.fatal = `More than ${MAX_RATE_IMPORT_ROWS} rows. Split the sheet and import it in parts.`;
  } else if (out.rows.length === 0 && out.errors.length === 0) {
    out.fatal = "The header was found but no rows under it have a name.";
  }
  return out;
}

/** Names match ignoring case, spacing and punctuation runs: "6061-T6  Aluminum" = "6061-t6 aluminum". */
export function nameKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Plan: match to the card, merge, validate

type Existing = MachineDto | MaterialDto | FinishingOpDto;

export interface PlannedRow {
  row: number;
  name: string;
  action: "create" | "update";
  /** The existing rate this row replaces (update). */
  id?: string;
  /** The existing rate was retired; the import makes it active again. */
  reactivates?: boolean;
  /** Fields whose value changes (update), for the preview. */
  changes: string[];
  /** The full row to write, validated by the editor's own schema. */
  values: Record<string, unknown>;
  warnings: string[];
}
export interface RatePlan {
  rows: PlannedRow[];
  errors: RowProblem[];
}

const SCHEMAS: Record<RateImportKind, z.ZodType> = {
  machines: machineInputSchema,
  materials: materialInputSchema,
  "finishing-ops": finishingOpInputSchema,
};

const FIELD_LABELS: Record<string, string> = {
  kind: "Kind",
  hourlyRateCents: "Hourly rate",
  setupRateCents: "Setup rate",
  defaultSetupMinutes: "Setup minutes",
  removalRateIn3PerMin: "Removal rate",
  cutSpeedInPerMin: "Cut speed",
  pierceSeconds: "Pierce time",
  secondsPerBend: "Seconds per bend",
  secondsPerHole: "Seconds per hole",
  drillFeedInPerMin: "Drill feed",
  secondsPerTappedHole: "Seconds per tapped hole",
  peckDepthDiameters: "Peck depth",
  secondsPerPeck: "Seconds per peck",
  pricingBasis: "Pricing basis",
  pricePerLbCents: "Price per lb",
  densityLbPerIn3: "Density",
  sheetThicknessIn: "Sheet thickness",
  stockPriceCents: "Stock price",
  stockDescription: "Stock description",
  scrapBps: "Scrap %",
  minChargeCents: "Minimum charge",
  perPartCents: "Per part",
  lotChargeCents: "Lot charge",
  outsideService: "Outside service",
  leadDays: "Lead days",
  active: "Active",
  name: "Name",
};

const REQUIRED_ON_CREATE: Record<RateImportKind, { field: string; message: string }[]> = {
  machines: [{ field: "hourlyRateCents", message: "a new machine needs an hourly rate" }],
  materials: [
    {
      field: "pricingBasis",
      message: "a new material needs a price per lb or a stock price",
    },
  ],
  "finishing-ops": [],
};

/**
 * Matches each row to the shop's current rates by name and validates the merged row. An imported
 * row is the shop's current price, so it also makes a retired rate active again unless the sheet
 * has an Active column that says otherwise.
 */
export function planRateImport(
  kind: RateImportKind,
  rows: { row: number; values: ImportValues; warnings?: string[] }[],
  existing: Existing[],
): RatePlan {
  const byName = new Map<string, Existing[]>();
  for (const e of existing) {
    const k = nameKey(e.name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const plan: RatePlan = { rows: [], errors: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const key = nameKey(r.values.name);
    if (seen.has(key)) {
      plan.errors.push({ row: r.row, message: `"${r.values.name}" appears twice in the import` });
      continue;
    }
    seen.add(key);
    const matches = byName.get(key) ?? [];
    if (matches.length > 1) {
      plan.errors.push({
        row: r.row,
        message: `the rate card has ${matches.length} rates named "${r.values.name}"; rename one in the editor first`,
      });
      continue;
    }
    const cur = matches[0];
    const warnings = [...(r.warnings ?? [])];
    const incoming: Record<string, unknown> = { ...r.values };
    if (incoming.active === undefined) incoming.active = true;
    let merged: Record<string, unknown>;
    if (cur) {
      const { id: _id, ...curFields } = cur as unknown as Record<string, unknown>;
      // Keep the name as the card spells it; the match ignored case and spacing.
      merged = { ...curFields, ...incoming, name: cur.name };
    } else {
      const missing = REQUIRED_ON_CREATE[kind].find((f) => incoming[f.field] === undefined);
      if (missing) {
        plan.errors.push({ row: r.row, message: `"${r.values.name}": ${missing.message}` });
        continue;
      }
      merged = incoming;
      // A kind is a label, not a price: a new machine from a sheet without one is "other", said so.
      if (kind === "machines" && merged.kind === undefined) {
        merged.kind = "other";
        warnings.push('no kind given; saved as "other" (change it in the editor)');
      }
    }
    const parsed = SCHEMAS[kind].safeParse(merged);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        plan.errors.push({
          row: r.row,
          message: `"${r.values.name}": ${FIELD_LABELS[field] ?? (field || "row")}: ${issue.message}`,
        });
      }
      continue;
    }
    const values = parsed.data as Record<string, unknown>;
    const changes = cur
      ? Object.keys(values).filter(
          (f) =>
            f !== "name" &&
            JSON.stringify(values[f]) !==
              JSON.stringify((cur as unknown as Record<string, unknown>)[f]),
        )
      : [];
    plan.rows.push({
      row: r.row,
      name: String(values.name),
      action: cur ? "update" : "create",
      ...(cur ? { id: cur.id } : {}),
      ...(cur && !cur.active && values.active === true ? { reactivates: true } : {}),
      changes: changes.map((f) => FIELD_LABELS[f] ?? f),
      values,
      warnings,
    });
  }
  return plan;
}

/** A CSV with the template's header and no rows, for "Download a blank sheet". */
export function templateCsv(kind: RateImportKind): string {
  return `${TEMPLATE_HEADERS[kind].join(",")}\r\n`;
}

// ---------------------------------------------------------------------------------------------
// Export: the card as a CSV this importer reads back unchanged

/**
 * Column headers of the export, in order: the template's columns plus the pricing basis and Active,
 * so an exported sheet, edited and imported again, updates exactly the rates it lists.
 */
export const EXPORT_HEADERS: Record<RateImportKind, string[]> = {
  machines: [...TEMPLATE_HEADERS.machines, "Active"],
  materials: ["Material", "Pricing basis", ...TEMPLATE_HEADERS.materials.slice(1), "Active"],
  "finishing-ops": [...TEMPLATE_HEADERS["finishing-ops"], "Active"],
};

const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
const real = (n: number | null) =>
  n === null ? "" : /e/i.test(String(n)) ? n.toFixed(12).replace(/\.?0+$/, "") : String(n);
const yesNo = (b: boolean) => (b ? "yes" : "no");
const int = (n: number | null) => (n === null ? "" : String(n));

/** One CSV field: quoted when needed; text a spreadsheet would run as a formula gets an apostrophe. */
export function csvField(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportCells(kind: RateImportKind, r: Existing): string[] {
  if (kind === "machines") {
    const m = r as MachineDto;
    return [
      m.name,
      m.kind,
      money(m.hourlyRateCents),
      money(m.setupRateCents),
      int(m.defaultSetupMinutes),
      real(m.removalRateIn3PerMin),
      real(m.cutSpeedInPerMin),
      real(m.pierceSeconds),
      real(m.secondsPerBend),
      real(m.secondsPerHole),
      real(m.drillFeedInPerMin),
      real(m.secondsPerTappedHole),
      real(m.peckDepthDiameters),
      real(m.secondsPerPeck),
      yesNo(m.active),
    ];
  }
  if (kind === "materials") {
    const m = r as MaterialDto;
    return [
      m.name,
      m.pricingBasis === "per_lb" ? "per lb" : "per stock piece",
      money(m.pricePerLbCents),
      real(m.densityLbPerIn3),
      real(m.sheetThicknessIn),
      money(m.stockPriceCents),
      m.stockDescription ?? "",
      `${real(m.scrapBps / 100)}%`,
      money(m.minChargeCents),
      yesNo(m.active),
    ];
  }
  const f = r as FinishingOpDto;
  return [
    f.name,
    money(f.perPartCents),
    money(f.lotChargeCents),
    yesNo(f.outsideService),
    int(f.leadDays),
    yesNo(f.active),
  ];
}

/**
 * The shop's current rates of one kind as a CSV (UTF-8 with a byte-order mark, so Excel shows
 * accented names), retired rates included and marked Active "no". Read back by readRateSheet and
 * planRateImport, an unedited export changes nothing. A blank cell (no setup rate, no lead days)
 * means "not set" and, like every blank cell on import, leaves that field as it is: clear such a
 * value in the editor.
 */
export function exportRateCsv(kind: RateImportKind, rows: Existing[]): string {
  const lines = [EXPORT_HEADERS[kind], ...rows.map((r) => exportCells(kind, r))];
  return `\uFEFF${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`;
}

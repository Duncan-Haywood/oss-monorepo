// Shared parsing for marketplace reports: money, dates, and header matching by name.
//
// Column layouts are matched by NAME (case, spaces and punctuation ignored), never by position: the
// platforms let sellers customise columns (eBay), reorder them over the years (Etsy) and vary spelling
// across regions. Each importer lists the header names it knows for every field (docs/IMPORTERS.md says
// where each name comes from and how well it is verified). A missing required column is a clear error that
// names what was expected, so a changed export fails loudly instead of importing wrong numbers.
import { parseCsv } from "@shared/csv";
import type { ChargeKind, FeeKind, Platform, SaleKind } from "@shared/enums";

export interface ParsedFee {
  kind: FeeKind;
  /** Positive = charged to the seller, negative = credited back. */
  amountCents: number;
  sourceColumn: string;
}

export interface ParsedSale {
  kind: SaleKind;
  externalId: string;
  orderId: string | null;
  date: string;
  title: string | null;
  sku: string | null;
  quantity: number;
  itemCents: number;
  shippingChargedCents: number;
  salesTaxCents: number;
  refundCents: number;
  shippingLabelCents: number;
  netCents: number | null;
  fees: ParsedFee[];
}

export interface ParsedCharge {
  externalId: string;
  date: string;
  kind: ChargeKind;
  /** Positive = cost to the seller, negative = credit. */
  amountCents: number;
  orderId: string | null;
  description: string | null;
}

export interface SkippedRow {
  line: number;
  reason: string;
}

export interface ImportParseResult {
  platform: Platform;
  reportKind: string;
  rowCount: number;
  sales: ParsedSale[];
  charges: ParsedCharge[];
  skipped: SkippedRow[];
  warnings: string[];
}

export class ImportFormatError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ImportFormatError";
  }
}

// ---------------------------------------------------------------------------------------------------
// Money

/**
 * "$1,234.56" -> 123456; "-$1.00", "($1.00)", "−1.00", "USD 12.00", "12.00 USD", "US $3.50" handled.
 * Empty, "--", "-", "N/A" -> null. Anything else non-numeric throws (never guess a number).
 */
export function parseMoney(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "" || s === "--" || s === "-" || /^n\/?a$/i.test(s)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/−/g, "-"); // unicode minus
  s = s.replace(/\b(USD|US)\b/gi, "").replace(/[$\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) throw new Error(`Not an amount: ${JSON.stringify(raw)}`);
  const [whole = "0", frac = ""] = s.split(".");
  // Round half away from zero at the cent.
  const cents = Number(whole) * 100 + Math.round(Number(`0.${frac || "0"}`) * 100);
  return negative ? -cents : cents;
}

export const abs = (n: number | null) => (n == null ? null : Math.abs(n));

// ---------------------------------------------------------------------------------------------------
// Dates

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 1990 || year > 2100) return null;
  const dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. Feb 30
  return `${year}-${pad(m)}-${pad(d)}`;
}

/**
 * Report dates -> "YYYY-MM-DD" (the date as printed; time and zone are dropped, because the seller's
 * books follow the day the platform shows). Accepts 2026-01-05[T...], 1/5/2026, 01/05/26, Jan 5, 2026,
 * January 5 2026, Jan-05-26, 05-Jan-2026, 5 Jan 2026, and "Jan 5, 2026 10:01:02 PM PST".
 */
export function parseDate(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  // Year first, with dashes or (TikTok Shop) slashes: 2026-03-14, 2026/03/14.
  let m = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:$|[T\s])/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[3]), Number(m[4]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:$|\s)/.exec(s);
  if (m) return ymd(Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{2}|\d{4})(?:$|[\s,T])/.exec(s);
  if (m) {
    const mon =
      MONTHS[(m[1] ?? "").slice(0, 4).toLowerCase()] ??
      MONTHS[(m[1] ?? "").slice(0, 3).toLowerCase()];
    if (mon) return ymd(Number(m[3]), mon, Number(m[2]));
  }
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2}|\d{4})(?:$|\s)/.exec(s);
  if (m) {
    const mon = MONTHS[(m[2] ?? "").slice(0, 3).toLowerCase()];
    if (mon) return ymd(Number(m[3]), mon, Number(m[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Headers

/** "Final Value Fee - variable" -> "finalvaluefeevariable". */
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ColumnSpec<F extends string> = Record<
  F,
  { names: readonly string[]; required?: boolean }
>;

export interface Table<F extends string> {
  /** 1-based line number of each data row in the file (for error messages). */
  rows: { line: number; get: (f: F) => string | undefined; has: (f: F) => boolean }[];
  /** The header text actually matched for each field. */
  matched: Partial<Record<F, string>>;
}

/**
 * Finds the header row (the first row, within the first 30, that contains every required column; eBay
 * puts a few lines of preamble above it), then maps each field to its column by any of its known names.
 * Blank rows and footer rows with only one non-empty cell are dropped.
 */
export function readTable<F extends string>(
  text: string,
  spec: ColumnSpec<F>,
  label: string,
): Table<F> {
  const all = parseCsv(text);
  const fields = Object.keys(spec) as F[];
  const required = fields.filter((f) => spec[f].required);
  let headerIdx = -1;
  let index: Partial<Record<F, number>> = {};
  for (let r = 0; r < Math.min(all.length, 30); r++) {
    const cells = (all[r] ?? []).map(normHeader);
    const found: Partial<Record<F, number>> = {};
    for (const f of fields) {
      for (const name of spec[f].names) {
        const at = cells.indexOf(normHeader(name));
        if (at >= 0) {
          found[f] = at;
          break;
        }
      }
    }
    if (required.every((f) => found[f] !== undefined)) {
      headerIdx = r;
      index = found;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new ImportFormatError(
      `This doesn't look like a ${label}: missing required columns.`,
      required.map((f) => ({ field: f, expectedOneOf: spec[f].names })),
    );
  }
  const header = all[headerIdx] ?? [];
  const matched: Partial<Record<F, string>> = {};
  for (const f of fields) {
    const i = index[f];
    if (i !== undefined) matched[f] = header[i];
  }
  const rows: Table<F>["rows"] = [];
  for (let r = headerIdx + 1; r < all.length; r++) {
    const cells = all[r] ?? [];
    if (cells.filter((c) => c.trim() !== "").length <= 1) continue;
    rows.push({
      line: r + 1,
      get: (f) => {
        const i = index[f];
        return i === undefined ? undefined : cells[i]?.trim();
      },
      has: (f) => index[f] !== undefined,
    });
  }
  return { rows, matched };
}

/** Deterministic id for rows without a platform transaction id (stable across re-imports of a file). */
export function rowKey(...parts: (string | number | null | undefined)[]): string {
  // FNV-1a 64-bit over the joined parts, hex. Not security sensitive: only de-duplication.
  let h = 0xcbf29ce484222325n;
  const s = parts.map((p) => (p == null ? "" : String(p))).join("␟");
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `k${h.toString(16).padStart(16, "0")}`;
}

export function emptyResult(platform: Platform, reportKind: string): ImportParseResult {
  return { platform, reportKind, rowCount: 0, sales: [], charges: [], skipped: [], warnings: [] };
}

/** Adds a fee if the cell holds a non-zero amount. `sign` +1 for charges, -1 for credits. */
export function pushFee(
  fees: ParsedFee[],
  kind: FeeKind,
  raw: string | undefined,
  column: string | undefined,
  sign: 1 | -1 = 1,
) {
  const v = parseMoney(raw);
  if (v == null || v === 0 || !column) return;
  fees.push({ kind, amountCents: sign * Math.abs(v), sourceColumn: column });
}

export const sumFees = (fees: ParsedFee[]) => fees.reduce((s, f) => s + f.amountCents, 0);

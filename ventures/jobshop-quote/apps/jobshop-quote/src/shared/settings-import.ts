// Shop settings from a sheet: the markups, the line minimum, how long a quote is valid, the default
// quantity breaks, the default lead time and the terms printed on quotes, read from label/value rows ("Labor markup | 15%") anywhere on a worksheet, so a
// shop's price list that keeps them in a block above its rate table imports in one pass, and an
// exported settings sheet reads back unchanged.
//
// Same rules as the rate import (./rate-card-import, docs/ARCHITECTURE.md "No invented prices"): a
// value that is not clear is an error naming its row; a label that could mean two things ("Markup"
// alone, "Margin", "Minimum order") is left out with the reason, never mapped to the nearest setting.
// Only the first non-empty cell of a row is a label, and the next non-empty cell is its value, so a
// rate table's own header and rows (first cell "Machine", "Haas VF-2") are not read as settings.
//
// A blank value leaves a setting as it is. "(none)" (or "(clear)") empties a text setting, and the
// export writes "(none)" for an empty one, so a sheet can clear the lead time or the terms and an
// exported sheet still reads back unchanged. A number setting has no empty state, so "(none)" there
// is an error that says what to write instead.
import { type ShopSettingsDto, shopSettingsPatchSchema } from "./api";
import { formatMoney, headerCurrencyMark, markFits, otherCurrencyMessage } from "./currency";
import {
  clean,
  csvField,
  type Grid,
  normHeader,
  type RowProblem,
  readMoneyCell,
  readNumber,
  readPercentCell,
} from "./rate-card-import";

export type SettingField =
  | "laborMarkupBps"
  | "materialMarkupBps"
  | "outsideServiceMarkupBps"
  | "minimumLineCents"
  | "quoteValidDays"
  | "defaultQuantities"
  | "defaultLeadTimeText"
  | "quoteTerms";

type TextField = "defaultLeadTimeText" | "quoteTerms";
const TEXT_FIELDS: ReadonlySet<SettingField> = new Set<SettingField>([
  "defaultLeadTimeText",
  "quoteTerms",
]);
const isTextField = (f: SettingField): f is TextField => TEXT_FIELDS.has(f);
/** The longest text each one takes, as the settings editor's schema (./api) does. */
const TEXT_MAX: Record<TextField, number> = { defaultLeadTimeText: 200, quoteTerms: 4000 };

/** A cell value that empties a text setting; the export writes the first one. */
export const CLEAR_VALUES = ["(none)", "(clear)"] as const;
const isClear = (s: string) => (CLEAR_VALUES as readonly string[]).includes(s.toLowerCase());

export type SettingValue = number | number[] | string | null;

export type SettingsPatch = Partial<{
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
  quoteValidDays: number;
  defaultQuantities: number[];
  defaultLeadTimeText: string | null;
  quoteTerms: string | null;
}>;

/** Labels the export writes, and the editor's own wording. */
export const SETTING_LABELS: Record<SettingField, string> = {
  laborMarkupBps: "Labor markup",
  materialMarkupBps: "Material markup",
  outsideServiceMarkupBps: "Outside service markup",
  minimumLineCents: "Minimum line charge",
  quoteValidDays: "Quote valid (days)",
  defaultQuantities: "Default quantities",
  defaultLeadTimeText: "Default lead time",
  quoteTerms: "Quote terms",
};

export interface SettingRow {
  /** Spreadsheet row number (1 = the first line). */
  row: number;
  field: SettingField;
  /** The sheet's label text. */
  label: string;
  value: SettingValue;
  warnings: string[];
}
export interface SettingsSheet {
  rows: SettingRow[];
  errors: RowProblem[];
  /** Labels that look like a setting but say too little to pick one, with why. */
  ignored: { row: number; label: string; reason: string }[];
  /** Nothing on the sheet reads as a setting. */
  fatal: string | null;
}

type Match = { field: SettingField } | { refuse: string };

const MARKUP = /\bmark ?-?up\b/;

/** What a label means, or why it is refused, or null when it is not about settings at all. */
export function matchSettingLabel(raw: string): Match | null {
  const h = normHeader(raw)
    .replace(/[:*]+$/, "")
    .trim();
  if (MARKUP.test(h)) {
    if (/\b(labou?r|machin\w*|shop|work ?cent\w*)\b/.test(h)) return { field: "laborMarkupBps" };
    if (/\b(materials?|stock|raw|metal)\b/.test(h)) return { field: "materialMarkupBps" };
    if (
      /\b(outside|vendor|sub ?contract\w*|subs?|finish\w*|purchased|buyout|services?|osp)\b/.test(h)
    )
      return { field: "outsideServiceMarkupBps" };
    return {
      refuse:
        'does not say which markup it is: label it "Labor markup", "Material markup" or "Outside service markup"',
    };
  }
  if (/\bmargin\b/.test(h))
    return {
      refuse:
        "a margin is not a markup (a 20% margin is a 25% markup): enter the markup, as the quote adds it to cost",
    };
  if (/^min(imum|\.)?\b|\bminimum\b/.test(h)) {
    if (/\b(line|per line|line item)\b/.test(h)) return { field: "minimumLineCents" };
    if (/\b(order|job|charge|lot|price|invoice|po|ticket)\b/.test(h))
      return {
        refuse:
          'quotes apply their minimum to each line, not to an order or a lot: label it "Minimum line charge" if that is what it is',
      };
    return null;
  }
  if (
    /\bvalid\w*\b|\bgood for\b|\bexpir\w*\b/.test(h) &&
    /\bquotes?\b|^valid|^validity|^expir/.test(h)
  )
    return { field: "quoteValidDays" };
  if (
    /\b(quantit(y|ies)|qtys?|quantity breaks?|price breaks?|break quantities|breaks)\b/.test(h) &&
    /\b(default|breaks?|quantities|qtys)\b/.test(h)
  )
    return { field: "defaultQuantities" };
  if (/^(default |standard |quoted? )?lead ?times?$/.test(h))
    return { field: "defaultLeadTimeText" };
  // "Lead time (days)" or "Lead time per part" is a number for one part, not the quote's wording.
  if (/\blead ?times?\b/.test(h))
    return {
      refuse:
        'the default lead time is the text printed on each quote line ("3-4 weeks ARO"): label it "Default lead time" and write the text',
    };
  if (/\bpayment terms?\b|\bterms of payment\b/.test(h))
    return {
      refuse:
        'quotes print one terms block: label it "Quote terms" and put the payment terms in its text',
    };
  if (
    /^((quote|quotation|standard|sales) )?(terms( (and|&) conditions)?|t ?& ?cs?|conditions)$/.test(
      h,
    )
  )
    return { field: "quoteTerms" };
  return null;
}

type Read<T> = { ok: true; value: T; warning?: string } | { ok: false; error: string };

/**
 * Whole days: "30", "30 days", "2 weeks" (14); "1 month" refused (months vary). A unit in the cell
 * wins over the label's: "Quote valid (weeks)" with a bare 4 is 28 days.
 */
export function readDaysCell(s: string, labelUnit: "days" | "weeks" = "days"): Read<number> {
  const t = clean(s);
  const m = /^(.*?)\s*(days?|d|weeks?|wks?|w)?\.?$/i.exec(t);
  const unit = (m?.[2] ?? (labelUnit === "weeks" ? "w" : "d")).toLowerCase();
  if (/\b(months?|mos?|years?|yrs?)\b/i.test(t))
    return { ok: false, error: `"${t.slice(0, 30)}": write it in days or weeks (months vary)` };
  const n = readNumber(m?.[1] ?? "");
  if (n === null) return { ok: false, error: `is not a number of days ("${t.slice(0, 30)}")` };
  const days = n * (unit.startsWith("w") ? 7 : 1);
  if (!Number.isInteger(days)) return { ok: false, error: `"${t}" is not a whole number of days` };
  if (days < 1 || days > 365) return { ok: false, error: "must be 1 to 365 days" };
  return { ok: true, value: days };
}

/**
 * Quantity breaks: "1, 5, 10, 25", "1;5;10", "1 5 10", "1/5/10", "1,5,10". A comma inside one
 * number is read as thousands only when it cannot be a list: "1,000" is 1000 (000 is no quantity),
 * while "5,100" could be 5100 or 5 and 100 and is refused.
 */
export function readQuantitiesCell(s: string): Read<number[]> {
  const t = clean(s);
  const tokens = t
    .split(/[;/|]|,\s+|\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: number[] = [];
  let warning: string | undefined;
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      out.push(Number(tok));
      continue;
    }
    if (/^\d{1,3}(,\d{3})+$/.test(tok)) {
      const parts = tok.split(",");
      if (parts.slice(1).every((p) => /^0+$/.test(p))) {
        out.push(Number(parts.join("")));
        continue;
      }
      return {
        ok: false,
        error: `"${tok}" could be ${Number(parts.join(""))} or the quantities ${parts.join(" and ")}: separate quantities with "; " or ", "`,
      };
    }
    if (/^\d+(,\d+)+$/.test(tok)) {
      out.push(...tok.split(",").map(Number));
      continue;
    }
    return { ok: false, error: `"${tok.slice(0, 20)}" is not a whole quantity` };
  }
  if (out.length === 0) return { ok: false, error: "lists no quantities" };
  if (out.length > 8)
    return { ok: false, error: `lists ${out.length} quantities; a quote takes up to 8` };
  if (out.some((q) => q < 1 || q > 1_000_000))
    return { ok: false, error: "each quantity must be 1 to 1,000,000" };
  const sorted = [...new Set(out)].sort((a, b) => a - b);
  if (sorted.length !== out.length || sorted.some((q, i) => q !== out[i]))
    warning = `read as ${sorted.join(", ")} (sorted, repeats dropped)`;
  return warning ? { ok: true, value: sorted, warning } : { ok: true, value: sorted };
}

/**
 * Text as written: non-breaking spaces as spaces, each line trimmed and blank edges dropped, line
 * breaks inside the cell kept (terms are often a few lines), and the export's leading apostrophe on
 * a cell starting with = + - @ removed.
 */
export function readTextCell(raw: string, max: number): Read<string> {
  const t = raw
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim()
    .replace(/^'(?=[=+\-@])/, "");
  if (t.length > max)
    return { ok: false, error: `is ${t.length} characters; it takes up to ${max}` };
  return { ok: true, value: t };
}

/** What to write instead of "(none)" in a setting that cannot be empty. */
const NO_CLEAR: Record<Exclude<SettingField, TextField>, string> = {
  laborMarkupBps: 'cannot be empty: write "0%" for no markup',
  materialMarkupBps: 'cannot be empty: write "0%" for no markup',
  outsideServiceMarkupBps: 'cannot be empty: write "0%" for no markup',
  minimumLineCents: 'cannot be empty: write "0" for no minimum',
  quoteValidDays: "cannot be empty: write how many days a quote is good for",
  defaultQuantities: "cannot be empty: list at least one quantity",
};

function readValue(
  field: SettingField,
  cell: string,
  raw: string,
  label: string,
  currency: string | null,
): Read<SettingValue> {
  if (isClear(cell))
    return isTextField(field) ? { ok: true, value: null } : { ok: false, error: NO_CLEAR[field] };
  switch (field) {
    case "defaultLeadTimeText":
    case "quoteTerms":
      return readTextCell(raw, TEXT_MAX[field]);
    case "laborMarkupBps":
    case "materialMarkupBps":
    case "outsideServiceMarkupBps":
      return readPercentCell(cell);
    case "minimumLineCents":
      return readMoneyCell(cell, currency);
    case "quoteValidDays":
      return readDaysCell(cell, /\b(weeks?|wks?)\b/i.test(label) ? "weeks" : "days");
    case "defaultQuantities":
      return readQuantitiesCell(cell);
  }
}

/**
 * Reads every settings row on a grid (a CSV, a paste, or one worksheet). Never throws. `currency`
 * is the shop's (null is USD): a minimum line charge marked in another currency is refused.
 */
export function readSettingsSheet(grid: Grid, currency: string | null = null): SettingsSheet {
  const out: SettingsSheet = { rows: [], errors: [], ignored: [], fatal: null };
  const seen = new Map<SettingField, SettingRow>();
  grid.forEach((cells, r) => {
    const rowNo = r + 1;
    const filled = cells.map((c, i) => [i, clean(c)] as const).filter(([, c]) => c !== "");
    const first = filled[0];
    if (!first) return;
    const label = first[1];
    const match = matchSettingLabel(label);
    if (!match) return;
    if ("refuse" in match) {
      out.ignored.push({ row: rowNo, label, reason: match.refuse });
      return;
    }
    const valueAt = filled[1];
    const valueCell = valueAt?.[1];
    const name = SETTING_LABELS[match.field];
    // A label with a blank value (the blank sheet) leaves the setting as it is, like a blank cell.
    if (valueAt === undefined || valueCell === undefined || valueCell === "-" || valueCell === "–")
      return;
    // Text cut by an unquoted comma ("Net 30, FOB our dock") lands in several cells: refuse it
    // rather than save the first piece. A number's note in the next cell ("per PO") stays allowed.
    if (isTextField(match.field) && filled.length > 2 && !isClear(valueCell)) {
      out.errors.push({
        row: rowNo,
        message: `${name}: the text runs over ${filled.length - 1} cells (a comma splits an unquoted CSV cell); put it in one cell, in quotes in a CSV`,
      });
      return;
    }
    const labelMark = match.field === "minimumLineCents" ? headerCurrencyMark(label) : null;
    if (labelMark && !markFits(labelMark, currency)) {
      out.errors.push({
        row: rowNo,
        message: `${name} ${otherCurrencyMessage(labelMark, currency)}`,
      });
      return;
    }
    const res = readValue(match.field, valueCell, cells[valueAt[0]] ?? "", label, currency);
    if (!res.ok) {
      out.errors.push({ row: rowNo, message: `${name}: ${res.error}` });
      return;
    }
    const prev = seen.get(match.field);
    if (prev) {
      if (JSON.stringify(prev.value) !== JSON.stringify(res.value))
        out.errors.push({
          row: rowNo,
          message: `${name} is also on row ${prev.row} with a different value; keep one`,
        });
      return;
    }
    const row: SettingRow = {
      row: rowNo,
      field: match.field,
      label,
      value: res.value,
      warnings: res.warning ? [res.warning] : [],
    };
    seen.set(match.field, row);
    out.rows.push(row);
  });
  if (out.rows.length === 0 && out.errors.length === 0)
    out.fatal = `No settings found. Put each one on its own row, a label then its value, for example "${SETTING_LABELS.laborMarkupBps}" then "15%".`;
  return out;
}

/** How a setting reads to a person: "15%", "$150.00", "30 days", "1, 5, 10", "\"Net 30\"", "(none)". */
export function formatSetting(
  field: SettingField,
  v: SettingValue,
  /** The shop's ISO 4217 code (shared/currency.ts); null is USD. */
  currency: string | null = null,
): string {
  if (v === null) return CLEAR_VALUES[0];
  if (typeof v === "string") {
    const one = v.replace(/\s+/g, " ");
    return `"${one.length > 60 ? `${one.slice(0, 57)}…` : one}"`;
  }
  if (Array.isArray(v)) return v.join(", ");
  if (field === "minimumLineCents") return formatMoney(v, currency, { grouping: false });
  if (field === "quoteValidDays") return `${v} day${v === 1 ? "" : "s"}`;
  return `${Number((v / 100).toFixed(2))}%`;
}

export interface SettingsPlan {
  rows: { row: number; name: string; field: SettingField; changes: string[]; warnings: string[] }[];
  /** Only the settings whose value changes, validated by the settings editor's own schema. */
  patch: SettingsPatch;
  errors: RowProblem[];
}

/** Compares the sheet's settings with the shop's current ones and builds the PATCH body. */
export function planSettingsImport(rows: SettingRow[], current: ShopSettingsDto): SettingsPlan {
  const plan: SettingsPlan = { rows: [], patch: {}, errors: [] };
  for (const r of rows) {
    const cur = current[r.field];
    const same = JSON.stringify(cur) === JSON.stringify(r.value);
    const parsed = shopSettingsPatchSchema.safeParse({ [r.field]: r.value });
    if (!parsed.success) {
      plan.errors.push({
        row: r.row,
        message: `${SETTING_LABELS[r.field]}: ${parsed.error.issues[0]?.message ?? "not accepted"}`,
      });
      continue;
    }
    if (!same) (plan.patch as Record<string, unknown>)[r.field] = r.value;
    plan.rows.push({
      row: r.row,
      name: SETTING_LABELS[r.field],
      field: r.field,
      changes: same
        ? []
        : [
            `${formatSetting(r.field, cur, current.currency)} → ${formatSetting(r.field, r.value, current.currency)}`,
          ],
      warnings: r.warnings,
    });
  }
  return plan;
}

const EXPORT_ORDER: SettingField[] = [
  "laborMarkupBps",
  "materialMarkupBps",
  "outsideServiceMarkupBps",
  "minimumLineCents",
  "quoteValidDays",
  "defaultQuantities",
  "defaultLeadTimeText",
  "quoteTerms",
];

function exportValue(field: SettingField, s: ShopSettingsDto): string {
  const v = s[field];
  if (v === null) return CLEAR_VALUES[0];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join("; ");
  if (field === "minimumLineCents") return (v / 100).toFixed(2);
  if (field === "quoteValidDays") return String(v);
  return `${Number((v / 100).toFixed(2))}%`;
}

/** The shop's settings as a two-column CSV (UTF-8 with a BOM) that readSettingsSheet reads back. */
export function exportSettingsCsv(s: ShopSettingsDto): string {
  const lines = [
    ["Setting", "Value"],
    ...EXPORT_ORDER.map((f) => [SETTING_LABELS[f], exportValue(f, s)]),
  ];
  return `\uFEFF${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`;
}

/** The blank sheet: each label with an empty value, which leaves that setting as it is. */
export function settingsTemplateCsv(): string {
  return `Setting,Value\r\n${EXPORT_ORDER.map((f) => `${csvField(SETTING_LABELS[f])},`).join("\r\n")}\r\n`;
}

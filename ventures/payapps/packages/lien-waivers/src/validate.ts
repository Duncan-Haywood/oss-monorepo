import type { FieldSpec, FormDefinition, ValidationError, WaiverData } from "./types.ts";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TEXT = 2000;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isIsoDate(v: string): boolean {
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** `$1,234.56` from integer cents. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** `November 24, 2026` from `2026-11-24` (no timezone shifts). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function checkField(f: FieldSpec, raw: unknown): ValidationError | string | null {
  if (isBlank(raw)) {
    return f.required
      ? { field: f.key, code: "REQUIRED", message: `${f.label} is required.` }
      : null;
  }
  switch (f.type) {
    case "money":
      if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) {
        return {
          field: f.key,
          code: "INVALID_MONEY",
          message: `${f.label} must be a non-negative whole number of cents.`,
        };
      }
      return formatCents(raw);
    case "date":
      if (typeof raw !== "string" || !isIsoDate(raw)) {
        return {
          field: f.key,
          code: "INVALID_DATE",
          message: `${f.label} must be a real date in YYYY-MM-DD form.`,
        };
      }
      return formatDate(raw);
    default:
      if (typeof raw !== "string" || raw.length > MAX_TEXT) {
        return {
          field: f.key,
          code: "INVALID_TEXT",
          message: `${f.label} must be text of at most ${MAX_TEXT} characters.`,
        };
      }
      return f.type === "text" ? raw.replace(/\s+/g, " ").trim() : raw.trim();
  }
}

/**
 * Validate caller data against a form's fields. Returns formatted display values
 * (money as `$x.yy`, dates spelled out; blank optional fields as "") or every problem found.
 */
export function validate(
  form: Pick<FormDefinition, "fields">,
  data: WaiverData,
): { ok: true; values: Record<string, string> } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const values: Record<string, string> = {};
  const known = new Set(form.fields.map((f) => f.key));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      errors.push({ field: key, code: "UNKNOWN_FIELD", message: `Unknown field "${key}".` });
    }
  }
  for (const f of form.fields) {
    const r = checkField(f, data[f.key]);
    if (r === null) values[f.key] = "";
    else if (typeof r === "string") values[f.key] = r;
    else errors.push(r);
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

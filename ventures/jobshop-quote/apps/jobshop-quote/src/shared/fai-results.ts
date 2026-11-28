// First article results: what the inspector enters against the drafted Form 3 characteristic list
// (shared/fai-characteristics.ts), and the accept / reject each entry earns.
//
// Why: after listing the characteristics, the inspector measures each one and writes the result on
// Form 3. Judging a measured value against its limits is arithmetic a person can slip on at row 140
// of 200, and a reject without a nonconformance number is a report the customer sends back. This
// does the arithmetic and says what is still open; it never fills a result in.
//
// Rules (a draft for a person to sign, not a verdict on the part):
//   value rows       every number in the result must fall within the row's limits (inclusive, to
//                    1e-9); "1.2502 1.2498" (several readings) rejects if any one is outside. A
//                    missing lower limit (surface finish) means only the maximum is checked.
//   accept/reject    the result must say accept or reject in so many words (accept, ok, pass,
//                    conforms; reject, fail, nc, nonconforming); anything else stays open.
//   either kind      a value row the inspector judges in words ("accept" on a gauge check) takes
//                    their word, and the reason says the limits were not checked.
//   reject           needs a nonconformance number before the sheet counts as complete.
//   not applicable   a drafted row the inspector marks as not a characteristic (a false read from
//                    the text) is left out of the counts and printed as such, never deleted.

import { z } from "zod";
import {
  type Characteristic,
  type CharacteristicKind,
  MAX_CHARACTERISTICS,
} from "./fai-characteristics";

export const MAX_RESULT_LENGTH = 200;
export const MAX_FIELD_LENGTH = 100;
export const MAX_REQUIREMENT_LENGTH = 300;
export const MAX_ADDED_ROWS = 200;
const EPS = 1e-9;

/** What the inspector writes on one row (Form 3's blank columns). */
export interface FaiEntry {
  /** Drawing zone or sheet/view, e.g. "B3". */
  location?: string;
  /** Key characteristic designator, e.g. "KC". */
  designator?: string;
  /** The measured value(s), or accept / reject. */
  result?: string;
  /** Designed or qualified tooling used, e.g. a gauge number. */
  tooling?: string;
  /** Nonconformance report number, required on a reject. */
  ncr?: string;
  /** True when this drafted row is not a characteristic (a false read); kept, not counted. */
  notApplicable?: boolean;
}

/** A characteristic the draft missed, added by the inspector (numbered after the draft's rows). */
export interface FaiAddedRow {
  requirement: string;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  record: "value" | "accept/reject";
}

export type Verdict = "accept" | "reject" | "open" | "n/a";

export interface Judgement {
  verdict: Verdict;
  /** Why, when it is not a plain in-limits accept. */
  reason: string | null;
}

const ACCEPT =
  /^(?:accept(?:ed|able)?|acc|ok|okay|pass(?:ed)?|good|conform(?:s|ing)?|yes|go|✓|✔)$/i;
const REJECT =
  /^(?:reject(?:ed)?|rej|fail(?:ed)?|nc|ncr|no[\s-]?go|non[\s-]?conform(?:s|ing|ance)?|✗|✘)$/i;

const NUMBER = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** The readings in a result: numbers separated by spaces, commas followed by a space, ; or /. */
export function readings(result: string): number[] | null {
  const parts = result
    .trim()
    .replace(/\s*(?:in|mm|µin|uin|µm|um|°|")\s*$/i, "")
    .split(/\s*[;/]\s*|,\s+|\s+/)
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 20) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!NUMBER.test(p)) return null;
    out.push(Number(p.replace(",", ".")));
  }
  return out;
}

const fmt = (n: number) => String(Number(n.toFixed(8)));

/** The verdict for one characteristic and what the inspector entered on it. */
export function judge(
  c: Pick<Characteristic, "lower" | "upper" | "record" | "unit">,
  entry: FaiEntry | undefined,
): Judgement {
  if (entry?.notApplicable) return { verdict: "n/a", reason: "marked not a characteristic" };
  const result = (entry?.result ?? "").trim();
  if (!result) return { verdict: "open", reason: "no result yet" };
  const word = result.replace(/[.!]$/, "");
  const needsNcr = !(entry?.ncr ?? "").trim();
  const rejected = (reason: string): Judgement => ({
    verdict: "reject",
    reason: needsNcr ? `${reason}; enter a nonconformance number` : reason,
  });
  if (ACCEPT.test(word)) {
    return {
      verdict: "accept",
      reason:
        c.record === "value" ? "accepted by the inspector; the limits were not checked" : null,
    };
  }
  if (REJECT.test(word)) return rejected("rejected by the inspector");
  if (c.record !== "value") {
    return {
      verdict: "open",
      reason: "write accept or reject (this row is checked, not measured)",
    };
  }
  const values = readings(result);
  if (!values) {
    return { verdict: "open", reason: "not read as a number: write the reading, e.g. 1.2502" };
  }
  if (c.lower === null && c.upper === null) {
    return { verdict: "open", reason: "this row has no limits: write accept or reject" };
  }
  const unit = c.unit ? ` ${c.unit}` : "";
  for (const v of values) {
    if (c.lower !== null && v < c.lower - EPS) {
      return rejected(`${fmt(v)} is under the lower limit ${fmt(c.lower)}${unit}`);
    }
    if (c.upper !== null && v > c.upper + EPS) {
      return rejected(`${fmt(v)} is over the upper limit ${fmt(c.upper)}${unit}`);
    }
  }
  return { verdict: "accept", reason: null };
}

export interface FaiSummary {
  total: number;
  accepted: number;
  rejected: number;
  open: number;
  notApplicable: number;
  /** Rejects without a nonconformance number. */
  rejectsWithoutNcr: number;
  /** Every counted row judged, and every reject has a nonconformance number. */
  complete: boolean;
}

export function summarise(rows: { verdict: Verdict; entry?: FaiEntry }[]): FaiSummary {
  const s: FaiSummary = {
    total: 0,
    accepted: 0,
    rejected: 0,
    open: 0,
    notApplicable: 0,
    rejectsWithoutNcr: 0,
    complete: false,
  };
  for (const r of rows) {
    if (r.verdict === "n/a") {
      s.notApplicable++;
      continue;
    }
    s.total++;
    if (r.verdict === "accept") s.accepted++;
    else if (r.verdict === "reject") {
      s.rejected++;
      if (!(r.entry?.ncr ?? "").trim()) s.rejectsWithoutNcr++;
    } else s.open++;
  }
  s.complete = s.total > 0 && s.open === 0 && s.rejectsWithoutNcr === 0;
  return s;
}

/** Number the inspector's added rows after the draft: the next whole number on from the last. */
export function addedNumbers(draft: Pick<Characteristic, "no">[], count: number): string[] {
  const last = draft.reduce((m, c) => Math.max(m, Number.parseInt(c.no, 10) || 0), 0);
  return Array.from({ length: count }, (_, i) => String(last + i + 1));
}

/** Entries are keyed by characteristic number: "3", "4.2", or an added row's number. */
export const CHAR_NO = /^\d{1,4}(?:\.\d{1,3})?$/;
export const MAX_ENTRIES = MAX_CHARACTERISTICS + MAX_ADDED_ROWS;

const field = z.string().trim().max(MAX_FIELD_LENGTH).optional();
const limit = z.number().finite().min(-1e6).max(1e6).nullable();

export const faiEntrySchema = z
  .object({
    location: field,
    designator: field,
    result: z.string().trim().max(MAX_RESULT_LENGTH).optional(),
    tooling: field,
    ncr: field,
    notApplicable: z.boolean().optional(),
  })
  .strict();

export const faiAddedRowSchema = z
  .object({
    requirement: z.string().trim().min(1).max(MAX_REQUIREMENT_LENGTH),
    lower: limit,
    upper: limit,
    unit: z.string().trim().max(10).nullable(),
    record: z.enum(["value", "accept/reject"]),
  })
  .strict()
  .refine((r) => r.lower === null || r.upper === null || r.lower <= r.upper, {
    message: "The lower limit is above the upper limit.",
  });

export const faiSaveSchema = z
  .object({
    entries: z
      .record(z.string().regex(CHAR_NO), faiEntrySchema)
      .refine((e) => Object.keys(e).length <= MAX_ENTRIES, { message: "Too many rows." }),
    added: z.array(faiAddedRowSchema).max(MAX_ADDED_ROWS),
  })
  .strict();
export type FaiSaveInput = z.infer<typeof faiSaveSchema>;

/** One row on the inspection screen: the characteristic, the inspector's entry and its verdict. */
export interface FaiRowDto {
  no: string;
  kind: CharacteristicKind | "added";
  requirement: string;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  record: "value" | "accept/reject";
  /** Drawing text line, null for an added row. */
  line: number | null;
  entry: FaiEntry;
  verdict: Verdict;
  reason: string | null;
}

export interface FaiSheetDto {
  fileName: string;
  /**
   * Drawing zones read from the PDF's zoned border, by row number ("C4"; "SH2 C4" on a multi-sheet
   * file): a suggestion for the Zone column, used in the CSV where the inspector entered none.
   */
  zones: Record<string, string>;
  partNumber: string | null;
  revision: string | null;
  general: string[];
  truncated: boolean;
  rows: FaiRowDto[];
  added: FaiAddedRow[];
  summary: FaiSummary;
  updatedAt: string | null;
}

/** Drafted rows plus the inspector's added rows, each with its entry and verdict. */
export function buildRows(
  draft: Pick<
    FaiRowDto,
    "no" | "kind" | "requirement" | "lower" | "upper" | "unit" | "record" | "line"
  >[],
  added: FaiAddedRow[],
  entries: Record<string, FaiEntry>,
): FaiRowDto[] {
  const rows: FaiRowDto[] = draft.map((c) => {
    const entry = entries[c.no] ?? {};
    const { no, kind, requirement, lower, upper, unit, record, line } = c;
    return { no, kind, requirement, lower, upper, unit, record, line, entry, ...judge(c, entry) };
  });
  const nos = addedNumbers(draft, added.length);
  added.forEach((a, i) => {
    const no = nos[i] as string;
    const entry = entries[no] ?? {};
    rows.push({ no, kind: "added", ...a, line: null, entry, ...judge(a, entry) });
  });
  return rows;
}

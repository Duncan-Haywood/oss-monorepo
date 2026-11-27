// RFQ extraction contract + deterministic verification.
//
// The LLM reads the RFQ (pasted email + text of attached drawings) and returns, for every field, a
// value AND the verbatim quote it came from. Nothing it returns is trusted as is:
//   1. the quote must appear in the RFQ text (whitespace/case-insensitive), else the value is dropped;
//   2. every token with a digit in the value (part numbers, alloys, tolerances, quantities, dates)
//      must appear in that quote, else the value is dropped;
//   3. quantities must each appear as a number in the quote.
// Dropped values become warnings for the estimator, never silent guesses. The estimator then edits
// and confirms the structured form; only confirmed parts feed a quote.
import { z } from "zod";
import type { ExtractedField } from "./enums";

const MAX_TEXT = 500;

export const extractedFieldSchema = z.object({
  value: z.string().max(MAX_TEXT).nullable(),
  quote: z.string().max(MAX_TEXT).nullable(),
});
export type ExtractedFieldValue = z.infer<typeof extractedFieldSchema>;

export const llmExtractionSchema = z.object({
  customer: z.object({
    company: extractedFieldSchema,
    contactName: extractedFieldSchema,
    email: extractedFieldSchema,
  }),
  parts: z
    .array(
      z.object({
        partNumber: extractedFieldSchema,
        revision: extractedFieldSchema,
        description: extractedFieldSchema,
        material: extractedFieldSchema,
        quantities: z.object({
          values: z.array(z.number().int().min(1).max(1_000_000)).max(8),
          quote: z.string().max(MAX_TEXT).nullable(),
        }),
        tolerances: extractedFieldSchema,
        finish: extractedFieldSchema,
        /** ISO date YYYY-MM-DD as the RFQ states it; null when no date is given. */
        dueDate: extractedFieldSchema,
      }),
    )
    .max(50),
  /** Information a quote needs that the RFQ does not give (asked of the customer, never guessed). */
  missingInfo: z.array(z.string().max(300)).max(20),
});
export type LlmExtraction = z.infer<typeof llmExtractionSchema>;

export type FieldStatus = "verified" | "dropped" | "absent";

export interface FieldSource {
  quote: string | null;
  status: FieldStatus;
}

export interface VerifiedPart {
  partNumber: string | null;
  revision: string | null;
  description: string | null;
  materialText: string | null;
  quantities: number[];
  tolerances: string | null;
  finishText: string | null;
  dueDate: string | null;
  sources: Partial<Record<ExtractedField, FieldSource>>;
}

export interface VerifiedExtraction {
  customer: { company: string | null; contactName: string | null; email: string | null };
  parts: VerifiedPart[];
  missingInfo: string[];
  warnings: string[];
}

/** Lower-case, collapse whitespace, unify dashes/quotes so copy-paste differences don't matter. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Canonical numeric token: "0.005" and ".005" compare equal; nothing else is loosened. */
const canon = (t: string) => t.replace(/(^|[^0-9])0+(?=\.\d)/g, "$1");

/** Tokens containing a digit: "6061-T6" -> ["6061-t6"], "±.005" -> [".005"], "2026-12-05" -> [...]. */
export function digitTokens(s: string): string[] {
  return (normalize(s).match(/[a-z0-9.\-/#]*\d[a-z0-9.\-/#]*/g) ?? []).map((t) =>
    // Keep a leading "." before a digit (".005" must not match inside "1005").
    canon(t.replace(/^[-/#]+|^\.+(?!\d)|[.\-/#]+$/g, "")),
  );
}

/**
 * A value's digit token is supported when it EQUALS a digit token of the quote, or one of that
 * token's dash/slash segments ("6061" from "6061-T6"). Never by substring: "ABC-10" is not in
 * "ABC-100", and "0.05" is not ".005".
 */
function tokenSupported(t: string, quoteTokens: string[]): boolean {
  return quoteTokens.some((q) => q === t || q.split(/[-/]/).includes(t));
}

/** Words of 3+ letters: every one in a value must appear in its quote (same 5-letter stem is ok). */
const words = (s: string) => normalize(s).match(/[a-z]{3,}/g) ?? [];

function wordsSupported(value: string, quote: string): string | null {
  const have = new Set(words(quote));
  const stems = new Set([...have].map((w) => w.slice(0, 5)));
  for (const w of words(value)) {
    if (!have.has(w) && !(w.length >= 5 && stems.has(w.slice(0, 5)))) return w;
  }
  return null;
}

/** `needle` occurs in `hay` as a whole token (not inside a longer word or number). */
function containsWhole(hay: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(hay);
}

/**
 * Integers stated as quantities in a text ("Qty: 10, 50, 1,000 pcs"). Numbers inside part numbers
 * or grades ("12345-500", "6061") or after "rev" don't count.
 */
export function integersIn(s: string): Set<number> {
  const out = new Set<number>();
  const text = normalize(s);
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) {
    const i = m.index ?? 0;
    const before = text.slice(0, i);
    const after = text.slice(i + m[0].length);
    if (/[a-z0-9.\-/#_]$/.test(before) || /^[a-z0-9.\-/#_]/.test(after)) {
      // part of a longer token; allow unit suffixes "100pcs"/"50ea"/"10x"
      if (!/^(pcs?|ea|x)\b/.test(after) || /[a-z0-9.\-/#_]$/.test(before)) continue;
    }
    if (/\brev(ision)?\.?\s*#?\s*$/.test(before)) continue;
    out.add(Number(m[0].replace(/,/g, "")));
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Every complete date (with a year) the quote states, as ISO strings. */
export function datesIn(quote: string): Set<string> {
  const q = normalize(quote);
  const out = new Set<string>();
  const add = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (isRealDate(y, m, d)) out.add(iso(y, m, d));
  };
  for (const m of q.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  for (const m of q.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    add(Number(m[3]), Number(m[1]), Number(m[2])); // US month/day/year
  }
  const mon = `(${MONTHS.join("|")})[a-z]*\\.?`;
  for (const m of q.matchAll(
    new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "g"),
  )) {
    add(Number(m[3]), MONTHS.indexOf(m[1] ?? "") + 1, Number(m[2]));
  }
  for (const m of q.matchAll(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon},?\\s+(\\d{4})\\b`, "g"),
  )) {
    add(Number(m[3]), MONTHS.indexOf(m[2] ?? "") + 1, Number(m[1]));
  }
  return out;
}

/** Fields whose whole value must appear verbatim in the quote (identifiers, names). */
const EXACT_FIELDS = new Set(["partNumber", "revision", "company", "contactName", "email"]);

type VerifiedFieldName = ExtractedField | "company" | "contactName" | "email";

function verifyField(
  field: VerifiedFieldName,
  f: ExtractedFieldValue,
  source: string,
  warnings: string[],
  label: string,
): { value: string | null; src: FieldSource } {
  const value = f.value?.trim() ? f.value.trim() : null;
  if (value === null) return { value: null, src: { quote: null, status: "absent" } };
  const quote = f.quote?.trim() ? f.quote.trim() : null;
  const drop = (why: string) => {
    warnings.push(`${label}: ${field} "${value}" was dropped (${why}); enter it by hand`);
    return { value: null, src: { quote, status: "dropped" as const } };
  };
  if (!quote) return drop("no source quote");
  const nq = normalize(quote);
  if (!source.includes(nq)) return drop("quote not found in the RFQ");
  if (field === "dueDate") {
    if (!datesIn(quote).has(value)) return drop("the quote does not state this date");
    return { value, src: { quote, status: "verified" } };
  }
  if (EXACT_FIELDS.has(field)) {
    if (!containsWhole(nq, normalize(value))) return drop("it is not written in the quote");
    return { value, src: { quote, status: "verified" } };
  }
  const quoteTokens = digitTokens(quote);
  for (const t of digitTokens(value)) {
    if (!tokenSupported(t, quoteTokens)) return drop(`"${t}" is not in the quote`);
  }
  const missingWord = wordsSupported(value, quote);
  if (missingWord) return drop(`"${missingWord}" is not in the quote`);
  return { value, src: { quote, status: "verified" } };
}

/** Apply the anti-fabrication rules to raw LLM output. `sourceText` is the full RFQ text. */
export function verifyExtraction(raw: LlmExtraction, sourceText: string): VerifiedExtraction {
  const source = normalize(sourceText);
  const warnings: string[] = [];
  const c = raw.customer;
  const company = verifyField("company", c.company, source, warnings, "Customer");
  const contact = verifyField("contactName", c.contactName, source, warnings, "Customer");
  const email = verifyField("email", c.email, source, warnings, "Customer");

  const parts = raw.parts.map((p, i): VerifiedPart => {
    const label = `Part ${i + 1}${p.partNumber.value ? ` (${p.partNumber.value})` : ""}`;
    const sources: VerifiedPart["sources"] = {};
    const take = (field: ExtractedField, f: ExtractedFieldValue) => {
      const r = verifyField(field, f, source, warnings, label);
      sources[field] = r.src;
      return r.value;
    };
    const partNumber = take("partNumber", p.partNumber);
    const revision = take("revision", p.revision);
    const description = take("description", p.description);
    const materialText = take("material", p.material);
    const tolerances = take("tolerances", p.tolerances);
    const finishText = take("finish", p.finish);
    const dueDate = take("dueDate", p.dueDate);

    let quantities: number[] = [];
    const qQuote = p.quantities.quote?.trim() || null;
    if (p.quantities.values.length > 0) {
      if (qQuote && source.includes(normalize(qQuote))) {
        const nums = integersIn(qQuote);
        quantities = [...new Set(p.quantities.values)].filter((q) => nums.has(q));
        const lost = p.quantities.values.filter((q) => !nums.has(q));
        if (lost.length > 0) {
          warnings.push(`${label}: quantities ${lost.join(", ")} are not in the quote; dropped`);
        }
        sources.quantities = { quote: qQuote, status: quantities.length ? "verified" : "dropped" };
      } else {
        warnings.push(`${label}: quantities were dropped (quote not found in the RFQ)`);
        sources.quantities = { quote: qQuote, status: "dropped" };
      }
    } else {
      sources.quantities = { quote: null, status: "absent" };
    }
    quantities.sort((a, b) => a - b);

    return {
      partNumber,
      revision,
      description,
      materialText,
      quantities,
      tolerances,
      finishText,
      dueDate,
      sources,
    };
  });

  return {
    customer: { company: company.value, contactName: contact.value, email: email.value },
    parts,
    missingInfo: raw.missingInfo.map((s) => s.trim()).filter(Boolean),
    warnings,
  };
}

/**
 * Suggest the rate-card material for an RFQ's material text. Deterministic: a candidate must share
 * an alloy/grade token with a digit ("6061", "304", "17-4", "a36"); ties broken by shared words.
 * Returns null when nothing matches. The estimator always confirms the choice.
 */
export function matchMaterial(
  text: string | null,
  materials: { id: string; name: string }[],
): string | null {
  if (!text) return null;
  const want = new Set(digitTokens(text).flatMap(splitGrade));
  if (want.size === 0) return null;
  const words = new Set(
    normalize(text)
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3),
  );
  let best: { id: string; score: number } | null = null;
  for (const m of materials) {
    const have = new Set(digitTokens(m.name).flatMap(splitGrade));
    const gradeHits = [...want].filter((t) => have.has(t)).length;
    if (gradeHits === 0) continue;
    const wordHits = normalize(m.name)
      .split(/[^a-z]+/)
      .filter((w) => words.has(w)).length;
    const score = gradeHits * 10 + wordHits;
    if (!best || score > best.score) best = { id: m.id, score };
  }
  return best?.id ?? null;
}

/** "6061-t6" -> ["6061-t6", "6061", "t6"] so "6061" on the rate card matches "6061-T6" in an RFQ. */
function splitGrade(t: string): string[] {
  const parts = t.split(/[-/]/).filter((p) => p.length >= 2 && /\d/.test(p));
  return [...new Set([t, ...parts])];
}

const GENERIC_FINISH_WORDS = new Set(["type", "class", "spec", "per", "with", "finish", "coat"]);

/** Suggest finishing ops whose distinctive words appear in the RFQ's finish text. */
export function matchFinishingOps(
  text: string | null,
  ops: { id: string; name: string }[],
): string[] {
  if (!text) return [];
  const have = new Set(normalize(text).split(/[^a-z]+/));
  // "anodize" also matches "anodized"/"anodizing" via a 6-letter stem.
  const stems = new Set([...have].filter((w) => w.length >= 6).map((w) => w.slice(0, 6)));
  return ops
    .filter((op) =>
      normalize(op.name)
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !GENERIC_FINISH_WORDS.has(w))
        .some((w) => have.has(w) || (w.length >= 6 && stems.has(w.slice(0, 6)))),
    )
    .map((op) => op.id);
}

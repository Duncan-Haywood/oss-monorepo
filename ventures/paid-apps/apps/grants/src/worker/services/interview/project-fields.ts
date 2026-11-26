// Deterministic guardrails for LLM-proposed project fields: a field is accepted only when its
// quote appears verbatim in a respondent statement and every number in the value is in the quote.
import { normalizeUntrustedText } from "../safety/untrusted";
import type { ProjectFieldKey, ProjectFieldsOutput, RespondentStatement } from "./prompts";

export interface ProjectFieldUpdates {
  summary?: string;
  problem?: string;
  approach?: string;
  populationServed?: string;
  location?: string;
  budgetNeededCents?: number;
  timelineStart?: string;
  timelineEnd?: string;
}

export interface AcceptedField {
  field: ProjectFieldKey;
  value: string;
  quote: string;
  turnId: string;
}

/** NFKC + invisible-character removal match what the model was shown (safety/untrusted.ts). */
export function normalizeForMatch(s: string): string {
  return normalizeUntrustedText(s)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Digit groups in a string, with thousands separators removed: "$1,250.50 in 2025" -> ["1250.50","2025"]. */
export function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, ""));
}

/** "$250,000" | "$250k" | "$1.2 million" | "250 thousand dollars" -> cents; null if no amount. */
export function parseMoneyToCents(s: string): number | null {
  const m = s.toLowerCase().match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million|mm)?\b/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult =
    m[2] === "k" || m[2] === "thousand"
      ? 1_000
      : m[2] === "m" || m[2] === "mm" || m[2] === "million"
        ? 1_000_000
        : 1;
  const cents = Math.round(n * mult * 100);
  return cents > 0 ? cents : null;
}

/** Every amount in `s` as cents ("$80k now, $1.2 million total" -> [8_000_000, 120_000_000]). */
export function moneyAmountsInCents(s: string): number[] {
  const out: number[] = [];
  for (const m of s
    .toLowerCase()
    .matchAll(/\d[\d,]*(?:\.\d+)?\s*(?:k|m|thousand|million|mm)?\b/g)) {
    const cents = parseMoneyToCents(m[0]);
    if (cents !== null) out.push(cents);
  }
  return out;
}

export function validateProjectFields(
  output: ProjectFieldsOutput,
  emptyFields: ProjectFieldKey[],
  statements: RespondentStatement[],
): { updates: ProjectFieldUpdates; accepted: AcceptedField[] } {
  const allowed = new Set(emptyFields);
  const updates: ProjectFieldUpdates = {};
  const accepted: AcceptedField[] = [];
  const normStatements = statements.map((s) => ({ ...s, norm: normalizeForMatch(s.text) }));

  for (const f of output.fields) {
    if (!allowed.has(f.field) || accepted.some((a) => a.field === f.field)) continue;
    const value = f.value.trim();
    const quote = normalizeForMatch(f.quote);
    if (!value || quote.length < 3) continue;
    const source = normStatements.find((s) => s.norm.includes(quote));
    if (!source) continue;
    const quoteNumbers = new Set(numbersIn(f.quote));
    if (numbersIn(value).some((n) => !quoteNumbers.has(n))) continue;

    switch (f.field) {
      case "budgetNeeded": {
        const cents = parseMoneyToCents(value);
        // The digits alone are not enough: "$250 million" from a quote saying "$250" must not pass.
        if (cents === null || !moneyAmountsInCents(f.quote).includes(cents)) continue;
        updates.budgetNeededCents = cents;
        break;
      }
      case "timelineStart":
      case "timelineEnd":
        if (!quote.includes(normalizeForMatch(value)) || value.length > 60) continue;
        updates[f.field] = value;
        break;
      default:
        updates[f.field] = value.slice(0, 2000);
    }
    accepted.push({ field: f.field, value, quote: f.quote, turnId: source.turnId });
  }
  return { updates, accepted };
}

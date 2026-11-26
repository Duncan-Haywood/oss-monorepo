// Fact staleness, shared by the worker (update-interview agenda, check-in nudges) and the UI
// (the "as of 2024 — may be outdated" indicator). Pure: no runtime dependencies.
import type { FactCategory, FactStatus } from "./enums";

const DAY_MS = 86_400_000;
/** A topic whose newest confirmed fact is older than this needs a check-in. */
export const STALE_TOPIC_MONTHS = 6;
/** An undated confirmed fact nobody has vouched for in this long may be outdated. */
export const STALE_UNDATED_MONTHS = 12;
/** "Confirm still true" keeps a fact fresh for this long. */
export const STILL_TRUE_MONTHS = 6;
/** The "What's new?" nudge appears when the last update is older than this. */
export const CHECK_IN_AFTER_DAYS = 30;

/** Categories whose facts describe a period (counts, budgets, people) and go out of date. */
export const TIME_SENSITIVE_CATEGORIES: readonly FactCategory[] = [
  "program",
  "population_served",
  "outcome",
  "metric",
  "financial",
  "staff",
  "governance",
  "partner",
  "capacity",
  "project",
];

export interface StalenessInput {
  category: FactCategory;
  status: FactStatus;
  asOf: string | null;
  confirmedAt?: string | Date | null;
  lastConfirmedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface Staleness {
  reason: "dated" | "unconfirmed_long";
  /** e.g. "as of 2024 — may be outdated" */
  label: string;
}

const toMs = (d: string | Date | null | undefined): number | null => {
  if (!d) return null;
  const ms = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
};

export const monthsAgo = (now: Date, months: number) => now.getTime() - months * 30.44 * DAY_MS;

/** The year an asOf refers to ("2025", "FY2024", "2026-06-30" → 2025, 2024, 2026), or null. */
export function asOfYear(asOf: string | null | undefined): number | null {
  const m = asOf ? /\b(19\d{2}|20\d{2})\b/.exec(asOf.replace(/fy/i, " ")) : null;
  return m?.[1] ? Number(m[1]) : null;
}

/** Comparable sort key for an asOf ("2025" < "2025-06-30" < "2026"); null when undated. */
export function asOfKey(asOf: string | null | undefined): string | null {
  const year = asOfYear(asOf);
  if (year == null || !asOf) return null;
  const iso = /\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/.exec(asOf);
  if (iso?.[1] && Number(iso[1]) === year) return `${iso[1]}-${iso[2]}-${iso[3] ?? "00"}`;
  // A bare year sorts after every date inside that year: "2025" ≈ "as of the end of 2025".
  return `${year}-99-99`;
}

/** When a human last vouched for the fact (still-true bump, or confirmation). */
export function lastVouchedMs(f: StalenessInput): number | null {
  const a = toMs(f.lastConfirmedAt);
  const b = toMs(f.confirmedAt);
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Null when the fact looks current. A time-sensitive fact is stale when its asOf year is before
 * the current year (last year's enrollment, budget, outcomes), or when it is undated and nobody
 * has confirmed it in STALE_UNDATED_MONTHS. "Confirm still true" (lastConfirmedAt) within
 * STILL_TRUE_MONTHS clears both.
 */
export function factStaleness(f: StalenessInput, now: Date): Staleness | null {
  if (f.status !== "confirmed" && f.status !== "proposed") return null;
  if (!TIME_SENSITIVE_CATEGORIES.includes(f.category)) return null;
  const stillTrue = toMs(f.lastConfirmedAt);
  if (stillTrue != null && stillTrue >= monthsAgo(now, STILL_TRUE_MONTHS)) return null;
  const year = asOfYear(f.asOf);
  if (year != null) {
    return year < now.getUTCFullYear()
      ? { reason: "dated", label: `as of ${f.asOf?.trim() || year} — may be outdated` }
      : null;
  }
  if (f.status !== "confirmed") return null;
  const vouched = lastVouchedMs(f) ?? toMs(f.createdAt);
  if (vouched == null || vouched >= monthsAgo(now, STALE_UNDATED_MONTHS)) return null;
  const d = new Date(vouched);
  return {
    reason: "unconfirmed_long",
    label: `last confirmed ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} — may be outdated`,
  };
}

/** Whole days since `last` (null = never). */
export function daysSince(last: string | Date | null | undefined, now: Date): number | null {
  const ms = toMs(last);
  return ms == null ? null : Math.floor((now.getTime() - ms) / DAY_MS);
}

/** True when the org should be nudged for a "What's new?" check-in. */
export function checkInDue(lastUpdateAt: string | Date | null | undefined, now: Date): boolean {
  const days = daysSince(lastUpdateAt, now);
  return days == null || days > CHECK_IN_AFTER_DAYS;
}

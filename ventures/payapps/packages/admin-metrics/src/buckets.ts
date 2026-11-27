// UTC day and ISO-week series for sign-up charts. Every day in the window appears (zero-filled):
// these are counts of rows that exist, so a 0 is a measured zero.
import type { DayCount, WeekCount } from "./contract.ts";

const DAY_MS = 86_400_000;

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Start (00:00 UTC) of the first day of a `days`-long window ending today. */
export function windowStart(now: Date, days: number): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

/** Monday 00:00 UTC of the ISO week containing `d`. */
export function weekStart(d: Date): Date {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day - dow * DAY_MS);
}

export interface Stamp {
  at: Date;
  verified?: boolean | null;
}

/** Zero-filled per-day counts for the `days` days ending today (UTC). */
export function dayBuckets(
  stamps: Stamp[],
  now: Date,
  days: number,
  trackVerified = true,
): DayCount[] {
  const start = windowStart(now, days).getTime();
  const out: DayCount[] = Array.from({ length: days }, (_, i) => ({
    day: utcDay(new Date(start + i * DAY_MS)),
    total: 0,
    verified: trackVerified ? 0 : null,
  }));
  for (const s of stamps) {
    const i = Math.floor((s.at.getTime() - start) / DAY_MS);
    const b = out[i];
    if (!b) continue;
    b.total++;
    if (trackVerified && s.verified && b.verified !== null) b.verified++;
  }
  return out;
}

/** Zero-filled per-ISO-week counts for the `weeks` weeks ending with the current one. */
export function weekBuckets(
  stamps: Stamp[],
  now: Date,
  weeks: number,
  trackVerified = true,
): WeekCount[] {
  const last = weekStart(now).getTime();
  const first = last - (weeks - 1) * 7 * DAY_MS;
  const out: WeekCount[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: utcDay(new Date(first + i * 7 * DAY_MS)),
    total: 0,
    verified: trackVerified ? 0 : null,
  }));
  for (const s of stamps) {
    const i = Math.floor((s.at.getTime() - first) / (7 * DAY_MS));
    const b = out[i];
    if (!b) continue;
    b.total++;
    if (trackVerified && s.verified && b.verified !== null) b.verified++;
  }
  return out;
}

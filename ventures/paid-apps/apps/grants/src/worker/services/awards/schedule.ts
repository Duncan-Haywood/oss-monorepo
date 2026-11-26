// Pure date logic for post-award reporting: default report schedules, reminder dates, report
// periods vs a fact's "as of", and the award fact's wording. No I/O.
import type { AwardReportKind } from "@shared/api/awards";

const DAY = 24 * 60 * 60 * 1000;

/** Days before a report's due date at which a report_due follow-up fires. */
export const REPORT_REMINDER_DAYS = [30, 14, 3] as const;
/** The final report is due this many days after the grant period ends. */
export const FINAL_REPORT_GRACE_DAYS = 30;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-03-01" -> Date at 00:00 UTC; null for anything that isn't a real calendar date. */
export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || !ISO_DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

/** A project's free-text timeline ("2026-01-15", "Fall 2027") as a date, only when it is one. */
export function isoDateOrNull(s: string | null | undefined): string | null {
  const t = s?.trim() ?? "";
  return parseIsoDate(t) ? t : null;
}

export interface ScheduledReport {
  kind: AwardReportKind;
  periodStart: string;
  periodEnd: string;
  dueAt: Date;
}

/**
 * Default schedule for a grant period: an interim report covering the first half, due at the
 * midpoint, and a final report covering the whole period, due 30 days after it ends. Grants of
 * under 60 days get only the final report. Null dates (or an end before the start) give none.
 */
export function defaultReportSchedule(
  startDate: string | null,
  endDate: string | null,
): ScheduledReport[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || !startDate || !endDate || end.getTime() < start.getTime()) return [];
  const out: ScheduledReport[] = [];
  const spanDays = Math.round((end.getTime() - start.getTime()) / DAY);
  if (spanDays >= 60) {
    const mid = addDays(start, Math.floor(spanDays / 2));
    out.push({ kind: "interim", periodStart: startDate, periodEnd: toIsoDate(mid), dueAt: mid });
  }
  out.push({
    kind: "final",
    periodStart: startDate,
    periodEnd: endDate,
    dueAt: addDays(end, FINAL_REPORT_GRACE_DAYS),
  });
  return out;
}

/** Reminder dates (due − 30/14/3 days) still in the future. */
export function reminderDates(dueAt: Date, now: Date): { days: number; at: Date }[] {
  return REPORT_REMINDER_DAYS.map((days) => ({ days, at: addDays(dueAt, -days) })).filter(
    (r) => r.at.getTime() > now.getTime(),
  );
}

/**
 * The calendar range a fact's free-text "as of" covers: "2026-05-31" (a day), "2026-05" (a
 * month), "2026", "FY2026" or "2025-26" (a year / fiscal year, read as calendar years). Null when
 * it names no recognisable date.
 */
export function asOfRange(asOf: string | null | undefined): { start: string; end: string } | null {
  const t = (asOf ?? "").trim();
  if (!t) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (day) return parseIsoDate(t) ? { start: t, end: t } : null;
  const month = /^(\d{4})-(\d{2})$/.exec(t);
  const m = Number(month?.[2]);
  if (month && m >= 1 && m <= 12) {
    const last = new Date(Date.UTC(Number(month[1]), m, 0)).getUTCDate();
    return { start: `${month[1]}-${month[2]}-01`, end: `${month[1]}-${month[2]}-${last}` };
  }
  const span = /^(?:FY\s?)?(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/i.exec(t);
  if (span?.[1] && span[2]) {
    const y1 = span[1];
    const y2 = span[2].length === 2 ? `${y1.slice(0, 2)}${span[2]}` : span[2];
    if (Number(y2) < Number(y1)) return null;
    return { start: `${y1}-01-01`, end: `${y2}-12-31` };
  }
  const year = /^(?:FY\s?)?(\d{4})$/i.exec(t);
  if (year) return { start: `${year[1]}-01-01`, end: `${year[1]}-12-31` };
  return null;
}

/** True when the fact's "as of" range overlaps the report period (both ends inclusive). */
export function asOfInPeriod(
  asOf: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): boolean {
  const r = asOfRange(asOf);
  return !!r && r.start <= periodEnd && r.end >= periodStart;
}

/** True when the fact's "as of" range starts on or before the period end (or it has none). */
export function asOfNotAfter(asOf: string | null | undefined, periodEnd: string): boolean {
  if (!asOf?.trim()) return true;
  const r = asOfRange(asOf);
  return !r || r.start <= periodEnd;
}

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })}`;

/** "Awarded $50,000 by Acme Foundation in 2026 for Youth Pathways." */
export function awardFactStatement(a: {
  amountCents: number | null;
  funderName: string;
  year: number;
  title: string;
}): string {
  const what = a.amountCents && a.amountCents > 0 ? usd(a.amountCents) : "a grant";
  const title = a.title.trim().replace(/[.\s]+$/, "");
  return `Awarded ${what} by ${a.funderName.trim()} in ${a.year} for ${title}.`;
}

export const REPORT_KIND_LABEL: Record<AwardReportKind, string> = {
  interim: "Interim report",
  final: "Final report",
  financial: "Financial report",
  other: "Report",
};

/** "January 1, 2026 – June 30, 2026" */
export function formatPeriod(start: string, end: string): string {
  const f = (s: string) => {
    const d = parseIsoDate(s);
    return d
      ? d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })
      : s;
  };
  return `${f(start)} – ${f(end)}`;
}

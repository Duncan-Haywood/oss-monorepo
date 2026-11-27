// Texas notices of claim (Tex. Prop. Code § 53.056) read from the job's pay apps: every month a sent
// pay app with a balance covers is a month of "unpaid labor or materials", and each such month needs
// its own notice to the owner or reputed owner and the original contractor by the 15th day of the
// third month after it (second, residential), moved past weekends and legal holidays (§ 53.003(e)).
// A pay app's period can straddle two months; both get a notice date, since the earlier month's comes
// first. The balance is not split by month: the notice's claim amount is the user's to state.
// The cash page and the weekly email carry the reminder (src/shared/cash-report.ts). Not legal advice.
//
// Retainage (part 3, 2026-11-27): the § 53.057 notice of claim for unpaid retainage is due 30 days
// after this company's contract is completed, terminated or abandoned, or, if sooner, 30 days after
// the original contract is terminated or abandoned (a completed original contract does not start it).
// The lien affidavit for retainage is due the 15th day of the third month after the month the
// original contract was completed, terminated or abandoned (§ 53.052(d)). Both come from dates the
// contractor saves on the job (PayApps cannot know when a contract ends), and both remind only while
// the job's pay apps show retainage held.
import {
  TX_NOTICE_RECIPIENTS,
  type TxDeadline,
  type TxNoticeKind,
  type TxNoticeRecipient,
  txMonthlyNoticeDue,
  txRetainageAffidavitDue,
  txRetainageNoticeDue,
} from "@lien-waivers/tx-dates";
import { formatCents } from "./money";

/** A pay app's balance as the cash report reads it. */
export interface TxAppBalance {
  number: number;
  /** Drafts are not billed yet and are left out. */
  sent: boolean;
  periodFrom: string;
  periodTo: string;
  remainingCents: number;
}

export interface TxSendFacts {
  kind: TxNoticeKind;
  workMonth: string | null;
  recipient: TxNoticeRecipient;
}

export interface TxUnpaidMonth {
  workMonth: string;
  payAppNumbers: number[];
  unpaidCents: number;
  statutory: string;
  dueOn: string;
  holidays: string[];
  missing: TxNoticeRecipient[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM months from `from`'s month to `to`'s, both included (at most 12). */
function monthsOf(from: string, to: string): string[] {
  const a = from.slice(0, 7);
  const b = to.slice(0, 7);
  if (!MONTH.test(a) || !MONTH.test(b) || b < a) return MONTH.test(b) ? [b] : [];
  const out: string[] = [];
  let [y, m] = a.split("-").map(Number) as [number, number];
  for (let i = 0; i < 12; i++) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    out.push(cur);
    if (cur === b) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The months the job's sent pay apps leave unpaid, oldest first, with who still needs a notice. */
export function txUnpaidMonths(
  apps: readonly TxAppBalance[],
  sends: readonly TxSendFacts[],
  residential: boolean,
): TxUnpaidMonth[] {
  const byMonth = new Map<string, { numbers: Set<number>; cents: number }>();
  for (const a of apps) {
    if (!a.sent || a.remainingCents <= 0) continue;
    for (const month of monthsOf(a.periodFrom, a.periodTo)) {
      const e = byMonth.get(month) ?? { numbers: new Set<number>(), cents: 0 };
      if (!e.numbers.has(a.number)) {
        e.numbers.add(a.number);
        e.cents += a.remainingCents;
      }
      byMonth.set(month, e);
    }
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([workMonth, e]) => {
      const due = txMonthlyNoticeDue(workMonth, residential);
      const have = new Set(
        sends
          .filter((s) => s.kind === "labor-materials" && s.workMonth === workMonth)
          .map((s) => s.recipient),
      );
      return {
        workMonth,
        payAppNumbers: [...e.numbers].sort((x, y) => x - y),
        unpaidCents: e.cents,
        statutory: due.statutory,
        dueOn: due.due,
        holidays: due.holidays,
        missing: TX_NOTICE_RECIPIENTS.filter((r) => !have.has(r)),
      };
    });
}

/** A reminder starts this many days before a month's notice date. */
export const TX_REMINDER_DAYS_BEFORE = 30;
/** And a missed notice is mentioned for this many days after it, then dropped. */
export const TX_MISSED_DAYS_AFTER = 30;
/** At most this many months get a sentence on one job. */
export const TX_MAX_REMINDERS = 3;

const DAY_MS = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export function txMonthName(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const WHO: Record<TxNoticeRecipient, string> = {
  owner: "the owner",
  "original-contractor": "the original contractor",
};

/**
 * The cash page's (and the weekly email's) sentences for a Texas job: each unpaid month whose notice
 * is due within TX_REMINDER_DAYS_BEFORE days, or was missed within TX_MISSED_DAYS_AFTER, and is not
 * recorded for both recipients. Soonest first, at most TX_MAX_REMINDERS.
 */
export function txNoticeTexts(months: readonly TxUnpaidMonth[], asOf: string): string[] {
  const out: string[] = [];
  for (const m of months) {
    if (m.missing.length === 0) continue;
    const left = days(asOf, m.dueOn);
    if (left > TX_REMINDER_DAYS_BEFORE || left < -TX_MISSED_DAYS_AFTER) continue;
    const who = m.missing.map((r) => WHO[r]).join(" and ");
    const apps = m.payAppNumbers.length === 1 ? "pay app" : "pay apps";
    const what = `${txMonthName(m.workMonth)} work (${apps} ${m.payAppNumbers.join(", ")}, ${formatCents(m.unpaidCents)} unpaid)`;
    const rolled = m.holidays.length ? `, moved past ${m.holidays.join(" and ")}` : "";
    if (left >= 0) {
      const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
      out.push(
        `Texas notice of claim for ${what} is due ${when}, by ${m.dueOn}${rolled}, and none is recorded for ${who}. Mailed by certified mail, it complies the day it is deposited (Tex. Prop. Code § 53.003(c)); without it the lien for that month's work is not valid (§ 53.056(a)).`,
      );
    } else {
      out.push(
        `Texas notice of claim for ${what} was due ${m.dueOn} and none is recorded for ${who}. Without it the lien for that month's work is not valid (Tex. Prop. Code § 53.056(a)); if you sent one, record it on the job.`,
      );
    }
  }
  return out.slice(0, TX_MAX_REMINDERS);
}

/** How the original contract ended (§§ 53.052(d), 53.057(a-1)(2)). */
export const TX_ORIGINAL_ENDED_HOW = ["completed", "terminated", "abandoned"] as const;
export type TxOriginalEndedHow = (typeof TX_ORIGINAL_ENDED_HOW)[number];

/** The dates a Texas job saves for its retainage deadlines. */
export interface TxRetainageDates {
  /** YYYY-MM-DD this company's contract was completed, terminated or abandoned. */
  contractEndedOn: string | null;
  /** YYYY-MM-DD the original contract (the GC's) was completed, terminated or abandoned. */
  originalEndedOn: string | null;
  originalEndedHow: TxOriginalEndedHow | null;
}

export interface TxRetainageDeadlines {
  /** § 53.057(a-1): null until a date that starts it is saved. */
  notice: (TxDeadline & { basis: "claimant" | "original"; missing: TxNoticeRecipient[] }) | null;
  /** § 53.052(d): null until the original contract's end is saved. */
  affidavit: TxDeadline | null;
}

/**
 * The retainage notice and affidavit dates from the saved dates, with who has no retainage notice
 * recorded. Dates that do not parse give null rather than an error (the API checks them on save).
 */
export function txRetainageDeadlines(
  dates: TxRetainageDates,
  sends: readonly TxSendFacts[],
): TxRetainageDeadlines {
  const have = new Set(sends.filter((s) => s.kind === "retainage").map((s) => s.recipient));
  const missing = TX_NOTICE_RECIPIENTS.filter((r) => !have.has(r));
  const ended = dates.originalEndedOn && dates.originalEndedHow ? dates.originalEndedOn : null;
  // Only a terminated or abandoned original contract starts § 53.057(a-1)(2).
  const cut = ended && dates.originalEndedHow !== "completed" ? ended : null;
  let notice: TxRetainageDeadlines["notice"] = null;
  let affidavit: TxDeadline | null = null;
  try {
    if (dates.contractEndedOn) {
      const d = txRetainageNoticeDue(dates.contractEndedOn, cut ?? undefined);
      const own = txRetainageNoticeDue(dates.contractEndedOn);
      notice = { ...d, basis: d.statutory < own.statutory ? "original" : "claimant", missing };
    } else if (cut) {
      notice = { ...txRetainageNoticeDue(cut), basis: "original", missing };
    }
  } catch {
    notice = null;
  }
  try {
    if (ended) affidavit = txRetainageAffidavitDue(ended.slice(0, 7));
  } catch {
    affidavit = null;
  }
  return { notice, affidavit };
}

/** The retainage reminder starts this many days before the lien affidavit's date. */
export const TX_AFFIDAVIT_REMINDER_DAYS = 30;

/**
 * The cash page's (and the weekly email's) sentences for a Texas job's retainage, while retainage is
 * held: the § 53.057 notice from the day its start is saved until 30 days after a missed date, while
 * a recipient has none recorded; and the § 53.052(d) affidavit in the 30 days up to its date.
 */
export function txRetainageTexts(
  d: TxRetainageDeadlines,
  retainageHeldCents: number,
  asOf: string,
): string[] {
  if (retainageHeldCents <= 0) return [];
  const held = formatCents(retainageHeldCents);
  const out: string[] = [];
  const n = d.notice;
  if (n && n.missing.length > 0) {
    const left = days(asOf, n.due);
    const who = n.missing.map((r) => WHO[r]).join(" and ");
    const from =
      n.basis === "original"
        ? "the original contract was terminated or abandoned"
        : "your contract ended";
    const rolled = n.holidays.length ? `, moved past ${n.holidays.join(" and ")}` : "";
    if (left >= 0) {
      const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
      out.push(
        `Texas notice of claim for unpaid retainage (${held} held) is due ${when}, by ${n.due}${rolled}, 30 days after ${from}, and none is recorded for ${who}. Unless the retainage was already claimed in a monthly notice, the retainage lien is not valid without it (Tex. Prop. Code § 53.057(a), (a-1)).`,
      );
    } else if (left >= -TX_MISSED_DAYS_AFTER) {
      out.push(
        `Texas notice of claim for unpaid retainage (${held} held) was due ${n.due} and none is recorded for ${who}. Unless the retainage was claimed in a monthly notice, the retainage lien is not valid without it (Tex. Prop. Code § 53.057(a)); if you sent one, record it on the job.`,
      );
    }
  }
  const a = d.affidavit;
  if (a) {
    const left = days(asOf, a.due);
    if (left >= 0 && left <= TX_AFFIDAVIT_REMINDER_DAYS) {
      const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
      out.push(
        `Texas lien affidavit for retainage (${held} held): if the retainage is still unpaid, the affidavit must be filed with the county clerk ${when}, by ${a.due} (Tex. Prop. Code § 53.052(d)), and notice of it sent as § 53.055 requires.`,
      );
    }
  }
  return out;
}

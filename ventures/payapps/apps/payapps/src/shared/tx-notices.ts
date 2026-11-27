// Texas notices of claim (Tex. Prop. Code § 53.056) read from the job's pay apps: every month a sent
// pay app with a balance covers is a month of "unpaid labor or materials", and each such month needs
// its own notice to the owner or reputed owner and the original contractor by the 15th day of the
// third month after it (second, residential), moved past weekends and legal holidays (§ 53.003(e)).
// A pay app's period can straddle two months; both get a notice date, since the earlier month's comes
// first. The balance is not split by month: the notice's claim amount is the user's to state.
// The cash page and the weekly email carry the reminder (src/shared/cash-report.ts). Not legal advice.
import {
  TX_NOTICE_RECIPIENTS,
  type TxNoticeKind,
  type TxNoticeRecipient,
  txMonthlyNoticeDue,
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

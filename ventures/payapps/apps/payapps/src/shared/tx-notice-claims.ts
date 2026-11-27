// Texas notices of claim for unpaid labor or materials (Tex. Prop. Code § 53.056), read from the
// job's pay applications. A Texas subcontractor or supplier must send one to the owner and the
// original contractor "not later than the 15th day of the third month after the month during which"
// the work was provided (the second month on a residential construction project), or its lien for
// that work is not valid. PayApps already knows which applications are unpaid and which months they
// bill, so on a job marked as Texas (projects.tx_project_kind) each unpaid application gets its date:
// the earliest month its period touches (packages/lien-waivers, txPeriodDeadline), since one notice
// sent by then can claim the whole application. The cash page and the weekly email remind from
// TX_REMIND_DAYS before that date until a notice is recorded on the application or it is paid.
//
// It never says a lien exists or is lost for certain: only what the statute requires and the dates.
// Retainage (§ 53.057) runs from the contract's completion, which PayApps does not know, so it is
// not counted here; the notice panel prints its form.
import { type TxNoticeMethod, type TxProjectKind, txPeriodDeadline } from "@lien-waivers";
import { formatCents } from "./money";

/** Days before the § 53.056 date that the cash page starts reminding. */
export const TX_REMIND_DAYS = 30;

export interface TxClaimAppInput {
  payAppId: string;
  number: number;
  periodFrom: string;
  periodTo: string;
  /** Still owed on the application (expected less payments received); 0 or less: nothing to claim. */
  unpaidCents: number;
  txNoticeSentOn: string | null;
  txNoticeMethod: TxNoticeMethod | null;
}

export interface TxNoticeClaim {
  payAppId: string;
  number: number;
  periodFrom: string;
  periodTo: string;
  unpaidCents: number;
  /** The month whose date governs (YYYY-MM): the period's first. */
  month: string;
  /** The 15th of the third (commercial) or second (residential) month after `month`. */
  dueOn: string;
  /** dueOn moved off a Saturday or Sunday (§ 53.003(e)), or null. */
  weekendExtendedTo: string | null;
  sentOn: string | null;
  method: TxNoticeMethod | null;
  /** Days from the report date to dueOn (negative once it has passed). */
  daysLeft: number;
  /** "sent" when recorded; "late" once the last day (with the weekend move) has passed; else "open". */
  status: "sent" | "open" | "late";
}

const DAY_MS = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const MONTH_NAMES = [
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
/** "2026-10" as "October 2026". */
export function monthName(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Each unpaid application's § 53.056 date, earliest first. */
export function txNoticeClaims(
  apps: readonly TxClaimAppInput[],
  kind: TxProjectKind,
  asOf: string,
): TxNoticeClaim[] {
  return apps
    .filter((a) => a.unpaidCents > 0 && a.periodFrom <= a.periodTo)
    .map((a): TxNoticeClaim => {
      const d = txPeriodDeadline(a.periodFrom, a.periodTo, kind);
      const lastDay = d.weekendExtendedTo ?? d.dueOn;
      return {
        payAppId: a.payAppId,
        number: a.number,
        periodFrom: a.periodFrom,
        periodTo: a.periodTo,
        unpaidCents: a.unpaidCents,
        month: d.month,
        dueOn: d.dueOn,
        weekendExtendedTo: d.weekendExtendedTo,
        sentOn: a.txNoticeSentOn,
        method: a.txNoticeMethod,
        daysLeft: days(asOf, d.dueOn),
        status: a.txNoticeSentOn ? "sent" : asOf > lastDay ? "late" : "open",
      };
    })
    .sort((x, y) => x.dueOn.localeCompare(y.dueOn) || x.number - y.number);
}

/**
 * The cash page's (and the weekly email's) reminder for one job: the most urgent application with
 * no notice recorded, due within TX_REMIND_DAYS or already past, and how many more are waiting.
 * Null when nothing is.
 */
export function txNoticeText(
  claims: readonly TxNoticeClaim[],
  gcName: string,
  kind: TxProjectKind,
): string | null {
  const waiting = claims.filter(
    (c) => c.status === "late" || (c.status === "open" && c.daysLeft <= TX_REMIND_DAYS),
  );
  const first = waiting[0];
  if (!first) return null;
  const more =
    waiting.length > 1
      ? ` ${waiting.length - 1} more unpaid application${waiting.length > 2 ? "s" : ""} on this job ${waiting.length > 2 ? "need" : "needs"} one too.`
      : "";
  const months = kind === "residential" ? "second" : "third";
  const what = `application #${first.number} (${formatCents(first.unpaidCents)} unpaid, work from ${monthName(first.month)})`;
  if (first.status === "late") {
    return `Texas notice of claim for ${what} was due ${first.dueOn} and none is recorded. Without it the lien for that month's work is not valid (Tex. Prop. Code § 53.056(a)). If you sent one, record it on the job's notice panel; work in a later month of the same period has its own, later date.${more}`;
  }
  const when =
    first.daysLeft === 0
      ? "today"
      : first.daysLeft === 1
        ? "by tomorrow"
        : `within ${first.daysLeft} days`;
  const weekend = first.weekendExtendedTo
    ? ` (a weekend day, so the statute allows ${first.weekendExtendedTo}, § 53.003(e))`
    : "";
  return `Texas notice of claim: if ${what} is still unpaid, send the notice to the owner and ${gcName} ${when}, by ${first.dueOn}${weekend}: the 15th of the ${months} month after the work (Tex. Prop. Code § 53.056(a-1)). Print it on the job's notice panel and record it there.${more}`;
}

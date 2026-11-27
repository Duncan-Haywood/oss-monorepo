// Texas lien deadlines for a subcontractor or supplier (a "claimant other than an original
// contractor"), Tex. Prop. Code ch. 53 as amended by H.B. 2237 (87th Leg., 2021) for original
// contracts entered into on or after 1 January 2022. Its own module with no imports and no form
// text, so a browser bundle can import it alone (apps/payapps aliases it as "@lien-waivers/tx-dates").
//
// - § 53.056(a-1): a notice of claim for unpaid labor or materials, sent for each month's unpaid work
//   "not later than the 15th day of the third month after the month during which" it was provided
//   (the second month on a residential construction project).
// - § 53.057(a-1): a notice of claim for unpaid retainage, not later than the earlier of the 30th
//   day after the claimant's contract, or the original contract, is completed, terminated or
//   abandoned (the second only when the original contract is terminated or abandoned).
// - § 53.052(b)-(d): the lien affidavit, filed by the 15th day of the fourth month after the month
//   the claimant last provided labor or materials (third month residential); for retainage, the 15th
//   day of the third month after the month the original contract was completed, terminated or
//   abandoned.
// - § 53.003(e): a deadline on "a Saturday, Sunday, or legal holiday" is extended to the next day that
//   is none of them. A legal holiday is one of Tex. Gov't Code § 662.021's days: the national holidays
//   of § 662.003(a) and the state holidays of § 662.003(b)(1) through (6) (not 24 or 26 December,
//   and not the optional holidays of § 662.003(c)). Each falls on the day the statute names; Texas
//   law moves none of them to a Friday or Monday.
// - § 53.003(b), (c): delivery in person, by certified mail, or by a traceable private service that
//   confirms receipt; for certified mail, depositing it in the mail complies.
//
// Checked against sources/tx-53-notices.txt and sources/tx-gv-662.txt in test/tx-notice.test.ts.
// Not legal advice.

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/** H.B. 2237, Sec. 37: these rules apply to an original contract entered into on or after this day. */
export const TX_HB2237_FROM = "2022-01-01";
/** § 53.057(a-1): the retainage notice's 30 days. */
export const TX_RETAINAGE_NOTICE_DAYS = 30;

export interface TxDeadline {
  /** The day the statute names, before § 53.003(e). */
  statutory: string;
  /** That day, moved past Saturdays, Sundays and legal holidays (§ 53.003(e), Gov't Code § 662.021). */
  due: string;
  /** Whether `due` differs from `statutory`. */
  moved: boolean;
  /** The legal holidays skipped on the way to `due`, by name; empty when only a weekend was. */
  holidays: string[];
}

function parseDate(iso: string): number {
  const m = ISO_DATE.exec(iso);
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  if (!m || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) {
    throw new RangeError(`Not a date (YYYY-MM-DD): ${iso}`);
  }
  return t;
}

function parseMonth(month: string): { y: number; m: number } {
  const x = ISO_MONTH.exec(month);
  const m = x ? Number(x[2]) : 0;
  if (!x || m < 1 || m > 12) throw new RangeError(`Not a month (YYYY-MM): ${month}`);
  return { y: Number(x[1]), m };
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The `nth` (1-based) `weekday` (0 Sunday) of month `m` (1-12), as a UTC day number of the month. */
function nthWeekday(y: number, m: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}

/** The last `weekday` of month `m`. */
function lastWeekday(y: number, m: number, weekday: number): number {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, days)).getUTCDay();
  return days - ((last - weekday + 7) % 7);
}

/**
 * Tex. Gov't Code § 662.021: the name of the legal holiday on `day` (YYYY-MM-DD), or null. National
 * holidays (§ 662.003(a)) and the state holidays of § 662.003(b)(1)-(6), on the day the statute names.
 */
export function txLegalHoliday(day: string): string | null {
  const t = parseDate(day);
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const n = d.getUTCDate();
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  const fixed: Record<string, string> = {
    "1-1": "New Year's Day",
    "7-4": "Independence Day",
    "11-11": "Veterans Day",
    "12-25": "Christmas Day",
    "1-19": "Confederate Heroes Day",
    "3-2": "Texas Independence Day",
    "4-21": "San Jacinto Day",
    "6-19": "Emancipation Day in Texas",
    "8-27": "Lyndon Baines Johnson Day",
  };
  const floating: [number, number, string][] = [
    [1, nthWeekday(y, 1, 1, 3), "Martin Luther King, Jr., Day"],
    [2, nthWeekday(y, 2, 1, 3), "Presidents' Day"],
    [5, lastWeekday(y, 5, 1), "Memorial Day"],
    [9, nthWeekday(y, 9, 1, 1), "Labor Day"],
    [11, thanksgiving, "Thanksgiving Day"],
    [11, thanksgiving + 1, "the Friday after Thanksgiving Day"],
  ];
  const names = [
    fixed[`${m}-${n}`],
    ...floating.filter(([fm, fd]) => fm === m && fd === n).map((f) => f[2]),
  ];
  const found = names.filter((x): x is string => Boolean(x));
  return found.length ? found.join(" and ") : null;
}

/** `day`, or the next day that is not a Saturday, Sunday or legal holiday (§ 53.003(e)). */
export function txNextBusinessDay(day: string): string {
  return roll(day).due;
}

function roll(day: string): { due: string; holidays: string[] } {
  let t = parseDate(day);
  const holidays: string[] = [];
  for (;;) {
    const w = new Date(t).getUTCDay();
    const h = txLegalHoliday(iso(t));
    if (h) holidays.push(h);
    if (w !== 0 && w !== 6 && !h) return { due: iso(t), holidays };
    t += DAY_MS;
  }
}

function deadline(statutory: string): TxDeadline {
  const { due, holidays } = roll(statutory);
  return { statutory, due, moved: due !== statutory, holidays };
}

/** The 15th day of the `n`th month after `month` (YYYY-MM). */
function fifteenthAfter(month: string, n: number): string {
  const { y, m } = parseMonth(month);
  return iso(Date.UTC(y, m - 1 + n, 15));
}

/** The month (YYYY-MM) a date (YYYY-MM-DD) falls in. */
export function txMonthOf(day: string): string {
  parseDate(day);
  return day.slice(0, 7);
}

/**
 * § 53.056(a-1): the last day to send the notice of claim for the labor or materials provided in
 * `workMonth` (YYYY-MM): the 15th day of the third month after it, or the second on a residential
 * construction project.
 */
export function txMonthlyNoticeDue(workMonth: string, residential: boolean): TxDeadline {
  return deadline(fifteenthAfter(workMonth, residential ? 2 : 3));
}

/**
 * § 53.057(a-1): the last day to send the notice of claim for unpaid retainage, 30 days after the
 * claimant's contract is completed, terminated or abandoned, or, if earlier, 30 days after the
 * original contract is terminated or abandoned (pass that date only when it happened).
 */
export function txRetainageNoticeDue(
  claimantContractEndedOn: string,
  originalContractTerminatedOn?: string,
): TxDeadline {
  let t = parseDate(claimantContractEndedOn);
  if (originalContractTerminatedOn) t = Math.min(t, parseDate(originalContractTerminatedOn));
  return deadline(iso(t + TX_RETAINAGE_NOTICE_DAYS * DAY_MS));
}

/**
 * § 53.052(b)-(c): the last day to file the lien affidavit with the county clerk, the 15th day of the
 * fourth month after the month the claimant last provided labor or materials (third, residential).
 */
export function txLienAffidavitDue(lastWorkMonth: string, residential: boolean): TxDeadline {
  return deadline(fifteenthAfter(lastWorkMonth, residential ? 3 : 4));
}

/**
 * § 53.052(d): the last day to file a lien affidavit for retainage, the 15th day of the third month
 * after the month the original contract was completed, terminated or abandoned.
 */
export function txRetainageAffidavitDue(originalContractEndedMonth: string): TxDeadline {
  return deadline(fifteenthAfter(originalContractEndedMonth, 3));
}

export interface TxMonthlyNotice extends TxDeadline {
  /** The month the labor or materials were provided (YYYY-MM). */
  workMonth: string;
}

/** One § 53.056 notice date per month from `fromMonth` to `toMonth` (YYYY-MM, both included). */
export function txNoticeSchedule(
  fromMonth: string,
  toMonth: string,
  residential: boolean,
): TxMonthlyNotice[] {
  const a = parseMonth(fromMonth);
  const b = parseMonth(toMonth);
  const count = (b.y - a.y) * 12 + (b.m - a.m) + 1;
  if (count < 1) throw new RangeError(`${toMonth} is before ${fromMonth}`);
  if (count > 120) throw new RangeError("At most ten years of months");
  const out: TxMonthlyNotice[] = [];
  for (let i = 0; i < count; i++) {
    const workMonth = iso(Date.UTC(a.y, a.m - 1 + i, 1)).slice(0, 7);
    out.push({ workMonth, ...txMonthlyNoticeDue(workMonth, residential) });
  }
  return out;
}

/** Who the notices of claim go to (§§ 53.056(a-1), 53.057(a-1)). */
export const TX_NOTICE_RECIPIENTS = ["owner", "original-contractor"] as const;
export type TxNoticeRecipient = (typeof TX_NOTICE_RECIPIENTS)[number];
export const TX_NOTICE_RECIPIENT_LABELS: Record<TxNoticeRecipient, string> = {
  owner: "Owner or reputed owner",
  "original-contractor": "Original contractor",
};

/** § 53.003(b): the three ways a notice under chapter 53 may be delivered. */
export const TX_DELIVERY_METHODS = ["certified-mail", "in-person", "traceable-private"] as const;
export type TxDeliveryMethod = (typeof TX_DELIVERY_METHODS)[number];
export const TX_DELIVERY_METHOD_LABELS: Record<TxDeliveryMethod, string> = {
  "certified-mail": "Certified mail",
  "in-person": "In person (to the party or its agent)",
  "traceable-private": "Traceable private delivery with proof of receipt",
};

/** The two notices of claim: § 53.056 for a month's unpaid labor or materials, § 53.057 for retainage. */
export const TX_NOTICE_KINDS = ["labor-materials", "retainage"] as const;
export type TxNoticeKind = (typeof TX_NOTICE_KINDS)[number];

export interface TxSendTiming {
  /** The § 53.056 deadline for the record's work month; null for a retainage notice. */
  due: TxDeadline | null;
  /** Sent by the deadline; null when there is none to compare with. */
  onTime: boolean | null;
  /** One line on how the record counts. */
  text: string;
}

/**
 * How a recorded notice of claim counts against its deadline. A certified-mail notice complies when
 * deposited in the mail (§ 53.003(c)); a notice handed over in person counts that day; for a private
 * service § 53.003(c)'s mailing rule does not speak, so the carrier's proof of receipt matters.
 */
export function txSendTiming(input: {
  kind: TxNoticeKind;
  /** YYYY-MM, for a § 53.056 notice. */
  workMonth: string | null;
  residential: boolean;
  method: TxDeliveryMethod;
  sentOn: string;
}): TxSendTiming {
  parseDate(input.sentOn);
  if (input.kind === "retainage" || !input.workMonth) {
    return {
      due: null,
      onTime: null,
      text: "Retainage notice: due 30 days after your contract (or, if sooner, the original contract) ends, § 53.057(a-1).",
    };
  }
  const due = txMonthlyNoticeDue(input.workMonth, input.residential);
  const onTime = input.sentOn <= due.due;
  const how =
    input.method === "certified-mail"
      ? "deposited in the mail, which complies (§ 53.003(c))"
      : input.method === "in-person"
        ? "delivered in person"
        : "handed to a private service; keep its proof of receipt (§ 53.003(b)(3))";
  return {
    due,
    onTime,
    text: onTime
      ? `On time: ${how} on ${input.sentOn}, by ${due.due}.`
      : `Late: ${how} on ${input.sentOn}, after ${due.due} (§ 53.056(a-1)).`,
  };
}

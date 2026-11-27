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
//   is none of them. PayApps moves a date past a Saturday or Sunday only; it does not know Texas'
//   legal holidays, so a date it shows may be a day earlier than the law's, never later.
//
// Checked against sources/tx-53-notices.txt in test/tx-notice.test.ts. Not legal advice.

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
  /** That day, moved past a Saturday or Sunday (§ 53.003(e)); legal holidays are not moved. */
  due: string;
  /** Whether `due` differs from `statutory`. */
  movedForWeekend: boolean;
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

/** `day`, or the Monday after it when it is a Saturday or Sunday (§ 53.003(e), holidays aside). */
export function txNextWeekday(day: string): string {
  let t = parseDate(day);
  for (let w = new Date(t).getUTCDay(); w === 0 || w === 6; w = new Date(t).getUTCDay()) {
    t += DAY_MS;
  }
  return iso(t);
}

function deadline(statutory: string): TxDeadline {
  const due = txNextWeekday(statutory);
  return { statutory, due, movedForWeekend: due !== statutory };
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

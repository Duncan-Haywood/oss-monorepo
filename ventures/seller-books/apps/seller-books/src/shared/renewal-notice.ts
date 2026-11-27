// The automatic-renewal notice (services/billing/renewal-notices.ts): which renewal, if any, a paid
// subscription must be reminded of on a given day.
//
// Why: resellers are often consumers (a side hustle bought for themselves), and two state laws ask
// for a reminder before an automatic renewal sold to a consumer:
// - Colorado, C.R.S. 6-1-732(4): a notice that the contract will renew unless cancelled, and how to
//   cancel, sent "at least twenty-five and no more than forty days before" each automatic renewal;
//   for a term shorter than twelve months, before the renewals that carry the contract past each
//   consecutive twelve-month period (so once a year on a monthly plan).
// - California, Bus. & Prof. Code 17602 as amended by AB 2863 (from 2025-07-01): at least once a
//   year, a reminder of the renewal's frequency, the amount charged and how to cancel.
// One email satisfies both: every yearly renewal, and every twelve-month mark of a monthly plan,
// 26 to 39 calendar days ahead (inside Colorado's 25-40 even with the renewal's time of day and the
// cron's hour either side). Sources and the reasoning: docs/BILLING.md, "Automatic renewal".

/** The earliest a notice goes out, in calendar days before the renewal (Colorado allows 40). */
export const RENEWAL_NOTICE_MAX_DAYS = 39;
/** The latest an on-time notice goes out (Colorado asks for at least 25). */
export const RENEWAL_NOTICE_MIN_DAYS = 26;
/**
 * A renewal closer than RENEWAL_NOTICE_MIN_DAYS that was never reminded of (the feature shipped, or
 * the mail was down, inside the window) still gets a late notice down to this many days: telling
 * the customer late beats not telling them. Each late send is logged.
 */
export const RENEWAL_NOTICE_LATE_MIN_DAYS = 1;

export interface RenewalSubscription {
  planKey: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** As the provider's webhook reported the price ("month", "year", ...), or null. */
  billingInterval: string | null;
  billingFrequency: number | null;
  /** First paid renewal or charge (webhook stamp), else when the row was created. */
  startedAt: Date | null;
}

export interface RenewalNotice {
  /**
   * The renewal this notice is for (YYYY-MM-DD, UTC): the period end on a yearly plan, the
   * twelve-month mark on a monthly one. One notice per subscription per key.
   */
  key: string;
  cycle: "year" | "month";
  /** The next charge (the current period's end, YYYY-MM-DD). */
  nextCharge: string;
  /** Calendar days from today to `key`. */
  daysLeft: number;
  /** True when sent inside RENEWAL_NOTICE_MIN_DAYS (later than the statute's window). */
  late: boolean;
  /** Monthly plans: which year of the subscription the twelve-month mark starts (2, 3, ...). */
  yearNumber: number | null;
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** Statuses that renew on their own. Trials included: a trial that converts is a renewal too. */
const RENEWING = new Set(["active", "trialing"]);

/** `iso` plus `n` calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))));
}

/** Yearly or monthly, from the billed price, else from the current period's length. */
export function renewalCycle(s: RenewalSubscription): "year" | "month" {
  const f = s.billingFrequency ?? 1;
  if (s.billingInterval === "year") return "year";
  if (s.billingInterval === "month") return f >= 12 ? "year" : "month";
  if (s.billingInterval === "week" || s.billingInterval === "day") return "month";
  if (s.currentPeriodStart && s.currentPeriodEnd) {
    const days = (s.currentPeriodEnd.getTime() - s.currentPeriodStart.getTime()) / DAY;
    return days >= 300 ? "year" : "month";
  }
  return "month";
}

/** The notice due today (YYYY-MM-DD) for this subscription, or null. */
export function renewalNoticeDue(s: RenewalSubscription, today: string): RenewalNotice | null {
  if (!RENEWING.has(s.status) || s.cancelAtPeriodEnd || !s.currentPeriodEnd) return null;
  if (s.planKey === "free" || s.planKey === "comp") return null;
  const nextCharge = isoDay(s.currentPeriodEnd);
  const cycle = renewalCycle(s);
  let key = nextCharge;
  let yearNumber: number | null = null;
  if (cycle === "month") {
    const start = isoDay(s.startedAt ?? s.currentPeriodStart ?? s.currentPeriodEnd);
    // The first twelve-month mark still ahead of today.
    let k = 1;
    while (addMonths(start, 12 * k) <= today) k++;
    key = addMonths(start, 12 * k);
    yearNumber = k + 1;
  }
  const daysLeft = dayNum(key) - dayNum(today);
  if (daysLeft > RENEWAL_NOTICE_MAX_DAYS || daysLeft < RENEWAL_NOTICE_LATE_MIN_DAYS) return null;
  return { key, cycle, nextCharge, daysLeft, late: daysLeft < RENEWAL_NOTICE_MIN_DAYS, yearNumber };
}

/** The renewal terms shown next to checkout and agreed to with a tick (pending_checkouts records it). */
export const RENEWAL_TERMS_VERSION = "2026-11-27";

/** The terms in one paragraph, for a plan's price and cycle. Billing page and docs/BILLING.md. */
export function renewalTerms(price: string, cycle: "year" | "month"): string {
  const every = cycle === "year" ? "every year" : "every month";
  return `Your plan renews automatically ${every} at ${price} plus any sales tax, charged by Paddle, until you cancel. Cancel any time from the Billing page in one step: you keep the plan to the end of the period you paid for, nothing more is charged, and your records stay. We email you 26 to 39 days before each yearly renewal (once a year on a monthly plan). A first payment can be refunded in full within 30 days (Refund Policy).`;
}

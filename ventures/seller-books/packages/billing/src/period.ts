// Monthly quota periods. Quotas reset monthly on the subscription's anniversary (annual plans too);
// orgs without a provider period (comp / none) use the UTC calendar month.

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Adds k months in UTC, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsUtc(d: Date, k: number): Date {
  const first = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + k,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return first;
}

/** Start of the monthly quota period containing `now`, anchored on `anchor` (or calendar month). */
export function quotaPeriodStart(anchor: Date | null | undefined, now: Date): Date {
  if (!anchor || anchor.getTime() > now.getTime()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  let k =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  if (addMonthsUtc(anchor, k).getTime() > now.getTime()) k -= 1;
  return addMonthsUtc(anchor, k);
}

/** "YYYY-MM" of the quota period start (store it on usage rows as the period key). */
export function periodKeyFor(anchor: Date | null | undefined, now: Date): string {
  return ym(quotaPeriodStart(anchor, now));
}

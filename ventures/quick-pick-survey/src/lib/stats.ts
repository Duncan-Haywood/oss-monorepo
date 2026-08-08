/**
 * The two order statistics the admin surfaces share.
 *
 * These lived as private helpers inside `api/admin/overview/route.ts`. They are
 * here so that a second consumer cannot start life with a second, subtly
 * different implementation of the same summary — the failure mode where two
 * dashboards quote different medians for one dataset and both look right.
 */

/**
 * Median is used throughout rather than mean — the quantities these summarise
 * (response times, time-to-join) are heavily right-skewed, and one distracted
 * participant would dominate a mean.
 *
 * Returns null for an empty sample rather than 0: no observations and "the
 * middle observation is zero" are different facts, and 0 reads as the latter.
 */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Nearest-rank percentile. `fraction` is in [0, 1].
 *
 * Returns null for an empty sample, for the same reason `median` does.
 */
export function percentile(xs: number[], fraction: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * When may the insights screen call one item a person's clear top (or bottom)
 * pick? Measured in docs/INFORMATION-GAIN-SELECTOR.md, "Per-person intervals
 * from a refit" (2026-11-12): the old rule, "ahead of the runner-up by more
 * than half the leader's rd", fired for about three respondents in four under
 * the staged selector and named the wrong item in more than half of those
 * claims. This rule asks instead that the leader beat every other rated item
 * by more than z standard deviations of the rating difference (one-sided,
 * z = 1.645 is 95%), with the difference's sd from the refit's covariance
 * (btRefit.ts) where the two items share one person's answers.
 *
 * Pure. Ratings and sds on the Glicko-2 display scale (rating points).
 */

/** One-sided 95%. */
export const CLEAR_PICK_Z = 1.645;

export type PickCandidate = { key: string; rating: number };

/**
 * Returns the leader (highest rating, or lowest with `bottom`) and whether it
 * is clear of every other candidate. `differenceSd(a, b)` is the sd of
 * rating_a - rating_b in rating points. Fewer than two candidates: no claim.
 */
export function clearPick<T extends PickCandidate>(
  candidates: readonly T[],
  differenceSd: (a: T, b: T) => number,
  { z = CLEAR_PICK_Z, bottom = false }: { z?: number; bottom?: boolean } = {}
): { leader: T; clear: boolean } | undefined {
  if (candidates.length < 2) return undefined;
  const sign = bottom ? -1 : 1;
  let leader = candidates[0];
  for (const c of candidates) if (sign * c.rating > sign * leader.rating) leader = c;
  const clear = candidates.every((c) => c === leader || sign * (leader.rating - c.rating) > z * differenceSd(leader, c));
  return { leader, clear };
}

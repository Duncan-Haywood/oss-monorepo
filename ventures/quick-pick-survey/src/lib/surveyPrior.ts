/**
 * One prior sd per survey for the insights card's "it's between" set, pooled
 * over the survey's respondents and stored on the Survey row.
 *
 * Why it exists (docs/INFORMATION-GAIN-SELECTOR.md, "A stored survey prior"):
 * since 2026-11-12 the set is drawn from a refit at the person's own
 * empirical-Bayes prior sd (btRefit.ts, empiricalPriorPhi). One person's
 * answers say little about how spread out their likes are (under the staged
 * selector 22-25% of honest respondents hit the 0.3 floor), so their lists
 * run long. Pooling the evidence over a survey's respondents gives a steadier
 * estimate; the route cannot pool at request time (it would read every other
 * respondent's answers), so the estimate is stored and refreshed in the
 * background when enough new answers have arrived.
 *
 * The pure parts (which respondents count, when to refresh, which sd the set
 * uses) are here and tested; refreshSurveyPrior is the database step.
 */

import { EB_MAX_ITEMS, pooledPriorPhiAsync, type RefitAnswer } from "./btRefit";

/** Fewer respondents than this and the stored estimate is not used: the person's own sd stands. */
export const POOL_MIN_RESPONDENTS = 10;
/** At most this many respondents enter the pooled search (the most recent; cost is linear in them). */
export const POOL_MAX_RESPONDENTS = 40;
/** A respondent needs this many answers to enter the pool (one or two answers carry almost no evidence about spread). */
export const POOL_MIN_ANSWERS = 4;
/** Refresh once the survey's answer count has grown by this factor since the stored estimate (and by POOL_REFRESH_MIN_NEW answers). */
export const POOL_REFRESH_GROWTH = 1.25;
export const POOL_REFRESH_MIN_NEW = 20;

export type PoolPerson = { ids: readonly string[]; answers: readonly RefitAnswer[] };
export type StoredPrior = { phi: number | null; respondents: number | null; answers: number | null };

/**
 * The respondents that enter the pooled search: at least POOL_MIN_ANSWERS
 * answers and at most EB_MAX_ITEMS answered items (the route draws the set
 * from the fixed prior past that, and the evidence search there costs
 * seconds), the first POOL_MAX_RESPONDENTS in the order given (callers pass
 * the most recent first).
 */
export function poolEligible<T extends PoolPerson>(people: readonly T[]): T[] {
  return people.filter((p) => p.answers.length >= POOL_MIN_ANSWERS && p.ids.length <= EB_MAX_ITEMS).slice(0, POOL_MAX_RESPONDENTS);
}

/**
 * The pooled prior sd over the eligible respondents, or null when there are
 * too few of them. Async because it yields to the event loop between
 * respondents (2.5 s of CPU for 40 people at 15 items x 4 answers, 7.5 s at
 * 30 x 8, 11.5 s at 40 x 8, measured 2026-11-12).
 */
export async function surveyPriorPhi(people: readonly PoolPerson[]): Promise<{ phi: number; respondents: number } | null> {
  const used = poolEligible(people);
  if (used.length < POOL_MIN_RESPONDENTS) return null;
  return { phi: await pooledPriorPhiAsync(used), respondents: used.length };
}

/** Is the stored estimate missing or out of date for a survey that now has `answers` decided answers? */
export function needsRefresh(stored: StoredPrior, answers: number): boolean {
  if (stored.answers === null) return answers >= POOL_MIN_RESPONDENTS * POOL_MIN_ANSWERS;
  return answers - stored.answers >= POOL_REFRESH_MIN_NEW && answers >= POOL_REFRESH_GROWTH * stored.answers;
}

/**
 * The prior sd the person's set is drawn from: the narrower of their own
 * estimate and the survey's stored one, or their own alone when the survey
 * has none (or too few respondents behind it). A narrower prior shrinks the
 * leader harder and widens the set, so the survey can only lengthen a
 * person's list, never shorten it.
 *
 * Why the narrower and not the pooled value itself (docs/INFORMATION-GAIN-SELECTOR.md,
 * "A stored survey prior"): in a synthetic survey that mixes spreads (0.5, 1,
 * 2) and lapse rates (0, 0.2), the pooled sd sits near the middle, too wide
 * for the people whose likes are close together, and their coverage fell to
 * 0.83-0.92. The narrower of the two held 0.954-0.964 overall on both
 * selectors and two seed bases (own alone 0.922-0.943) and lifted the worst
 * cell from 0.86-0.89 to 0.89-0.93, at 0.4-1.1 more names.
 */
export function setPriorPhi(own: number, stored: StoredPrior): number {
  if (stored.phi === null || stored.respondents === null || stored.respondents < POOL_MIN_RESPONDENTS) return own;
  return Math.min(own, stored.phi);
}

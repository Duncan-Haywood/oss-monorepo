import { median, percentile } from "@/lib/stats";

/**
 * Referral conversion, measured from first-party relational rows.
 *
 * **Why not the `UsageEvent` stream.** `couple_invite_created` and
 * `couple_joined` are emitted by two different people in two different
 * sessions, and every aggregate in the admin overview groups by
 * `sessionKeyHash`. A `transitionPairs` row for that pair would be permanently
 * n = 0. Linking the two ends through the event stream would require an
 * identifier that survives across sessions *and across people* — a new data
 * category, a new retention question, and a new consent obligation, for a
 * number we can already get exactly.
 *
 * **Why this is better than a ratio of event counts.** `Couple` records the
 * invite (`createdAt`) and its conversion (`joinerId` / `joinedAt`) on one row.
 * So this is a *linked, per-invite* conversion rate, not
 * `sessions-that-joined / sessions-that-invited` — two population counts whose
 * quotient is not a conversion rate and cannot be attributed.
 *
 * **The censoring trap this exists to avoid.** An invite created a minute ago
 * has not had a chance to convert. A rate computed over every invite ever
 * created is therefore biased downward, and the bias grows exactly when
 * invites are growing — so the measure looks worst when the venture is doing
 * best. Every rate below is computed over a *matured cohort*: invites old
 * enough that a conversion would have happened by now. Numerator and
 * denominator are drawn from the same cohort.
 */

/**
 * How long an invite is given before its outcome is treated as final.
 *
 * An invite is a message sent to one specific person, so conversion is a
 * human-response latency, not a browsing decision: a week covers a partner who
 * saw it over a weekend. `maturityAdequate` re-checks this against the observed
 * p90 on every call rather than trusting the constant — see below.
 *
 * **Lowering this number inflates every rate on this surface**, by moving
 * invites that have not yet had a chance to convert into the denominator's
 * cohort while their conversions are still in the future. Treat it as a floor;
 * `inviteConversion.test.ts` pins the value and the direction.
 */
export const INVITE_MATURITY_MS = 7 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * One invitation and its outcome.
 *
 * `converted` and `convertedAt` are separate on purpose. The database can hold
 * a row that converted without a timestamp (`joinerId` set, `joinedAt` null),
 * and collapsing the two would either drop that conversion from the rate or
 * invent a latency for it. It counts toward the rate and is absent from the
 * latency distribution, which is what is actually known about it.
 */
export type ConversionRow = {
  createdAt: Date;
  converted: boolean;
  convertedAt: Date | null;
};

export type ConversionSummary = {
  /** Every invite in the retained window, mature or not. */
  created: number;
  /** Every conversion in that window, including invites too young to be in the cohort. */
  converted: number;
  /** Invites old enough for their outcome to be final. The denominator. */
  maturedCreated: number;
  /** Conversions among exactly those invites. The numerator. */
  maturedConverted: number;
  /** Invites still inside the maturity window, counted in neither. */
  immature: number;
  /**
   * `maturedConverted / maturedCreated`, or null when the cohort is empty.
   *
   * Null rather than 0: "no invite has had time to convert yet" and "invites
   * were sent and nobody joined" are opposite facts about the venture, and 0
   * reads as the second.
   */
  maturedRate: number | null;
  medianHoursToConvert: number | null;
  p90HoursToConvert: number | null;
  maturityWindowHours: number;
  /**
   * Whether the maturity window is long enough for the rate above to be final.
   *
   * False when the observed p90 latency exceeds the window — conversions are
   * still arriving after we stopped waiting for them, so `maturedRate` remains
   * censored and understates. Null when there is no latency sample to judge by.
   * This is the constant checking itself against the data rather than being
   * believed.
   */
  maturityAdequate: boolean | null;
};

/**
 * Summarise a set of invitations into a conversion rate that can carry a
 * decision.
 *
 * `now` is injected rather than read from the clock so the cohort boundary is
 * testable and the function stays pure.
 */
export function summariseConversion(rows: ConversionRow[], now: Date): ConversionSummary {
  const cohortCutoff = now.getTime() - INVITE_MATURITY_MS;

  const matured = rows.filter((row) => row.createdAt.getTime() <= cohortCutoff);
  const maturedConverted = matured.filter((row) => row.converted).length;

  // Latency is measured over every conversion we have a timestamp for, not
  // just the matured cohort, so that the distribution describes how long joins
  // are taking *now*. Restricting it to invites older than the window would
  // make the median and p90 lag by a week and hide a recent slowdown.
  //
  // Note what this does and does not do for `maturityAdequate` below. Only a
  // matured invite can record a latency longer than the window — a younger one
  // has not existed long enough — so the window is still falsified solely by
  // matured rows. The wider sample buys currency, not sensitivity.
  const latencies: number[] = [];
  for (const row of rows) {
    if (!row.converted || !row.convertedAt) continue;
    const elapsed = row.convertedAt.getTime() - row.createdAt.getTime();
    // A conversion stamped before its own invite is a clock or data fault, not
    // an instant join. It still counts as a conversion; it has no measurable
    // latency, so it is absent here rather than clamped to zero, which would
    // drag the median toward a number nobody experienced.
    if (elapsed < 0) continue;
    latencies.push(elapsed / HOUR_MS);
  }

  const p90 = percentile(latencies, 0.9);
  const maturityWindowHours = INVITE_MATURITY_MS / HOUR_MS;

  return {
    created: rows.length,
    converted: rows.filter((row) => row.converted).length,
    maturedCreated: matured.length,
    maturedConverted,
    immature: rows.length - matured.length,
    maturedRate: matured.length ? maturedConverted / matured.length : null,
    medianHoursToConvert: median(latencies),
    p90HoursToConvert: p90,
    maturityWindowHours,
    maturityAdequate: p90 === null ? null : p90 <= maturityWindowHours,
  };
}

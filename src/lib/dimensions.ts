import { DIMENSION_LABELS, Dimension, DIMENSIONS } from "@/lib/surveyData";

export type ScoredItem = {
  label: string;
  rating: number;
  rd: number;
  dimensions: string[];
};

export type DimensionScore = {
  key: Dimension;
  label: string;
  /** Mean rating of items carrying this dimension, in Glicko points. */
  score: number;
  /** Relative to the person's own average across all rated items. */
  delta: number;
  /** How many rated items fed this score — below ~3 it's noise. */
  n: number;
  /** Standard error of the mean, for the confidence band. */
  se: number;
};

/**
 * Rolls per-item ratings up into per-dimension scores. An item can signal
 * several dimensions, and contributes to each — this is deliberately a
 * simple weighted mean rather than a factor model, because with one
 * respondent and a few dozen answers anything fancier would be fitting
 * noise.
 *
 * Items are weighted by certainty (1/rd²), so an item the model is still
 * unsure about barely moves its dimension.
 */
export function scoreDimensions(items: ScoredItem[]): DimensionScore[] {
  const rated = items.filter((i) => i.rd < 349 && i.dimensions.length > 0);
  if (rated.length === 0) return [];

  // Overall weighted mean, used as the baseline each dimension is compared to.
  let wSum = 0;
  let wxSum = 0;
  for (const i of rated) {
    const w = 1 / (i.rd * i.rd);
    wSum += w;
    wxSum += w * i.rating;
  }
  const overall = wxSum / wSum;

  const out: DimensionScore[] = [];
  for (const key of DIMENSIONS) {
    const members = rated.filter((i) => i.dimensions.includes(key));
    if (members.length === 0) continue;

    let w = 0;
    let wx = 0;
    for (const m of members) {
      const wi = 1 / (m.rd * m.rd);
      w += wi;
      wx += wi * m.rating;
    }
    const score = wx / w;

    // SE of a weighted mean under the same weights.
    const se = Math.sqrt(1 / w);

    out.push({
      key,
      label: DIMENSION_LABELS[key],
      score,
      delta: score - overall,
      n: members.length,
      se,
    });
  }

  return out.sort((a, b) => b.delta - a.delta);
}

/**
 * A short, plain-language read of the strongest signals — deliberately
 * hedged when the data is thin, since overclaiming from 20 answers is how
 * these products lose trust.
 */
export function describeDimensions(scores: DimensionScore[], totalAnswers: number): string | null {
  const solid = scores.filter((s) => s.n >= 3);
  if (solid.length < 2) return null;

  const top = solid[0];
  const bottom = solid[solid.length - 1];
  if (top.delta - bottom.delta < 20) {
    return "So far your preferences look fairly even across the board — no single thing is dominating yet.";
  }

  const hedge =
    totalAnswers < 40
      ? "Early read, but "
      : totalAnswers < 100
        ? "Fairly consistent so far: "
        : "Clear pattern: ";
  return `${hedge}you lean toward ${top.label.toLowerCase()} and away from ${bottom.label.toLowerCase()}.`;
}

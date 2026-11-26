// Scoring math for the rubric review (pure). Weights come from the funder, never from the model:
//   - a criterion that matches a published opportunity-level criterion with points/weight gets that
//     weight (split evenly when the same published criterion is scored in several sections);
//   - every other criterion shares its section's default weight evenly, so a section counts the
//     same however many sub-criteria the model listed. The default weight is the mean published
//     weight when the funder publishes any, else 1.
// Section score = weighted average of its criteria; overall = weighted average of all criteria.
import { type OpportunityCriterion, QUALITY_MAX_SCORE } from "@shared/quality";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Integer 0-5; anything non-numeric is 0. */
export function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(QUALITY_MAX_SCORE, Math.max(0, Math.round(x)));
}

/** Σ w·s / Σ w over items with a positive weight (2 decimals); null when there are none. */
export function weightedAverage(
  items: readonly { score: number; weight: number }[],
): number | null {
  let total = 0;
  let sum = 0;
  for (const i of items) {
    if (!(i.weight > 0) || !Number.isFinite(i.score)) continue;
    total += i.weight;
    sum += i.weight * i.score;
  }
  return total > 0 ? round2(sum / total) : null;
}

export const normalizeCriterionName = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The published criterion a model-named criterion refers to (exact name, then containment). */
export function matchOpportunityCriterion(
  name: string,
  published: readonly OpportunityCriterion[],
): OpportunityCriterion | null {
  const n = normalizeCriterionName(name);
  if (!n) return null;
  const exact = published.find((c) => normalizeCriterionName(c.name) === n);
  if (exact) return exact;
  return (
    published.find((c) => {
      const m = normalizeCriterionName(c.name);
      return m.length >= 4 && (n.includes(m) || m.includes(n));
    }) ?? null
  );
}

/** Published criteria that apply to a section (no sectionKeys = every scored section). */
export function criteriaForSection(
  published: readonly OpportunityCriterion[],
  sectionKey: string,
): OpportunityCriterion[] {
  return published.filter((c) => c.sectionKeys.length === 0 || c.sectionKeys.includes(sectionKey));
}

export function defaultWeight(published: readonly OpportunityCriterion[]): number {
  const ws = published
    .map((c) => c.weight)
    .filter((w): w is number => typeof w === "number" && w > 0);
  return ws.length ? round2(ws.reduce((a, b) => a + b, 0) / ws.length) : 1;
}

export interface WeighableCriterion {
  /** normalized name of the matched published criterion, or null */
  publishedKey: string | null;
  publishedWeight: number | null;
}

/**
 * Weights for every criterion of every section (same shape as the input), following the rules at
 * the top of this file.
 */
export function assignWeights(
  sections: readonly (readonly WeighableCriterion[])[],
  published: readonly OpportunityCriterion[],
): number[][] {
  const base = defaultWeight(published);
  const uses = new Map<string, number>();
  for (const s of sections)
    for (const c of s)
      if (c.publishedKey && c.publishedWeight) {
        uses.set(c.publishedKey, (uses.get(c.publishedKey) ?? 0) + 1);
      }
  return sections.map((s) => {
    const unweighted = s.filter((c) => !(c.publishedKey && c.publishedWeight)).length;
    return s.map((c) =>
      c.publishedKey && c.publishedWeight
        ? c.publishedWeight / (uses.get(c.publishedKey) ?? 1)
        : base / unweighted,
    );
  });
}

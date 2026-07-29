/**
 * Intelligent topic domain scheduler.
 *
 * Sequences survey domains based on session perspective (About Myself vs. Ideal Partner),
 * user gender/seeking orientation, and confidence level build-up across categories.
 */

export type DomainState = {
  slug: string;
  title: string;
  kind: "ITEMS" | "FINANCIAL" | "CONJOINED";
  confidence: number;
  answeredCount: number;
};

/** Answers needed elsewhere before a domain is worth asking about. */
const UNLOCK_AFTER: Record<string, number> = {
  financial: 12,
  conjoined: 40,
};

/**
 * The first pass is deliberately shared across perspectives. Couple insights
 * need the same concepts measured for "my own life", "my ideal partner", and
 * "my read of them"; letting each mode wander into unrelated domains early
 * creates lots of answers but almost no overlap worth comparing.
 */
const INSIGHT_FOUNDATION = [
  "values",
  "traits",
  "communication",
  "relationship",
  "stress-support",
  "trust-boundaries",
  "money-power",
  "lifestyle",
  "future-family",
  "play-growth",
  "care-health",
  "community-belonging",
  "work-time",
  "intimacy",
  "behaviors",
  "affection",
  "combined",
] as const;

const FOUNDATION_ANSWERS_PER_DOMAIN = 4;

/** Priority weights after the shared insight foundation is covered. */
const PERSPECTIVE_PRIORITY: Record<string, Record<string, number>> = {
  PARTNER: {
    relationship: 1.5,
    affection: 1.4,
    traits: 1.3,
    values: 1.2,
    behaviors: 1.2,
    communication: 1.45,
    intimacy: 1.35,
    "future-family": 1.3,
    lifestyle: 1.25,
    "money-power": 1.4,
    "stress-support": 1.45,
    "trust-boundaries": 1.4,
    "play-growth": 1.2,
    "care-health": 1.35,
    "community-belonging": 1.1,
    "work-time": 1.25,
    activities: 1.0,
    professions: 0.9,
    combined: 1.0,
  },
  SELF: {
    activities: 1.5,
    professions: 1.4,
    traits: 1.3,
    values: 1.3,
    relationship: 0.9,
    affection: 0.9,
    communication: 1.1,
    lifestyle: 1.25,
    "money-power": 1.2,
    "stress-support": 1.15,
    "trust-boundaries": 1.1,
    "play-growth": 1.1,
    "care-health": 1.15,
    "community-belonging": 1.1,
    "work-time": 1.25,
    intimacy: 0.85,
    "future-family": 1.0,
    combined: 1.0,
  },
};

export function randomStreakTarget(rand: () => number = Math.random): number {
  return 4 + Math.floor(rand() * 5); // 4..8
}

/** Domains that are worth asking right now, given total progress so far. */
export function availableDomains(domains: DomainState[]): DomainState[] {
  const itemAnswers = domains
    .filter((d) => d.kind === "ITEMS")
    .reduce((sum, d) => sum + d.answeredCount, 0);

  const open = domains.filter((d) => itemAnswers >= (UNLOCK_AFTER[d.slug] ?? 0));
  return open.length ? open : domains.filter((d) => d.kind === "ITEMS");
}

export function pickNextDomain(
  domains: DomainState[],
  excludeSlug: string | null,
  perspective: string = "PARTNER",
  rand: () => number = Math.random
): string {
  const open = availableDomains(domains);
  const foundation = INSIGHT_FOUNDATION
    .map((slug) => open.find((d) => d.slug === slug))
    .filter((d): d is DomainState => !!d && d.answeredCount < FOUNDATION_ANSWERS_PER_DOMAIN);
  if (foundation.length) {
    const notCurrent = foundation.filter((d) => d.slug !== excludeSlug);
    return (notCurrent[0] ?? foundation[0]).slug;
  }

  const pool = open.length > 1 && excludeSlug ? open.filter((d) => d.slug !== excludeSlug) : open;
  const usable = pool.length ? pool : open;

  const priorities = PERSPECTIVE_PRIORITY[perspective] || {};

  const weights = usable.map((d) => {
    const pWeight = priorities[d.slug] ?? 1.0;
    const confFactor = Math.max(0.05, 1 - d.confidence);
    return confFactor * pWeight;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < usable.length; i++) {
    r -= weights[i];
    if (r <= 0) return usable[i].slug;
  }
  return usable[usable.length - 1].slug;
}

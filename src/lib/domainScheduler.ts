/**
 * Picks which survey domain to pull the next question from, in one
 * continuous session. Biases toward staying in the current domain for a
 * short streak (less context-switching) but always ultimately favors
 * whichever domain has the least confidence built up, so the full set
 * still gets covered.
 */

export type DomainState = {
  slug: string;
  title: string;
  kind: "ITEMS" | "FINANCIAL" | "CONJOINED";
  confidence: number;
  answeredCount: number;
};

export function randomStreakTarget(rand: () => number = Math.random): number {
  return 4 + Math.floor(rand() * 5); // 4..8
}

export function pickNextDomain(
  domains: DomainState[],
  excludeSlug: string | null,
  rand: () => number = Math.random
): string {
  const pool = domains.length > 1 && excludeSlug ? domains.filter((d) => d.slug !== excludeSlug) : domains;
  const weights = pool.map((d) => Math.max(0.05, 1 - d.confidence));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].slug;
  }
  return pool[pool.length - 1].slug;
}

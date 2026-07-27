/**
 * Picks which survey domain to pull the next question from, in one
 * continuous session. Biases toward staying in the current domain for a
 * short streak (less context-switching) but ultimately favours whichever
 * domain has the least confidence built up, so the full set gets covered.
 *
 * Domains are also STAGED. Some questions are meaningless until earlier
 * ones have produced signal:
 *   - The conjoined survey pairs an identity item with a money attribute
 *     and fits against that person's existing identity ratings. Before
 *     those ratings exist they're all sitting at the 1500 default, so the
 *     identity half of the comparison is pure noise and the answer teaches
 *     the model nothing. It stays locked until the identity surveys have
 *     produced real ratings.
 *   - The financial survey is fine from the start (it's self-contained),
 *     but leading with money reads badly, so it opens slightly later.
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

export function randomStreakTarget(rand: () => number = Math.random): number {
  return 4 + Math.floor(rand() * 5); // 4..8
}

/** Domains that are worth asking right now, given total progress so far. */
export function availableDomains(domains: DomainState[]): DomainState[] {
  const itemAnswers = domains
    .filter((d) => d.kind === "ITEMS")
    .reduce((sum, d) => sum + d.answeredCount, 0);

  const open = domains.filter((d) => itemAnswers >= (UNLOCK_AFTER[d.slug] ?? 0));
  // Never return an empty pool — if nothing has unlocked yet, the item
  // surveys are always available.
  return open.length ? open : domains.filter((d) => d.kind === "ITEMS");
}

export function pickNextDomain(
  domains: DomainState[],
  excludeSlug: string | null,
  rand: () => number = Math.random
): string {
  const open = availableDomains(domains);
  const pool = open.length > 1 && excludeSlug ? open.filter((d) => d.slug !== excludeSlug) : open;
  const usable = pool.length ? pool : open;

  const weights = usable.map((d) => Math.max(0.05, 1 - d.confidence));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < usable.length; i++) {
    r -= weights[i];
    if (r <= 0) return usable[i].slug;
  }
  return usable[usable.length - 1].slug;
}

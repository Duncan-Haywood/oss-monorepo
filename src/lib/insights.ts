/**
 * Level-gated insight unlocks.
 *
 * Design notes (why it's shaped this way):
 *  - Goal gradient: effort accelerates as a visible target nears, so the UI
 *    always names the NEXT unlock and how many swipes remain. Never show a
 *    bare percentage with no named reward attached.
 *  - Curiosity gap: a locked insight shows its title but not its content.
 *    A named-but-hidden reward pulls harder than an unnamed one.
 *  - Variable schedule: unlocks are not every N levels on the dot. Early
 *    ones come fast (levels 1-3) to establish the loop, then spread out,
 *    so the payoff isn't perfectly predictable.
 *  - Escalating value: later unlocks genuinely require more data to be
 *    meaningful (a stable top-5 needs more comparisons than a top-1), so
 *    the gating is honest rather than artificial withholding.
 */

export const SWIPES_PER_LEVEL = 10;

export type InsightKey =
  | "top-pick"
  | "bottom-pick"
  | "top-three"
  | "category-lean"
  | "money-vs-identity"
  | "hours-price"
  | "full-ranking"
  | "confidence-map"
  | "value-profile"
  | "self-vs-partner";

export type InsightDef = {
  key: InsightKey;
  level: number;
  title: string;
  teaser: string;
  /** Which survey kind supplies this insight. */
  source: "ITEMS" | "FINANCIAL" | "CONJOINED" | "ANY";
};

/** Ordered by unlock level. Early + frequent, then spaced out. */
export const INSIGHTS: InsightDef[] = [
  { key: "top-pick", level: 2, title: "Your #1 so far", teaser: "The single thing rated highest.", source: "ITEMS" },
  { key: "bottom-pick", level: 3, title: "Your least favourite", teaser: "The one rated lowest.", source: "ITEMS" },
  { key: "top-three", level: 5, title: "Your top 3", teaser: "The three clear front-runners.", source: "ITEMS" },
  { key: "category-lean", level: 7, title: "What kind of person you lean toward", teaser: "Which whole category scores highest.", source: "ITEMS" },
  { key: "value-profile", level: 8, title: "What you actually value", teaser: "Your ranking broken down into warmth, ambition, adventure and nine more.", source: "ITEMS" },
  { key: "hours-price", level: 10, title: "The price of time", teaser: "What an extra hour a week is worth in money to you.", source: "FINANCIAL" },
  { key: "money-vs-identity", level: 13, title: "Money vs. who they are", teaser: "Which one actually moves you more.", source: "CONJOINED" },
  { key: "top-three", level: 16, title: "Your top 5, stabilised", teaser: "Now with enough data to be confident.", source: "ITEMS" },
  { key: "confidence-map", level: 20, title: "What you're still torn on", teaser: "Where your preferences are genuinely undecided.", source: "ANY" },
  { key: "full-ranking", level: 25, title: "Your complete ranking", teaser: "Everything, in order, with error bars.", source: "ANY" },
];

export function levelForAnswers(totalAnswers: number): number {
  return Math.floor(totalAnswers / SWIPES_PER_LEVEL) + 1;
}

export function answersIntoLevel(totalAnswers: number): number {
  return totalAnswers % SWIPES_PER_LEVEL;
}

export function unlockedInsights(level: number): InsightDef[] {
  return INSIGHTS.filter((i) => i.level <= level);
}

export function nextInsight(level: number): InsightDef | null {
  return INSIGHTS.find((i) => i.level > level) ?? null;
}

/** Swipes remaining until the next locked insight opens. */
export function swipesUntilNextInsight(totalAnswers: number): number | null {
  const level = levelForAnswers(totalAnswers);
  const next = nextInsight(level);
  if (!next) return null;
  const answersNeeded = (next.level - 1) * SWIPES_PER_LEVEL;
  return Math.max(0, answersNeeded - totalAnswers);
}

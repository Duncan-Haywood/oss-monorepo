/**
 * Insight catalogue.
 *
 * Insights are gated by DATA READINESS, never by level. If the numbers can
 * support a claim, it shows immediately — levels exist to mark progress and
 * make the swiping feel rewarding, not to withhold something already earned.
 * Holding back an answer the data already supports is just friction wearing
 * a progress bar.
 *
 * Each entry therefore carries `needs`: a plain-language description of what
 * is actually missing, shown in place of the insight until it's ready. That
 * is strictly more useful than "Level 8" because it tells someone what to do
 * to get it.
 */

export const SWIPES_PER_LEVEL = 10;

export type InsightKey =
  | "top-pick"
  | "bottom-pick"
  | "top-three"
  | "category-lean"
  | "value-profile"
  | "tradeoffs"
  | "money-vs-identity"
  | "hours-price"
  | "full-ranking"
  | "confidence-map";

export type InsightDef = {
  key: InsightKey;
  title: string;
  teaser: string;
  /** What's missing, in terms of what the person can actually do about it. */
  needs: string;
  source: "ITEMS" | "FINANCIAL" | "CONJOINED" | "ANY";
};

/** Display order — roughly how quickly each becomes available in practice. */
export const INSIGHTS: InsightDef[] = [
  {
    key: "top-pick",
    title: "Your #1 so far",
    teaser: "The single thing rated highest.",
    needs: "A few more answers.",
    source: "ITEMS",
  },
  {
    key: "bottom-pick",
    title: "Your least favourite",
    teaser: "The one rated lowest.",
    needs: "A few more answers.",
    source: "ITEMS",
  },
  {
    key: "top-three",
    title: "Your top few",
    teaser: "The clear front-runners.",
    needs: "A few more answers so the order settles.",
    source: "ITEMS",
  },
  {
    key: "value-profile",
    title: "What you actually value",
    teaser: "Your ranking broken down into warmth, ambition, adventure and nine more.",
    needs: "Answers spread across a few different kinds of thing.",
    source: "ITEMS",
  },
  {
    key: "tradeoffs",
    title: "What wins when they conflict",
    teaser: "What you actually pick when two things you want can't both happen.",
    needs: "More head-to-heads between different kinds of thing.",
    source: "ITEMS",
  },
  {
    key: "category-lean",
    title: "What kind of person you lean toward",
    teaser: "Which whole category scores highest.",
    needs: "Answers covering at least a couple of categories.",
    source: "ITEMS",
  },
  {
    key: "hours-price",
    title: "The price of time",
    teaser: "What an extra hour a week is worth in money to you.",
    needs: "Some of the money questions.",
    source: "FINANCIAL",
  },
  {
    key: "money-vs-identity",
    title: "Money vs. who they are",
    teaser: "Which one actually moves you more.",
    needs: "Some of the combined money-and-person questions.",
    source: "CONJOINED",
  },
  {
    key: "confidence-map",
    title: "What you're still torn on",
    teaser: "Where your preferences are genuinely undecided.",
    needs: "Enough answers to tell 'undecided' apart from 'not asked yet'.",
    source: "ANY",
  },
  {
    key: "full-ranking",
    title: "Your complete ranking",
    teaser: "Everything, in order, with error bars.",
    needs: "A broad pass over most of the options.",
    source: "ANY",
  },
];

export function levelForAnswers(totalAnswers: number): number {
  return Math.floor(totalAnswers / SWIPES_PER_LEVEL) + 1;
}

export function answersIntoLevel(totalAnswers: number): number {
  return totalAnswers % SWIPES_PER_LEVEL;
}

export function answersUntilNextLevel(totalAnswers: number): number {
  return SWIPES_PER_LEVEL - answersIntoLevel(totalAnswers);
}

/**
 * Insight catalogue.
 *
 * Insights are gated by DATA READINESS, never by level. If the numbers can
 * support a claim, it shows immediately — levels exist to mark progress and
 * make the swiping feel rewarding, not to withhold something already earned.
 */

export const SWIPES_PER_LEVEL = 10;

export type InsightKey =
  | "top-pick"
  | "bottom-pick"
  | "top-three"
  | "disfavored-items"
  | "category-lean"
  | "disfavored-categories"
  | "value-profile"
  | "deep-profile"
  | "trait-profile"
  | "tradeoffs"
  | "couple-prompt"
  | "emotional-harmony"
  | "stress-dynamics"
  | "energy-pace"
  | "vulnerability-bridge"
  | "growth-ambition"
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
    key: "disfavored-items",
    title: "Things you disfavor most",
    teaser: "The items rated lowest across your comparisons.",
    needs: "A few more answers to identify strong disfavor.",
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
    key: "deep-profile",
    title: "The deeper pattern behind your choices",
    teaser: "Relationship needs, bonding styles, future preferences and tensions — with the cards behind every claim.",
    needs: "Several meaningful choices that repeat the same underlying signals.",
    source: "ITEMS",
  },
  {
    key: "trait-profile",
    title: "Your Psychological & Relational Trait Vector",
    teaser: "Your choice tendencies broken down into Love Languages, Relational Drivers, and Stress Response styles.",
    needs: "Answers across several items.",
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
    key: "couple-prompt",
    title: "One question worth asking each other",
    teaser: "A concrete check-in drawn from a relationship pattern you rated clearly.",
    needs: "A clear signal in the everyday relationship topics.",
    source: "ITEMS",
  },
  {
    key: "emotional-harmony",
    title: "Emotional & Relational Harmony Index",
    teaser: "Deep analysis of your shared emotional dialect and primary love language alignment.",
    needs: "Both partners swiping enough items in common.",
    source: "ITEMS",
  },
  {
    key: "stress-dynamics",
    title: "Stress & Conflict Co-Regulation Profile",
    teaser: "How you both handle tension, co-regulation, and solitude under pressure.",
    needs: "Both partners swiping relationship items.",
    source: "ITEMS",
  },
  {
    key: "energy-pace",
    title: "Energy, Pace & Spontaneity Compatibility",
    teaser: "How your daily rhythms, spontaneity, and adventure styles align.",
    needs: "Shared answers in lifestyle and activity domains.",
    source: "ITEMS",
  },
  {
    key: "vulnerability-bridge",
    title: "Vulnerability & Intimacy Bridge",
    teaser: "High-vulnerability shared preferences that act as bridges to deeper connection.",
    needs: "Shared high-vulnerability ratings.",
    source: "ITEMS",
  },
  {
    key: "growth-ambition",
    title: "Growth & Shared Ambition Alignment",
    teaser: "Long-term alignment on vision, legacy, and shared life milestones.",
    needs: "Shared ratings in values and future goals.",
    source: "ITEMS",
  },
  {
    key: "category-lean",
    title: "The kind of person you lean toward",
    teaser: "The qualities that cluster in the people you keep choosing.",
    needs: "Answers covering at least a couple of categories.",
    source: "ITEMS",
  },
  {
    key: "disfavored-categories",
    title: "The patterns you tend to reject",
    teaser: "Lower-ranked clusters and the specific qualities driving them.",
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
    title: "Your complete visual ranking",
    teaser: "Everything in order, with strength and uncertainty shown visually.",
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

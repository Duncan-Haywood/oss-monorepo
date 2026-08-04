import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Perspective } from "@prisma/client";
import {
  CARD_METADATA_VERSION,
  metadataForCard,
  THEME_LABELS,
  type CardMetadata,
  type RelationshipTheme,
} from "@/lib/cardMetadata";

/** Short, readable, unambiguous invite codes (no 0/O/1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export type Ranking = Map<
  string,
  { label: string; rating: number; rd: number; category: string | null; dimensions: string[]; metadata?: CardMetadata }
>;

/**
 * A user's merged ranking for one perspective, keyed by item label so the
 * same concept lines up across the activities/professions/combined
 * surveys. Items never shown to that person are excluded.
 *
 * Two queries regardless of how many surveys the person has started — this
 * runs five times per request on the couple screen, so a per-participant
 * round trip here turns into thirty of them.
 */
export async function rankingFor(userId: string, perspective: Perspective): Promise<Ranking> {
  const participants = await prisma.participant.findMany({
    where: { userId, perspective, survey: { kind: "ITEMS" } },
    select: { id: true },
  });
  if (participants.length === 0) return new Map();

  // Only rows that exist carry signal: an item with no ParticipantItemRating
  // was never shown, and would come back at the default rd of 350.
  const ratings = await prisma.participantItemRating.findMany({
    where: { participantId: { in: participants.map((p) => p.id) }, rd: { lt: MAX_RD } },
    select: {
      rating: true,
      rd: true,
      item: { select: { label: true, category: true, dimensions: true, metadata: true } },
    },
  });

  const merged: Ranking = new Map();
  for (const r of ratings) {
    const prev = merged.get(r.item.label);
    // Same concept in two surveys: keep whichever the model is surest about.
    if (!prev || r.rd < prev.rd) {
      merged.set(r.item.label, {
        label: r.item.label,
        rating: r.rating,
        rd: r.rd,
        category: r.item.category,
        dimensions: r.item.dimensions ?? [],
        metadata: (r.item.metadata as CardMetadata | null) ??
          metadataForCard({ dimensions: r.item.dimensions ?? [], category: r.item.category }),
      });
    }
  }
  return merged;
}

/** Glicko-2's starting deviation. At or above it, nothing has been learned. */
const MAX_RD = 349;

/** Above this the interval is so wide the ordering is mostly noise. */
const CONFIDENT_RD = 200;

/**
 * Below this many confidently-rated items, one person's ranking is too
 * coarse to say anything about the *other* person by comparison. Six items
 * means percentile steps of 20 points; a single extra answer would reshuffle
 * the output. Better to show nothing than to invent a difference.
 */
const MIN_ITEMS_FOR_CROSS_PERSON = 8;

/**
 * Turns one person's ratings into 0–100 positions *within their own list*.
 *
 * This is the load-bearing step for every cross-person comparison. Glicko
 * ratings are not comparable between two people: they are per-respondent, so
 * the spread depends almost entirely on how many questions that person
 * answered. After 200 answers a ranking might span 1200–1900; after 30 it
 * barely leaves 1450–1550. Subtracting one person's rating from another's —
 * which is what "this matters more to them" used to do — therefore measured
 * who had swiped more, not who cared more. The partner who answered less
 * could never appear to want anything.
 *
 * A percentile position removes the scale entirely: 90 means "near the top of
 * everything *they* rated", for both of them, whatever the raw numbers. Ties
 * take the midrank, so items that genuinely sit level don't get an arbitrary
 * order imposed on them.
 */
export function strengthScores(ranking: Ranking, maxRd = CONFIDENT_RD): Map<string, number> {
  const rated = [...ranking.values()].filter((r) => r.rd < maxRd);
  const n = rated.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(rated[0].label, 50);
    return out;
  }

  const sorted = rated.slice().sort((a, b) => a.rating - b.rating);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].rating === sorted[i].rating) j++;
    const midRank = (i + j) / 2;
    const pct = (midRank / (n - 1)) * 100;
    for (let k = i; k <= j; k++) out.set(sorted[k].label, pct);
    i = j + 1;
  }
  return out;
}


export type ActionItem = { label: string; rating: number; rd: number; category: string | null };

/**
 * The single most useful output of the whole app: concrete things one
 * person can actually DO for the other, taken from the categories that
 * describe actions rather than identity.
 *
 * A ranking of professions is interesting. "They'd rather you took a task
 * off their plate than bought them something" is usable tonight, which is
 * the difference between a curiosity and something that strengthens a
 * relationship.
 */
export const ACTIONABLE_CATEGORIES = new Set([
  "Behaviour",
  "Affection",
  "Relationship",
  "Communication",
  "Intimacy",
]);

export function actionableTop(ranking: Ranking, limit = 6): ActionItem[] {
  return [...ranking.values()]
    .filter((r) => r.category && ACTIONABLE_CATEGORIES.has(r.category))
    // Only things measured with reasonable certainty — telling someone to do
    // the wrong thing confidently is worse than saying nothing.
    .filter((r) => r.rd < CONFIDENT_RD)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
    .map((r) => ({ label: r.label, rating: r.rating, rd: r.rd, category: r.category }));
}

/** Items the model is sure enough about to be worth acting on. */
export function confidentCount(ranking: Ranking, maxRd = CONFIDENT_RD): number {
  let n = 0;
  for (const r of ranking.values()) if (r.rd < maxRd) n++;
  return n;
}

/** Of those, the ones describing something a person can actually do. */
export function actionableCount(ranking: Ranking, maxRd = CONFIDENT_RD): number {
  let n = 0;
  for (const r of ranking.values()) {
    if (r.category && ACTIONABLE_CATEGORIES.has(r.category) && r.rd < maxRd) n++;
  }
  return n;
}

export type Readiness = {
  ready: boolean;
  /** Progress toward `needed`. Null on a side the section does not depend on. */
  mine: number | null;
  theirs: number | null;
  needed: number;
  waitingOn: "you" | "them" | "both" | null;
};

function readinessOf(mine: number | null, theirs: number | null, needed: number): Readiness {
  const mineShort = mine !== null && mine < needed;
  const theirsShort = theirs !== null && theirs < needed;
  const waitingOn = mineShort && theirsShort ? "both" : mineShort ? "you" : theirsShort ? "them" : null;
  return { ready: waitingOn === null, mine, theirs, needed, waitingOn };
}

export type CoupleReadiness = {
  makeThemHappy: Readiness;
  makeYouHappy: Readiness;
  shared: Readiness;
  mattersMoreToThem: Readiness;
};

/**
 * Why each actionable section is or isn't showing yet.
 *
 * These four all sit behind `CONFIDENT_RD`, and measurement against two real
 * accounts put that further away than anyone guessed: after ~90 answers the
 * lowest deviation any item reached was 170, with exactly one item under 200.
 * So the half of this screen a couple would actually act on stays empty for
 * several hundred answers.
 *
 * The threshold is not the bug — advising someone confidently off four swipes
 * is the failure mode this project exists to avoid. The bug was rendering
 * these sections only when non-empty, so they vanished with nothing saying
 * they existed or how much further there was to go. Answering the next
 * question has to be worth it, and that means naming what it buys.
 */
export function coupleReadiness(mine: Ranking, theirs: Ranking): CoupleReadiness {
  const crossPerson = readinessOf(
    confidentCount(mine),
    confidentCount(theirs),
    MIN_ITEMS_FOR_CROSS_PERSON,
  );
  return {
    // One item is enough to name a top thing to do; it is the *ordering* of a
    // list that needs a crowd, not the existence of its first entry.
    makeThemHappy: readinessOf(null, actionableCount(theirs), 1),
    makeYouHappy: readinessOf(actionableCount(mine), null, 1),
    shared: crossPerson,
    mattersMoreToThem: crossPerson,
  };
}

export type SharedValue = { label: string; aStrength: number; bStrength: number; combined: number };

/**
 * What you BOTH rate highly. Common ground is the thing couples most often
 * can't articulate about themselves, and it's more useful to surface than
 * another list of differences.
 *
 * Both must place it above their own middle — otherwise "shared" degrades
 * into "whatever the less-decided partner happened to rate least badly".
 */
export function sharedValues(a: Ranking, b: Ranking, limit = 6): SharedValue[] {
  const sa = strengthScores(a);
  const sb = strengthScores(b);
  if (sa.size < MIN_ITEMS_FOR_CROSS_PERSON || sb.size < MIN_ITEMS_FOR_CROSS_PERSON) return [];

  const out: SharedValue[] = [];
  for (const [label, aStrength] of sa) {
    const bStrength = sb.get(label);
    if (bStrength === undefined) continue;
    if (aStrength <= 50 || bStrength <= 50) continue;
    out.push({ label, aStrength, bStrength, combined: Math.min(aStrength, bStrength) });
  }
  // Strongest common ground first; ties broken by the total so the item
  // they're jointly highest on wins.
  return out
    .sort((x, y) => y.combined - x.combined || y.aStrength + y.bStrength - (x.aStrength + x.bStrength))
    .slice(0, limit);
}

export type Asymmetry = { label: string; theirStrength: number; myStrength: number; gap: number };

export type CategoryCompass = {
  shared: { category: string; mine: number; theirs: number; combined: number }[];
  differences: { category: string; mine: number; theirs: number; gap: number }[];
};

export type ThemeEvidence = {
  label: string;
  strength: number;
  contribution: number;
};

export type CoupleThemeInsight = {
  key: RelationshipTheme;
  label: string;
  mine: number;
  theirs: number;
  pattern: "shared-strength" | "difference" | "complement";
  headline: string;
  interpretation: string;
  prompt: string;
  confidence: { mineCards: number; theirCards: number; overlapCards: number };
  evidence: { mine: ThemeEvidence[]; theirs: ThemeEvidence[] };
  provenance: { taxonomyVersion: string; calculation: string };
};

type ThemeScore = { score: number; evidence: ThemeEvidence[] };

function deriveThemesFromCategoryAndLabel(label: string, category: string | null): RelationshipTheme[] {
  const l = label.toLowerCase();
  const c = (category ?? "").toLowerCase();
  const themes: RelationshipTheme[] = [];

  if (c.includes("communication") || c.includes("stress") || c.includes("relationship") || l.includes("listen") || l.includes("comfort") || l.includes("repair") || l.includes("overwhelmed")) {
    themes.push("emotional-safety");
  }
  if (c.includes("lifestyle") || c.includes("behaviour") || l.includes("plan") || l.includes("routine")) {
    themes.push("practical-support");
  }
  if (c.includes("intimacy") || c.includes("affection") || l.includes("desire") || l.includes("hug")) {
    themes.push("intimacy-affection");
  }
  if (c.includes("values") || c.includes("future") || l.includes("family") || l.includes("vision")) {
    themes.push("shared-vision");
  }
  if (c.includes("character") || l.includes("prestige") || l.includes("work") || l.includes("private")) {
    themes.push("autonomy-boundaries");
  }

  return themes.length > 0 ? themes : ["emotional-safety"];
}

function scoresByTheme(ranking: Ranking): Map<RelationshipTheme, ThemeScore> {
  const strengths = strengthScores(ranking);
  const grouped = new Map<RelationshipTheme, ThemeEvidence[]>();
  for (const [label, strength] of strengths) {
    const item = ranking.get(label);
    const themes = (item?.metadata?.themes && item.metadata.themes.length > 0)
      ? item.metadata.themes
      : deriveThemesFromCategoryAndLabel(label, item?.category ?? null);
    for (const theme of themes) {
      const rows = grouped.get(theme) ?? [];
      // Extremes are informative; a card at the midpoint contributes zero.
      rows.push({ label, strength, contribution: Math.abs(strength - 50) });
      grouped.set(theme, rows);
    }
  }
  return new Map(
    [...grouped].flatMap(([theme, evidence]) => {
      if (evidence.length < 2) return [];
      const weighted = evidence.reduce((sum, row) => sum + row.strength * Math.max(row.contribution, 10), 0);
      const weight = evidence.reduce((sum, row) => sum + Math.max(row.contribution, 10), 0);
      return [[theme, {
        score: weighted / weight,
        evidence: evidence.sort((a, b) => b.contribution - a.contribution).slice(0, 4),
      }] as const];
    }),
  );
}

/**
 * Higher-order couple findings built from semantic card tags. Each finding
 * carries the cards that produced it, sample counts, taxonomy version, and
 * calculation text so it can be challenged rather than merely believed.
 */
export function coupleThemeInsights(mine: Ranking, theirs: Ranking, limit = 6): CoupleThemeInsight[] {
  const my = scoresByTheme(mine);
  const their = scoresByTheme(theirs);
  const rows: (CoupleThemeInsight & { priority: number })[] = [];
  for (const [key, myTheme] of my) {
    const theirTheme = their.get(key);
    if (!theirTheme) continue;
    const gap = Math.abs(myTheme.score - theirTheme.score);
    const shared = Math.min(myTheme.score, theirTheme.score);
    const pattern = shared >= 50
      ? "shared-strength"
      : gap >= 22
        ? "difference"
        : myTheme.score >= 55 || theirTheme.score >= 55
          ? "complement"
          : null;
    if (!pattern) continue;

    const label = THEME_LABELS[key as RelationshipTheme] ?? String(key).replaceAll("-", " ");
    const highIsMine = myTheme.score >= theirTheme.score;
    const headline = pattern === "shared-strength"
      ? `${label} is part of your shared relationship blueprint`
      : pattern === "difference"
        ? `${label} may feel more central to ${highIsMine ? "you" : "your partner"}`
        : `You may express ${label.toLowerCase()} in different ways`;
    const interpretation = pattern === "shared-strength"
      ? `You both repeatedly place ${label.toLowerCase()} above other needs. This is common ground worth protecting when life gets busy.`
      : pattern === "difference"
        ? `This is not a compatibility verdict. It suggests the same situation may carry different emotional weight for each of you, which can create missed bids unless it is named.`
        : `The overall priority is similar enough, but different cards are driving it. Agreeing on the value may hide a useful conversation about what it looks like in practice.`;
    const prompt = pattern === "shared-strength"
      ? `What is one ritual that would protect ${label.toLowerCase()} for us this month?`
      : `When do you feel most—and least—supported around ${label.toLowerCase()}? What would a small improvement look like?`;

    rows.push({
      key,
      label,
      mine: Math.round(myTheme.score),
      theirs: Math.round(theirTheme.score),
      pattern,
      headline,
      interpretation,
      prompt,
      confidence: {
        mineCards: myTheme.evidence.length,
        theirCards: theirTheme.evidence.length,
        overlapCards: myTheme.evidence.filter((m) => theirTheme.evidence.some((t) => t.label === m.label)).length,
      },
      evidence: { mine: myTheme.evidence, theirs: theirTheme.evidence },
      provenance: {
        taxonomyVersion: CARD_METADATA_VERSION,
        calculation: "Within-person percentile strengths, grouped by semantic theme; at least two measured cards per person.",
      },
      priority: pattern === "difference" ? gap + 20 : shared,
    });
  }
  return rows.sort((a, b) => b.priority - a.priority).slice(0, limit).map((r) => {
    const row = { ...r } as Record<string, unknown>;
    delete row.priority;
    return row as unknown as CoupleThemeInsight;
  });
}

/**
 * Rolls item-level positions into relationship themes. Item differences are
 * useful but noisy and literal; this is the "what kind of relationship are
 * we each trying to build?" layer above them.
 */
export function categoryCompass(mine: Ranking, theirs: Ranking, limit = 5): CategoryCompass {
  const scoresFor = (ranking: Ranking) => {
    const strengths = strengthScores(ranking);
    const grouped = new Map<string, number[]>();
    for (const [label, score] of strengths) {
      const category = ranking.get(label)?.category;
      if (!category) continue;
      const values = grouped.get(category) ?? [];
      values.push(score);
      grouped.set(category, values);
    }
    return new Map(
      [...grouped]
        .filter(([, values]) => values.length >= 2)
        .map(([category, values]) => [
          category,
          values.reduce((sum, value) => sum + value, 0) / values.length,
        ])
    );
  };

  const myScores = scoresFor(mine);
  const theirScores = scoresFor(theirs);
  const rows = [...myScores].flatMap(([category, myScore]) => {
    const theirScore = theirScores.get(category);
    if (theirScore === undefined) return [];
    return [{
      category,
      mine: myScore,
      theirs: theirScore,
      combined: Math.min(myScore, theirScore),
      gap: Math.abs(myScore - theirScore),
    }];
  });

  return {
    shared: rows
      .filter((row) => row.mine > 50 && row.theirs > 50)
      .sort((a, b) => b.combined - a.combined)
      .slice(0, limit)
      .map(({ category, mine: myScore, theirs: theirScore, combined }) => ({
        category,
        mine: myScore,
        theirs: theirScore,
        combined,
      })),
    differences: rows
      .filter((row) => row.gap >= 15)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, limit)
      .map(({ category, mine: myScore, theirs: theirScore, gap }) => ({
        category,
        mine: myScore,
        theirs: theirScore,
        gap,
      })),
  };
}

/**
 * Where one person cares far more than the other. Framed as "this matters
 * to them much more than to you" — the actionable asymmetry, not a fault.
 *
 * The gap is a difference of within-person positions, in points out of 100,
 * so it means the same thing regardless of how much either of you answered.
 */
export function asymmetries(mine: Ranking, theirs: Ranking, limit = 5): Asymmetry[] {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return [];

  const rows: Asymmetry[] = [];
  for (const [label, theirStrength] of sTheirs) {
    const myStrength = sMine.get(label);
    if (myStrength === undefined) continue;
    rows.push({ label, theirStrength, myStrength, gap: theirStrength - myStrength });
  }
  // Only real asymmetries: a difference this side of a fifth of the list is
  // within the noise of a few extra answers.
  return rows
    .filter((r) => r.gap >= 20)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);
}

export type DateNightIdea = {
  title: string;
  category: string | null;
  sharedItem: string;
  description: string;
};

/**
  * Generates concrete Date Night ideas and shared micro-adventures from items
  * that both partners rate highly.
  */
export function dateNightIdeas(mine: Ranking, theirs: Ranking, limit = 4): DateNightIdea[] {
  const shared = sharedValues(mine, theirs, 10);
  if (shared.length === 0) return [];

  const ideas: DateNightIdea[] = [];
  for (const s of shared) {
    const cat = mine.get(s.label)?.category ?? null;
    let description = `Plan an evening centered around ${s.label.toLowerCase()} together.`;
    if (s.label.toLowerCase().includes("cook") || s.label.toLowerCase().includes("food") || cat === "Behaviour") {
      description = `Chef's Challenge: Cook a menu built around ${s.label.toLowerCase()} together tonight.`;
    } else if (s.label.toLowerCase().includes("trip") || s.label.toLowerCase().includes("travel") || s.label.toLowerCase().includes("outdoor")) {
      description = `Micro-Adventure: Spend a Saturday morning exploring ${s.label.toLowerCase()}.`;
    } else if (cat === "Intimacy" || cat === "Affection") {
      description = `Uninterrupted Evening: Dedicate 2 phone-free hours to ${s.label.toLowerCase()}.`;
    } else if (cat === "Communication" || cat === "Relationship") {
      description = `Coffee & Conversation: Grab drinks and share what you both love about ${s.label.toLowerCase()}.`;
    }
    ideas.push({
      title: `${s.label}`,
      category: cat,
      sharedItem: s.label,
      description,
    });
    if (ideas.length >= limit) break;
  }
  return ideas;
}

export type ConversationStarter = {
  type: "BLIND_SPOT" | "ASYMMETRY";
  itemLabel: string;
  headline: string;
  prompt: string;
};

/**
  * Generates curious, non-judgmental conversation prompts for blind spots
  * and major preference gaps between partners.
  */
export function conversationStarters(
  blindSpots?: Comparison,
  mattersMoreToThem?: Asymmetry[],
  limit = 4,
): ConversationStarter[] {
  const starters: ConversationStarter[] = [];

  if (blindSpots && blindSpots.diverged.length > 0) {
    for (const d of blindSpots.diverged.slice(0, 2)) {
      starters.push({
        type: "BLIND_SPOT",
        itemLabel: d.label,
        headline: `Surprise preference: ${d.label}`,
        prompt: `You guessed differently than they rated "${d.label}". Over coffee, ask: "What does ${d.label.toLowerCase()} mean for you right now?"`,
      });
    }
  }

  if (mattersMoreToThem && mattersMoreToThem.length > 0) {
    for (const a of mattersMoreToThem.slice(0, 2)) {
      starters.push({
        type: "ASYMMETRY",
        itemLabel: a.label,
        headline: `Matters deeply to them: ${a.label}`,
        prompt: `"${a.label}" sits near the top of their list. Try asking: "How can I support you more with ${a.label.toLowerCase()}?"`,
      });
    }
  }

  return starters.slice(0, limit);
}

export type ExpressionDimension = {
  name: string;
  glyph: string;
  mineScore: number;
  theirsScore: number;
  alignmentPct: number;
};

/**
  * Synthesizes preferences into 4 core relationship dimensions.
  */
export function expressionProfiles(mine: Ranking, theirs: Ranking): ExpressionDimension[] {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size === 0 || sTheirs.size === 0) return [];

  const dimDefs = [
    { name: "Care & Action", glyph: "🤝", categories: ["Behaviour", "Relationship"] },
    { name: "Quality Time & Adventure", glyph: "🎒", categories: ["Activity", "Lifestyle", "Adventure"] },
    { name: "Affection & Connection", glyph: "💗", categories: ["Affection", "Intimacy", "Communication"] },
    { name: "Autonomy & Values", glyph: "🧭", categories: ["Ambition", "Identity", "Values"] },
  ];

  return dimDefs.map((d) => {
    let mSum = 0, mN = 0;
    let tSum = 0, tN = 0;

    for (const [label, score] of sMine) {
      const cat = mine.get(label)?.category;
      if (cat && d.categories.includes(cat)) {
        mSum += score;
        mN++;
      }
    }
    for (const [label, score] of sTheirs) {
      const cat = theirs.get(label)?.category;
      if (cat && d.categories.includes(cat)) {
        tSum += score;
        tN++;
      }
    }

    const mineScore = mN > 0 ? Math.round(mSum / mN) : 50;
    const theirsScore = tN > 0 ? Math.round(tSum / tN) : 50;
    const gap = Math.abs(mineScore - theirsScore);
    const alignmentPct = Math.max(0, 100 - gap);

    return {
      name: d.name,
      glyph: d.glyph,
      mineScore,
      theirsScore,
      alignmentPct,
    };
  });
}

export type MicroCommitment = {
  itemLabel: string;
  category: string | null;
  challenge: string;
};

/**
  * Maps top actionable items for them into weekly couple challenges.
  */
export function microCommitments(makeThemHappy: ActionItem[], limit = 3): MicroCommitment[] {
  return makeThemHappy.slice(0, limit).map((item) => ({
    itemLabel: item.label,
    category: item.category,
    challenge: `Surprise them by doing or planning "${item.label}" this week without being asked.`,
  }));
}

export type ComparisonRow = {
  label: string;
  a: number;
  b: number;
  gap: number;
};

export type Comparison = {
  overlap: number;
  /** Spearman rank correlation over the shared items, -1..1. */
  agreement: number | null;
  /**
   * The fraction of the spread in these two rankings that is real preference
   * rather than measurement error, 0–1. `agreement` is suppressed below
   * `MIN_RELIABILITY`; above it, this is how much to trust the figure.
   */
  reliability: number;
  aligned: ComparisonRow[];
  diverged: ComparisonRow[];
};

/** Enough shared items for the aligned/diverged lists to mean anything. */
const MIN_OVERLAP_FOR_ROWS = 5;

/**
 * Spearman's rho over three items can only come out as ±1 or ±0.5, so a
 * couple with three items in common was being shown "100% match" — a number
 * that was pure arithmetic, not a finding. Eight is where the statistic
 * starts to carry information rather than manufacture it.
 */
const MIN_OVERLAP_FOR_AGREEMENT = 8;

/**
 * How much of the spread in a ranking is real preference rather than the
 * model's own uncertainty.
 *
 * A stored rating is an estimate, and `rd` is the standard deviation of that
 * estimate. So the variance you can see in someone's ratings is the variance
 * of what they actually want *plus* the variance of the measurement:
 *
 *     var(observed) = var(true) + mean(rd²)
 *
 * Rearranged, the share of the visible spread that is signal is
 * `1 - mean(rd²)/var(observed)`. At 1 the ordering is exact; at 0 it is a
 * shuffle. This is the classical reliability coefficient, and it is the
 * quantity every cross-person statistic here is silently multiplied by.
 */
export function reliabilityOf(entries: { rating: number; rd: number }[]): number {
  const n = entries.length;
  if (n < 2) return 0;
  const mean = entries.reduce((s, e) => s + e.rating, 0) / n;
  const observedVar = entries.reduce((s, e) => s + (e.rating - mean) ** 2, 0) / n;
  if (observedVar <= 0) return 0;
  const errorVar = entries.reduce((s, e) => s + e.rd ** 2, 0) / n;
  return Math.max(0, Math.min(1, 1 - errorVar / observedVar));
}

/**
 * Below this, more than half of the reported agreement is measurement error
 * and the number says more about how much the two of them have answered than
 * about how alike they are.
 *
 * Measured, not chosen. Simulating two people with *identical* preferences and
 * only the deviations this app actually reaches, the reported rho comes back
 * badly shrunk toward zero — an attenuation equal to the reliability itself:
 *
 *  | rd  | reported rho | truth |
 *  | --- | ------------ | ----- |
 *  | 300 | 0.14         | 1.00  |
 *  | 200 | 0.26         | 1.00  |
 *  | 100 | 0.60         | 1.00  |
 *  |  40 | 0.91         | 1.00  |
 *
 * and symmetrically for two people who disagree completely. At the deviations
 * reached after ~90 answers, a couple who want exactly the same things and a
 * couple who want opposite things were both being shown roughly "50% match".
 * At 0.5 the figure still understates a real similarity, which is the safe
 * direction to be wrong in.
 */
const MIN_RELIABILITY = 0.5;

/**
 * The chance of showing a couple at least one difference that is not there,
 * across the whole list. Not per row — per screen, which is what a person
 * actually experiences.
 */
const FAMILY_WISE_ALPHA = 0.05;

/**
 * Inverse standard normal CDF (Acklam's rational approximation, ~1e-9 over the
 * useful range). Needed to turn "one false row per twenty screens" into a
 * number of standard errors, rather than hard-coding one.
 */
function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * How far apart two standardized positions must be, in standard errors, before
 * the difference is worth showing — Bonferroni-corrected for the number of
 * items being examined.
 *
 * The correction is the whole point. A flat two-sigma bar sounds strict and is
 * not: applied independently to forty items it is forty chances to be fooled,
 * and it produced two or three phantom rows on *every* screen for a couple with
 * identical preferences. Testing more things means each one has to clear a
 * higher bar, or the list fills up with whichever items happened to land far
 * apart. At forty items this asks for about 3.2 standard errors.
 */
export function significanceThreshold(comparisons: number): number {
  if (comparisons < 1) return Infinity;
  return normalQuantile(1 - FAMILY_WISE_ALPHA / (2 * comparisons));
}

/**
 * Positions within one person's own shared-item spread, plus the uncertainty
 * of each position on that same scale.
 *
 * Standardizing per person is what makes the two comparable at all — raw
 * ratings are per-respondent and their spread tracks answer count, not
 * conviction. Dividing `rd` by the same spread carries the model's uncertainty
 * onto the scale the comparison happens on, instead of dropping it.
 */
function standardize(m: Ranking, labels: string[]) {
  const entries = labels.map((l) => m.get(l)!);
  const mean = entries.reduce((s, e) => s + e.rating, 0) / entries.length;
  const sd = Math.sqrt(entries.reduce((s, e) => s + (e.rating - mean) ** 2, 0) / entries.length);
  const z = new Map<string, number>();
  const se = new Map<string, number>();
  for (const e of entries) {
    // Every item sits at the same place and nothing can be distinguished.
    z.set(e.label, sd > 0 ? (e.rating - mean) / sd : 0);
    se.set(e.label, sd > 0 ? e.rd / sd : Infinity);
  }
  return { z, se };
}

/**
 * Compares two rankings over the items they have in common.
 *
 * Every row this returns is a claim about two people, so it has to clear the
 * model's own uncertainty before it is made. A difference smaller than the
 * error bars around it is not a finding about the couple — it is the
 * measurement moving — and sorting by the *largest* gap, as this used to,
 * selects for exactly the items with the widest error bars.
 */
export function compareRankings(a: Ranking, b: Ranking): Comparison {
  const shared = [...a.keys()].filter((k) => b.has(k));
  if (shared.length < MIN_OVERLAP_FOR_ROWS) {
    return { overlap: shared.length, agreement: null, reliability: 0, aligned: [], diverged: [] };
  }

  const rank = (m: Ranking): Map<string, number> => {
    const sorted = shared.slice().sort((x, y) => m.get(y)!.rating - m.get(x)!.rating);
    return new Map(sorted.map((label, i) => [label, i + 1]));
  };
  const ra = rank(a);
  const rb = rank(b);

  // Spearman's rho. No ties are possible here (ratings are continuous), so
  // the simple 1 - 6*sum(d^2)/(n^3-n) form is exact.
  const n = shared.length;
  let sumD2 = 0;
  for (const label of shared) {
    const d = ra.get(label)! - rb.get(label)!;
    sumD2 += d * d;
  }
  const rho = 1 - (6 * sumD2) / (n * (n * n - 1));

  // Both orderings have to be worth trusting; the weaker one caps the pair.
  const reliability = Math.min(
    reliabilityOf(shared.map((l) => a.get(l)!)),
    reliabilityOf(shared.map((l) => b.get(l)!)),
  );
  const agreement =
    n >= MIN_OVERLAP_FOR_AGREEMENT && reliability >= MIN_RELIABILITY ? rho : null;

  const sa = standardize(a, shared);
  const sb = standardize(b, shared);

  const scored = shared.map((label) => {
    const delta = sa.z.get(label)! - sb.z.get(label)!;
    const se = Math.hypot(sa.se.get(label)!, sb.se.get(label)!);
    return {
      row: { label, a: ra.get(label)!, b: rb.get(label)!, gap: Math.abs(ra.get(label)! - rb.get(label)!) },
      // How many standard errors of daylight there are between the two
      // positions. Below 1 the difference is smaller than the error bars.
      z: se > 0 && Number.isFinite(se) ? Math.abs(delta) / se : 0,
      se,
    };
  });

  // A difference the error bars already explain is not a difference.
  const threshold = significanceThreshold(n);
  const diverged = scored
    .filter((s) => s.z >= threshold)
    .sort((x, y) => y.z - x.z)
    .slice(0, 5)
    .map((s) => s.row);

  // Agreement needs the opposite guarantee: close together *and* measured
  // finely enough that "close" is a finding rather than a shrug. Without the
  // second half, the strongest agreement is always the least-answered item.
  const aligned = scored
    .filter((s) => s.z < 1 && s.se <= 1)
    .sort((x, y) => x.z - y.z || Math.min(x.row.a, x.row.b) - Math.min(y.row.a, y.row.b))
    .slice(0, 5)
    .map((s) => s.row);

  return { overlap: n, agreement, reliability, aligned, diverged };
}

/** The couple a user belongs to, if any, plus the other person. */
export async function coupleFor(userId: string) {
  const couple = await prisma.couple.findFirst({
    where: { OR: [{ creatorId: userId }, { joinerId: userId }] },
    include: {
      creator: { select: { id: true, firstName: true } },
      joiner: { select: { id: true, firstName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!couple) return null;
  const isCreator = couple.creatorId === userId;
  const partner = isCreator ? couple.joiner : couple.creator;
  return { couple, partner };
}

// ---------------------------------------------------------------------------
// DEEP EXPLAINABLE COUPLE INSIGHTS ENGINE
// ---------------------------------------------------------------------------

import { getTraitsForItem, StressResponse } from "@/lib/cardTraitsData";

export type ExplainableInsight = {
  id: string;
  title: string;
  headline: string;
  discovery: string;
  evidenceTrail: {
    cards: { label: string; myPercentile: number; theirPercentile: number; traits: string[] }[];
    underlyingMechanism: string;
    confidence: "High" | "Medium" | "Developing";
  };
  relationalImpact: string;
  actionablePrescription: string;
};

/**
 * 1. Emotional & Relational Harmony Index
 * Evaluates Love Language and Relational Driver alignment with explicit evidence trail.
 */
export function emotionalHarmonyIndex(mine: Ranking, theirs: Ranking): ExplainableInsight | null {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return null;

  const sharedCards: { label: string; myPct: number; theirPct: number; traits: ReturnType<typeof getTraitsForItem> }[] = [];
  for (const [label, myPct] of sMine) {
    const theirPct = sTheirs.get(label);
    if (theirPct !== undefined && (myPct > 60 || theirPct > 60)) {
      const traits = getTraitsForItem({ label, category: mine.get(label)?.category });
      sharedCards.push({ label, myPct: Math.round(myPct), theirPct: Math.round(theirPct), traits });
    }
  }

  if (sharedCards.length < 3) return null;

  // Aggregate love languages
  const loveLangCountsMine: Record<string, number> = {};
  const loveLangCountsTheirs: Record<string, number> = {};
  for (const c of sharedCards) {
    for (const ll of c.traits.loveLanguages) {
      if (c.myPct > 60) loveLangCountsMine[ll] = (loveLangCountsMine[ll] || 0) + (c.myPct / 100);
      if (c.theirPct > 60) loveLangCountsTheirs[ll] = (loveLangCountsTheirs[ll] || 0) + (c.theirPct / 100);
    }
  }

  const topMineLL = Object.entries(loveLangCountsMine).sort((a, b) => b[1] - a[1])[0]?.[0] || "Quality Time";
  const topTheirsLL = Object.entries(loveLangCountsTheirs).sort((a, b) => b[1] - a[1])[0]?.[0] || "Quality Time";

  const isExactMatch = topMineLL === topTheirsLL;
  const topEvidence = sharedCards
    .sort((a, b) => b.myPct + b.theirPct - (a.myPct + a.theirPct))
    .slice(0, 4)
    .map((c) => ({
      label: c.label,
      myPercentile: c.myPct,
      theirPercentile: c.theirPct,
      traits: c.traits.loveLanguages,
    }));

  return {
    id: "emotional-harmony",
    title: "Emotional & Relational Harmony Index",
    headline: isExactMatch
      ? `Shared Emotional Dialect: Both prioritize ${topMineLL}`
      : `Complementary Needs: ${topMineLL} & ${topTheirsLL}`,
    discovery: isExactMatch
      ? `You and your partner speak the exact same primary love language (${topMineLL}). You naturally express and receive affection through similar channels.`
      : `Your primary emotional driver leans toward ${topMineLL}, while your partner's top choices emphasize ${topTheirsLL}. Understanding this difference prevents feeling unappreciated when giving what you'd prefer yourself.`,
    evidenceTrail: {
      cards: topEvidence,
      underlyingMechanism: `Derived from cross-referencing your top-ranked cards against tagged Love Language vectors (${topMineLL} vs ${topTheirsLL}).`,
      confidence: sharedCards.length >= 6 ? "High" : "Medium",
    },
    relationalImpact: isExactMatch
      ? "High alignment reduces friction in daily affection, though you must guard against assuming you always know what the other needs without checking."
      : "Provides clarity on why certain heartfelt gestures might land quietly—translating between your preferred styles unlocks deeper intimacy.",
    actionablePrescription: isExactMatch
      ? `Double down on ${topMineLL} this weekend by setting aside dedicated, distraction-free time together.`
      : `Trade one explicit gesture of ${topTheirsLL} for them while noticing how they offer ${topMineLL} to you.`,
  };
}

/**
 * 2. Stress & Conflict Co-Regulation Profile
 * Analyzes how each partner seeks comfort during stress (e.g., Solitude vs Co-Regulation).
 */
export function stressCoRegulationProfile(mine: Ranking, theirs: Ranking): ExplainableInsight | null {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return null;

  const getStressProfile = (ranking: Ranking, scores: Map<string, number>) => {
    const counts: Record<StressResponse, number> = {
      "Co-Regulation": 0,
      "Solitude / Space": 0,
      "Practical Problem Solving": 0,
      "Emotional Reassurance": 0,
    };
    for (const [label, pct] of scores) {
      if (pct > 55) {
        const traits = getTraitsForItem({ label, category: ranking.get(label)?.category });
        for (const sr of traits.stressResponse) {
          counts[sr] += (pct / 100);
        }
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as StressResponse || "Co-Regulation";
  };

  const mineStress = getStressProfile(mine, sMine);
  const theirsStress = getStressProfile(theirs, sTheirs);

  const evidenceCards: { label: string; myPercentile: number; theirPercentile: number; traits: string[] }[] = [];
  for (const [label, myPct] of sMine) {
    const theirPct = sTheirs.get(label);
    if (theirPct !== undefined && (myPct > 60 || theirPct > 60)) {
      const traits = getTraitsForItem({ label });
      if (traits.stressResponse.includes(mineStress) || traits.stressResponse.includes(theirsStress)) {
        evidenceCards.push({
          label,
          myPercentile: Math.round(myPct),
          theirPercentile: Math.round(theirPct),
          traits: traits.stressResponse,
        });
      }
    }
  }

  const isCoRegulators = mineStress === theirsStress;

  return {
    id: "stress-dynamics",
    title: "Stress & Conflict Co-Regulation Profile",
    headline: isCoRegulators
      ? `Unified Stress Rhythm: ${mineStress}`
      : `Complementary Regulation: ${mineStress} vs ${theirsStress}`,
    discovery: isCoRegulators
      ? `Under stress, you both default to ${mineStress}. You naturally seek similar environmental cues when overwhelmed.`
      : `When pressure builds, your system seeks ${mineStress}, whereas your partner turns toward ${theirsStress}. Recognizing this pattern stops space-seeking from looking like rejection or reassurance-seeking from looking like pressure.`,
    evidenceTrail: {
      cards: evidenceCards.slice(0, 4),
      underlyingMechanism: `Evaluated by analyzing choices on cards tagged with stress regulation mechanisms (${mineStress} vs ${theirsStress}).`,
      confidence: evidenceCards.length >= 4 ? "High" : "Medium",
    },
    relationalImpact: isCoRegulators
      ? "Fast recovery after tense moments, though you must ensure external stress doesn't overwhelm both of you simultaneously."
      : "Crucial for preventing pursuer-distancer loops during disagreements.",
    actionablePrescription: `Establish a pre-agreed 20-minute reset protocol when tension rises, respecting ${theirsStress} before re-engaging.`,
  };
}

/**
 * 3. Energy, Pace & Spontaneity Compatibility
 */
export function energyPaceCompatibility(mine: Ranking, theirs: Ranking): ExplainableInsight | null {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return null;

  const shared = sharedValues(mine, theirs, 5);
  if (shared.length === 0) return null;

  const topEvidence = shared.slice(0, 3).map((s) => ({
    label: s.label,
    myPercentile: Math.round(s.aStrength),
    theirPercentile: Math.round(s.bStrength),
    traits: getTraitsForItem({ label: s.label }).relationalDrivers,
  }));

  return {
    id: "energy-pace",
    title: "Energy, Pace & Spontaneity Compatibility",
    headline: "Balanced Adventure & Shared Ground",
    discovery: `Your choices show high mutual value for ${shared[0].label.toLowerCase()} and shared life rhythms, balancing structure with novel experiences.`,
    evidenceTrail: {
      cards: topEvidence,
      underlyingMechanism: "Calculated from shared top quartile selections in Lifestyle & Activity domains.",
      confidence: "High",
    },
    relationalImpact: "Allows planning joint weekends and trips that feel energizing to both rather than exhausting to one.",
    actionablePrescription: `Schedule an unstructured half-day centered around ${shared[0].label} this month.`,
  };
}

/**
 * 4. Vulnerability & Intimacy Bridge
 */
export function vulnerabilityBridge(mine: Ranking, theirs: Ranking): ExplainableInsight | null {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return null;

  const highVulnCards: { label: string; myPct: number; theirPct: number; traits: string[] }[] = [];
  for (const [label, myPct] of sMine) {
    const theirPct = sTheirs.get(label);
    if (theirPct !== undefined && myPct >= 50 && theirPct >= 50) {
      const t = getTraitsForItem({ label, category: mine.get(label)?.category });
      if (t.effortProfile.vulnerabilityLevel === "High") {
        highVulnCards.push({
          label,
          myPct: Math.round(myPct),
          theirPct: Math.round(theirPct),
          traits: t.relationalDrivers,
        });
      }
    }
  }

  if (highVulnCards.length === 0) return null;

  const topCard = highVulnCards[0];

  return {
    id: "vulnerability-bridge",
    title: "Vulnerability & Intimacy Bridge",
    headline: `Deep Connection Target: ${topCard.label}`,
    discovery: `Both of you placed "${topCard.label}" high in your personal rankings. This represents a prime bridge for deepening trust and emotional intimacy.`,
    evidenceTrail: {
      cards: highVulnCards.slice(0, 3).map((c) => ({
        label: c.label,
        myPercentile: c.myPct,
        theirPercentile: c.theirPct,
        traits: c.traits,
      })),
      underlyingMechanism: "Identified by isolating items tagged with High Vulnerability that sit in both partners' top half.",
      confidence: "High",
    },
    relationalImpact: "Engaging directly with high-vulnerability shared preferences builds long-term psychological safety and romantic longevity.",
    actionablePrescription: `Set aside 30 minutes of quiet, phone-free time to talk openly about "${topCard.label}".`,
  };
}

/**
 * 5. Growth & Shared Ambition Matrix
 */
export function growthAmbitionMatrix(mine: Ranking, theirs: Ranking): ExplainableInsight | null {
  const sMine = strengthScores(mine);
  const sTheirs = strengthScores(theirs);
  if (sMine.size < MIN_ITEMS_FOR_CROSS_PERSON || sTheirs.size < MIN_ITEMS_FOR_CROSS_PERSON) return null;

  const sharedVisions = sharedValues(mine, theirs, 5);
  if (sharedVisions.length === 0) return null;

  const evidence = sharedVisions.slice(0, 3).map((v) => ({
    label: v.label,
    myPercentile: Math.round(v.aStrength),
    theirPercentile: Math.round(v.bStrength),
    traits: getTraitsForItem({ label: v.label }).lifeVision,
  }));

  return {
    id: "growth-ambition",
    title: "Growth & Shared Ambition Alignment",
    headline: `Unified Direction around ${sharedVisions[0].label}`,
    discovery: `Your joint ranking reveals strong alignment on core long-term aspirations—especially around ${sharedVisions[0].label.toLowerCase()}.`,
    evidenceTrail: {
      cards: evidence,
      underlyingMechanism: "Derived from shared top percentile ratings in Values and Future & Family domains.",
      confidence: "High",
    },
    relationalImpact: "Protects the relationship during major life pivots (moves, career shifts, financial decisions) by grounding choices in shared goals.",
    actionablePrescription: `Draft a joint 3-year vision note highlighting how you'll nurture ${sharedVisions[0].label.toLowerCase()} together.`,
  };
}

export type TopSharedItem = {
  label: string;
  myPercentile: number;
  theirPercentile: number;
  combined: number;
  category: string | null;
};

/**
 * Returns exact items where both partners ranked the option in their top percentile tier.
 */
export function topSharedItems(myRanking: Ranking, theirRanking: Ranking, minPercentile = 60): TopSharedItem[] {
  const sMine = strengthScores(myRanking);
  const sTheirs = strengthScores(theirRanking);
  const out: TopSharedItem[] = [];

  for (const [label, myPct] of sMine.entries()) {
    const theirPct = sTheirs.get(label);
    if (theirPct !== undefined && myPct >= minPercentile && theirPct >= minPercentile) {
      out.push({
        label,
        myPercentile: Math.round(myPct),
        theirPercentile: Math.round(theirPct),
        combined: Math.round((myPct + theirPct) / 2),
        category: myRanking.get(label)?.category ?? null,
      });
    }
  }

  return out.sort((a, b) => b.combined - a.combined).slice(0, 10);
}


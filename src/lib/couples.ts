import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Perspective } from "@prisma/client";

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
  { label: string; rating: number; rd: number; category: string | null; dimensions: string[] }
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
      item: { select: { label: true, category: true, dimensions: true } },
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
const ACTIONABLE_CATEGORIES = new Set(["Behaviour", "Affection", "Relationship"]);

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

/** Compares two rankings over the items they have in common. */
export function compareRankings(a: Ranking, b: Ranking): Comparison {
  const shared = [...a.keys()].filter((k) => b.has(k));
  if (shared.length < MIN_OVERLAP_FOR_ROWS) {
    return { overlap: shared.length, agreement: null, aligned: [], diverged: [] };
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
  const agreement =
    n >= MIN_OVERLAP_FOR_AGREEMENT ? 1 - (6 * sumD2) / (n * (n * n - 1)) : null;

  const rows: ComparisonRow[] = shared.map((label) => ({
    label,
    a: ra.get(label)!,
    b: rb.get(label)!,
    gap: Math.abs(ra.get(label)! - rb.get(label)!),
  }));

  const aligned = rows
    .slice()
    .sort((x, y) => x.gap - y.gap || Math.min(x.a, x.b) - Math.min(y.a, y.b))
    .slice(0, 5);
  const diverged = rows
    .slice()
    .sort((x, y) => y.gap - x.gap)
    .slice(0, 5);

  return { overlap: n, agreement, aligned, diverged };
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

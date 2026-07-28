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
export const ACTIONABLE_CATEGORIES = new Set(["Behaviour", "Affection", "Relationship"]);

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

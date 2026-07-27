import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { loadRatedItems } from "@/lib/participantRatings";
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
 */
export async function rankingFor(userId: string, perspective: Perspective): Promise<Ranking> {
  const participants = await prisma.participant.findMany({
    where: { userId, perspective, survey: { kind: "ITEMS" } },
    select: { id: true, surveyId: true },
  });

  const merged: Ranking = new Map();
  for (const p of participants) {
    const items = await loadRatedItems(p.id, p.surveyId);
    for (const i of items) {
      if (i.rd >= 349) continue; // never actually shown — no signal
      const prev = merged.get(i.label);
      if (!prev || i.rd < prev.rd) {
        merged.set(i.label, {
          label: i.label,
          rating: i.rating,
          rd: i.rd,
          category: i.category,
          dimensions: i.dimensions ?? [],
        });
      }
    }
  }
  return merged;
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
    .filter((r) => r.rd < 200)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
    .map((r) => ({ label: r.label, rating: r.rating, rd: r.rd, category: r.category }));
}

export type SharedValue = { label: string; aRating: number; bRating: number; combined: number };

/**
 * What you BOTH rate highly. Common ground is the thing couples most often
 * can't articulate about themselves, and it's more useful to surface than
 * another list of differences.
 */
export function sharedValues(a: Ranking, b: Ranking, limit = 6): SharedValue[] {
  const out: SharedValue[] = [];
  for (const [label, ra] of a) {
    const rb = b.get(label);
    if (!rb) continue;
    if (ra.rd >= 200 || rb.rd >= 200) continue;
    // Both must rate it above their own middle for it to be shared ground.
    out.push({ label, aRating: ra.rating, bRating: rb.rating, combined: Math.min(ra.rating, rb.rating) });
  }
  return out.sort((x, y) => y.combined - x.combined).slice(0, limit);
}

/**
 * Where one person cares far more than the other. Framed as "this matters
 * to them much more than to you" — the actionable asymmetry, not a fault.
 */
export function asymmetries(mine: Ranking, theirs: Ranking, limit = 5) {
  const rows: { label: string; theirRating: number; myRating: number; gap: number }[] = [];
  for (const [label, t] of theirs) {
    const m = mine.get(label);
    if (!m) continue;
    if (t.rd >= 200 || m.rd >= 200) continue;
    rows.push({ label, theirRating: t.rating, myRating: m.rating, gap: t.rating - m.rating });
  }
  return rows.sort((a, b) => b.gap - a.gap).slice(0, limit);
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

/** Compares two rankings over the items they have in common. */
export function compareRankings(a: Ranking, b: Ranking): Comparison {
  const shared = [...a.keys()].filter((k) => b.has(k));
  if (shared.length < 3) {
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
  const agreement = 1 - (6 * sumD2) / (n * (n * n - 1));

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

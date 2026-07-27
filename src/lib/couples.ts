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

export type Ranking = Map<string, { label: string; rating: number; rd: number }>;

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
        merged.set(i.label, { label: i.label, rating: i.rating, rd: i.rd });
      }
    }
  }
  return merged;
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

import { prisma } from "@/lib/prisma";
import { DEFAULT_GLICKO_STATE, GlickoState } from "@/lib/glicko2";

export type RatedItem = {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  dimensions: string[];
  rating: number;
  rd: number;
  volatility: number;
};

/**
 * Loads a participant's own rating for every item in a survey, falling back
 * to the Glicko-2 defaults for items they haven't been shown yet. Ratings
 * are stored per respondent, so this never mixes two people's answers.
 */
export async function loadRatedItems(participantId: string, surveyId: string): Promise<RatedItem[]> {
  const [items, ratings] = await Promise.all([
    prisma.item.findMany({
      where: { surveyId },
      select: { id: true, slug: true, label: true, category: true, dimensions: true },
    }),
    prisma.participantItemRating.findMany({
      where: { participantId },
      select: { itemId: true, rating: true, rd: true, volatility: true },
    }),
  ]);

  const byItem = new Map(ratings.map((r) => [r.itemId, r]));
  return items.map((item) => {
    const r = byItem.get(item.id);
    return {
      id: item.id,
      slug: item.slug,
      label: item.label,
      category: item.category,
      dimensions: item.dimensions ?? [],
      rating: r?.rating ?? DEFAULT_GLICKO_STATE.rating,
      rd: r?.rd ?? DEFAULT_GLICKO_STATE.rd,
      volatility: r?.volatility ?? DEFAULT_GLICKO_STATE.volatility,
    };
  });
}

export async function getRatingState(participantId: string, itemId: string): Promise<GlickoState> {
  const r = await prisma.participantItemRating.findUnique({
    where: { participantId_itemId: { participantId, itemId } },
    select: { rating: true, rd: true, volatility: true },
  });
  return r ?? DEFAULT_GLICKO_STATE;
}

export function upsertRatingOp(participantId: string, itemId: string, state: GlickoState) {
  return prisma.participantItemRating.upsert({
    where: { participantId_itemId: { participantId, itemId } },
    update: { rating: state.rating, rd: state.rd, volatility: state.volatility },
    create: { participantId, itemId, rating: state.rating, rd: state.rd, volatility: state.volatility },
  });
}

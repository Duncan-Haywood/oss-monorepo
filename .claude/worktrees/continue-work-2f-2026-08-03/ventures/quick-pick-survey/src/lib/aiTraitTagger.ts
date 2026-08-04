import { getTraitsForItem, CardTraitMetadata, LoveLanguage, RelationalDriver, StressResponse, LifeVision } from "@/lib/cardTraitsData";

export type RatedCardWithTraits = {
  label: string;
  category: string | null;
  rating: number;
  rd: number;
  strengthPercentile: number; // 0..100 within user's list
  traits: CardTraitMetadata;
};

export type TraitVectorProfile = {
  topLoveLanguages: { trait: LoveLanguage; score: number; count: number }[];
  topRelationalDrivers: { trait: RelationalDriver; score: number; count: number }[];
  stressResponseProfile: { trait: StressResponse; score: number; count: number }[];
  lifeVisionProfile: { trait: LifeVision; score: number; count: number }[];
  highVulnerabilityCardCount: number;
};

/**
 * Bulk enriches a list of items with their full AI/rule-synthesized trait metadata.
 */
export function enrichItemsWithTraits<T extends { label: string; category?: string | null; dimensions?: string[] }>(
  items: T[]
): (T & { traits: CardTraitMetadata })[] {
  return items.map((item) => ({
    ...item,
    traits: getTraitsForItem(item),
  }));
}

/**
 * Aggregates a respondent's weighted trait vector from their top-rated cards.
 * Uses percentile scores as weights to emphasize choices near the top of their list.
 */
export function computeTraitVectorProfile(cards: RatedCardWithTraits[], topQuartileOnly = true): TraitVectorProfile {
  const eligible = topQuartileOnly ? cards.filter((c) => c.strengthPercentile >= 60) : cards;

  const loveLangScores = new Map<LoveLanguage, { score: number; count: number }>();
  const driverScores = new Map<RelationalDriver, { score: number; count: number }>();
  const stressScores = new Map<StressResponse, { score: number; count: number }>();
  const visionScores = new Map<LifeVision, { score: number; count: number }>();
  let highVuln = 0;

  for (const card of eligible) {
    const weight = card.strengthPercentile / 100;
    if (card.traits.effortProfile.vulnerabilityLevel === "High") {
      highVuln++;
    }

    for (const ll of card.traits.loveLanguages) {
      const prev = loveLangScores.get(ll) ?? { score: 0, count: 0 };
      loveLangScores.set(ll, { score: prev.score + weight, count: prev.count + 1 });
    }
    for (const rd of card.traits.relationalDrivers) {
      const prev = driverScores.get(rd) ?? { score: 0, count: 0 };
      driverScores.set(rd, { score: prev.score + weight, count: prev.count + 1 });
    }
    for (const sr of card.traits.stressResponse) {
      const prev = stressScores.get(sr) ?? { score: 0, count: 0 };
      stressScores.set(sr, { score: prev.score + weight, count: prev.count + 1 });
    }
    for (const lv of card.traits.lifeVision) {
      const prev = visionScores.get(lv) ?? { score: 0, count: 0 };
      visionScores.set(lv, { score: prev.score + weight, count: prev.count + 1 });
    }
  }

  const sortMap = <K extends string>(map: Map<K, { score: number; count: number }>) =>
    [...map.entries()]
      .map(([trait, val]) => ({ trait, score: Math.round(val.score * 10) / 10, count: val.count }))
      .sort((a, b) => b.score - a.score);

  return {
    topLoveLanguages: sortMap(loveLangScores),
    topRelationalDrivers: sortMap(driverScores),
    stressResponseProfile: sortMap(stressScores),
    lifeVisionProfile: sortMap(visionScores),
    highVulnerabilityCardCount: highVuln,
  };
}

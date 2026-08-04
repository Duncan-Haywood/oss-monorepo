import { describe, it, expect } from "vitest";
import {
  Ranking,
  emotionalHarmonyIndex,
  stressCoRegulationProfile,
  energyPaceCompatibility,
  vulnerabilityBridge,
  growthAmbitionMatrix,
} from "@/lib/couples";

function createMockRanking(items: { label: string; rating: number; category: string }[]): Ranking {
  const map: Ranking = new Map();
  for (const item of items) {
    map.set(item.label, {
      label: item.label,
      rating: item.rating,
      rd: 100,
      category: item.category,
      dimensions: ["warmth", "stability"],
    });
  }
  return map;
}

describe("couplesDeepInsights", () => {
  const partnerA = createMockRanking([
    { label: "Puts the phone down and actually listens", rating: 1700, category: "Behaviour" },
    { label: "Plans thoughtful dates without being asked", rating: 1650, category: "Behaviour" },
    { label: "Handles conflict", rating: 1620, category: "Behaviour" },
    { label: "Co-regulates stress", rating: 1610, category: "Behaviour" },
    { label: "Repairs after fights", rating: 1600, category: "Relationship" },
    { label: "Gives you space", rating: 1550, category: "Relationship" },
    { label: "Talks about desire", rating: 1540, category: "Intimacy" },
    { label: "Micro-adventures", rating: 1520, category: "Lifestyle" },
    { label: "Kind", rating: 1500, category: "Character" },
    { label: "Spontaneous", rating: 1480, category: "Character" },
  ]);

  const partnerB = createMockRanking([
    { label: "Puts the phone down and actually listens", rating: 1690, category: "Behaviour" },
    { label: "Plans thoughtful dates without being asked", rating: 1660, category: "Behaviour" },
    { label: "Handles conflict", rating: 1630, category: "Behaviour" },
    { label: "Co-regulates stress", rating: 1600, category: "Behaviour" },
    { label: "Repairs after fights", rating: 1590, category: "Relationship" },
    { label: "Gives you space", rating: 1560, category: "Relationship" },
    { label: "Talks about desire", rating: 1530, category: "Intimacy" },
    { label: "Micro-adventures", rating: 1510, category: "Lifestyle" },
    { label: "Kind", rating: 1490, category: "Character" },
    { label: "Spontaneous", rating: 1470, category: "Character" },
  ]);

  it("calculates Emotional & Relational Harmony Index with explainability trail", () => {
    const insight = emotionalHarmonyIndex(partnerA, partnerB);
    expect(insight).not.toBeNull();
    expect(insight?.id).toBe("emotional-harmony");
    expect(insight?.evidenceTrail.cards.length).toBeGreaterThan(0);
    expect(insight?.evidenceTrail.underlyingMechanism).toContain("Love Language");
    expect(insight?.actionablePrescription).toBeTruthy();
  });

  it("calculates Stress & Conflict Co-Regulation Profile", () => {
    const insight = stressCoRegulationProfile(partnerA, partnerB);
    expect(insight).not.toBeNull();
    expect(insight?.id).toBe("stress-dynamics");
    expect(insight?.evidenceTrail.cards.length).toBeGreaterThan(0);
    expect(insight?.relationalImpact).toBeTruthy();
  });

  it("calculates Vulnerability & Intimacy Bridge for shared high-vulnerability cards", () => {
    const insight = vulnerabilityBridge(partnerA, partnerB);
    expect(insight).not.toBeNull();
    expect(insight?.id).toBe("vulnerability-bridge");
    expect(insight?.evidenceTrail.cards.some((c) => c.label === "Talks about desire" || c.label === "Handles conflict")).toBe(true);
  });
});

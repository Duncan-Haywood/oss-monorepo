import type { BusinessIdea, PortfolioSummary, ValidationDecision } from "./types";
import { businessIdeas } from "@/data/ideas";

// Equal-weight composite of an idea's scored dimensions. This is the scoring
// system's own number, independent of the hand-assigned rank100k/rank1m, so a
// caller can see whether the narrative ranking and the scores actually agree.
export function scoreIdea(idea: BusinessIdea): number {
  return idea.dimensions.reduce((sum, d) => sum + d.score, 0);
}

export function maxIdeaScore(idea: BusinessIdea): number {
  return idea.dimensions.reduce((sum, d) => sum + d.maxScore, 0);
}

// Ideas ordered by composite score, highest first. Ties keep source order.
export function getScoreRanking(): BusinessIdea[] {
  return [...businessIdeas].sort((a, b) => scoreIdea(b) - scoreIdea(a));
}

export function getAllIdeas(): BusinessIdea[] {
  return [...businessIdeas].sort((a, b) => a.rank100k - b.rank100k);
}

export function getIdeaBySlug(slug: string): BusinessIdea | undefined {
  return businessIdeas.find((idea) => idea.slug === slug);
}

export function getTopIdeasForMilestone(
  milestone: "100k" | "1m",
  limit = 5,
): BusinessIdea[] {
  const rankKey = milestone === "100k" ? "rank100k" : "rank1m";
  return [...businessIdeas]
    .sort((a, b) => a[rankKey] - b[rankKey])
    .slice(0, limit);
}

// The platform's actual output: given a milestone, which idea to validate
// next and the concrete first experiment that would test it. The decision is
// the milestone's rank-1 idea (the map's primary recommendation); the scoring
// dimensions are reported alongside so the choice is auditable rather than
// asserted.
export function getValidationDecision(
  milestone: "100k" | "1m" = "100k",
): ValidationDecision {
  const idea = getTopIdeasForMilestone(milestone, 1)[0];
  const topByScore = getScoreRanking()[0];
  return {
    milestone,
    idea,
    compositeScore: scoreIdea(idea),
    maxCompositeScore: maxIdeaScore(idea),
    firstExperiment: idea.firstExperiment,
    scoreAgreesWithRank: idea.id === topByScore.id,
  };
}

export function buildPortfolioSummary(): PortfolioSummary {
  const strong100k = businessIdeas.filter(
    (idea) => idea.plans.find((p) => p.milestone === "100k")?.verdict === "strong",
  ).length;

  const strong1m = businessIdeas.filter(
    (idea) => idea.plans.find((p) => p.milestone === "1m")?.verdict === "strong",
  ).length;

  const categoryBreakdown = businessIdeas.reduce(
    (acc, idea) => {
      acc[idea.category] = (acc[idea.category] ?? 0) + 1;
      return acc;
    },
    {} as PortfolioSummary["categoryBreakdown"],
  );

  return {
    totalIdeas: businessIdeas.length,
    strong100k,
    strong1m,
    top100k: getTopIdeasForMilestone("100k", 5),
    top1m: getTopIdeasForMilestone("1m", 5),
    categoryBreakdown,
  };
}

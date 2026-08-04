import type { BusinessIdea, PortfolioSummary } from "./types.ts";
import { businessIdeas } from "../data/ideas.ts";

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

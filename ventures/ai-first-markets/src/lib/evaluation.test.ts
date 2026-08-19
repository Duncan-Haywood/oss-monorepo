import { describe, expect, it } from "vitest";
import {
  buildPortfolioSummary,
  getAllIdeas,
  getIdeaBySlug,
  getTopIdeasForMilestone,
} from "./evaluation";
import { businessIdeas } from "@/data/ideas";

describe("getAllIdeas", () => {
  it("returns every idea exactly once", () => {
    const all = getAllIdeas();
    expect(all).toHaveLength(businessIdeas.length);
    expect(new Set(all.map((idea) => idea.id)).size).toBe(businessIdeas.length);
  });

  it("sorts ascending by rank100k", () => {
    const ranks = getAllIdeas().map((idea) => idea.rank100k);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
  });

  it("does not mutate the source data", () => {
    const originalOrder = businessIdeas.map((idea) => idea.id);
    getAllIdeas();
    expect(businessIdeas.map((idea) => idea.id)).toEqual(originalOrder);
  });
});

describe("getIdeaBySlug", () => {
  it("finds an idea that exists", () => {
    const target = businessIdeas[0];
    expect(getIdeaBySlug(target.slug)?.id).toBe(target.id);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getIdeaBySlug("not-a-real-slug-xyz")).toBeUndefined();
  });
});

describe("getTopIdeasForMilestone", () => {
  it("defaults to the 5 lowest rank100k ideas", () => {
    const expectedIds = [...businessIdeas]
      .sort((a, b) => a.rank100k - b.rank100k)
      .slice(0, 5)
      .map((idea) => idea.id);
    expect(getTopIdeasForMilestone("100k").map((idea) => idea.id)).toEqual(expectedIds);
  });

  it("ranks by rank1m when asked for the 1m milestone", () => {
    const expectedIds = [...businessIdeas]
      .sort((a, b) => a.rank1m - b.rank1m)
      .slice(0, 3)
      .map((idea) => idea.id);
    expect(getTopIdeasForMilestone("1m", 3).map((idea) => idea.id)).toEqual(expectedIds);
  });

  it("respects a limit larger than the dataset without throwing", () => {
    expect(getTopIdeasForMilestone("100k", businessIdeas.length + 10)).toHaveLength(
      businessIdeas.length,
    );
  });
});

describe("buildPortfolioSummary", () => {
  it("counts totals and category breakdown independently of the implementation", () => {
    const summary = buildPortfolioSummary();

    expect(summary.totalIdeas).toBe(businessIdeas.length);

    const expectedStrong100k = businessIdeas.filter((idea) =>
      idea.plans.some((p) => p.milestone === "100k" && p.verdict === "strong"),
    ).length;
    const expectedStrong1m = businessIdeas.filter((idea) =>
      idea.plans.some((p) => p.milestone === "1m" && p.verdict === "strong"),
    ).length;
    expect(summary.strong100k).toBe(expectedStrong100k);
    expect(summary.strong1m).toBe(expectedStrong1m);

    const expectedCategoryCounts = new Map<string, number>();
    for (const idea of businessIdeas) {
      expectedCategoryCounts.set(idea.category, (expectedCategoryCounts.get(idea.category) ?? 0) + 1);
    }
    for (const [category, count] of expectedCategoryCounts) {
      expect(summary.categoryBreakdown[category as keyof typeof summary.categoryBreakdown]).toBe(
        count,
      );
    }

    const totalFromBreakdown = Object.values(summary.categoryBreakdown).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(totalFromBreakdown).toBe(businessIdeas.length);
  });

  it("keeps top100k/top1m consistent with getTopIdeasForMilestone", () => {
    const summary = buildPortfolioSummary();
    expect(summary.top100k.map((i) => i.id)).toEqual(
      getTopIdeasForMilestone("100k", 5).map((i) => i.id),
    );
    expect(summary.top1m.map((i) => i.id)).toEqual(
      getTopIdeasForMilestone("1m", 5).map((i) => i.id),
    );
  });
});

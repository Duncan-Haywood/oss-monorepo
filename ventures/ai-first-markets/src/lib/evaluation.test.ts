import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAllIdeas,
  getIdeaBySlug,
  getTopIdeasForMilestone,
  buildPortfolioSummary,
} from "./evaluation.ts";

describe("ai-first-markets evaluation logic", () => {
  it("getAllIdeas returns ideas sorted by rank100k", () => {
    const ideas = getAllIdeas();
    assert.ok(ideas.length > 0);
    for (let i = 1; i < ideas.length; i++) {
      assert.ok(ideas[i - 1].rank100k <= ideas[i].rank100k);
    }
  });

  it("getIdeaBySlug retrieves existing idea and returns undefined for unknown", () => {
    const idea = getIdeaBySlug("ai-pr-review-bot");
    assert.ok(idea);
    assert.equal(idea.name, "AI PR Review Agent");

    const nonExistent = getIdeaBySlug("non-existent-idea-slug");
    assert.equal(nonExistent, undefined);
  });

  it("getTopIdeasForMilestone returns sorted subset for 100k and 1m", () => {
    const top100k = getTopIdeasForMilestone("100k", 3);
    assert.equal(top100k.length, 3);
    for (let i = 1; i < top100k.length; i++) {
      assert.ok(top100k[i - 1].rank100k <= top100k[i].rank100k);
    }

    const top1m = getTopIdeasForMilestone("1m", 3);
    assert.equal(top1m.length, 3);
    for (let i = 1; i < top1m.length; i++) {
      assert.ok(top1m[i - 1].rank1m <= top1m[i].rank1m);
    }
  });

  it("buildPortfolioSummary aggregates portfolio metrics accurately", () => {
    const summary = buildPortfolioSummary();
    assert.ok(summary.totalIdeas > 0);
    assert.ok(typeof summary.strong100k === "number");
    assert.ok(typeof summary.strong1m === "number");
    assert.equal(summary.top100k.length, 5);
    assert.equal(summary.top1m.length, 5);
    assert.ok(summary.categoryBreakdown);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  averageScore,
  verdictLabel,
  verdictColor,
  categoryLabel,
  formatCurrency,
  formatArr,
  monthsLabel,
} from "./utils.ts";
import type { ScoreDimension } from "./types.ts";

describe("ai-first-markets utils helpers", () => {
  it("averageScore calculates percentage correctly and handles empty array", () => {
    assert.equal(averageScore([]), 0);
    const dimensions: ScoreDimension[] = [
      { key: "dim1", label: "Dim 1", score: 8, maxScore: 10, rationale: "Good" },
      { key: "dim2", label: "Dim 2", score: 6, maxScore: 10, rationale: "OK" },
    ];
    assert.equal(averageScore(dimensions), 70);
  });

  it("verdictLabel and verdictColor map all verdicts", () => {
    assert.equal(verdictLabel("strong"), "Strong fit");
    assert.equal(verdictLabel("viable"), "Viable");
    assert.equal(verdictLabel("stretch"), "Stretch goal");
    assert.equal(verdictLabel("unlikely"), "Unlikely");

    assert.equal(verdictColor("strong"), "text-emerald-400");
    assert.equal(verdictColor("viable"), "text-sky-400");
    assert.equal(verdictColor("stretch"), "text-amber-400");
    assert.equal(verdictColor("unlikely"), "text-rose-400");
  });

  it("categoryLabel maps all business categories", () => {
    assert.equal(categoryLabel("ai-agent"), "AI Agent");
    assert.equal(categoryLabel("devtools"), "Developer Tools");
    assert.equal(categoryLabel("vertical-saas"), "Vertical SaaS");
    assert.equal(categoryLabel("api-infrastructure"), "API Infrastructure");
    assert.equal(categoryLabel("content-automation"), "Content Automation");
    assert.equal(categoryLabel("data-product"), "Data Product");
  });

  it("formatCurrency and formatArr format financial metrics", () => {
    assert.ok(formatCurrency(100000).includes("100,000"));
    assert.equal(formatArr(1000000), "$1M ARR");
    assert.equal(formatArr(1500000), "$1.5M ARR");
    assert.equal(formatArr(100000), "$100k ARR");
    assert.ok(formatArr(500).includes("500"));
  });

  it("monthsLabel formats months and years correctly", () => {
    assert.equal(monthsLabel(6), "6 months");
    assert.equal(monthsLabel(12), "1 year");
    assert.equal(monthsLabel(18), "1.5 years");
  });
});

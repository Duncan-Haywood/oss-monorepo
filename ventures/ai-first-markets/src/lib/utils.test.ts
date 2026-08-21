import { describe, expect, it } from "vitest";
import { formatArr, formatCurrency, formatMonthlyRevenue } from "./utils";
import { businessIdeas } from "@/data/ideas";

describe("formatMonthlyRevenue", () => {
  it("matches formatCurrency exactly, never formatArr's abbreviation", () => {
    expect(formatMonthlyRevenue(98)).toBe(formatCurrency(98));
    expect(formatMonthlyRevenue(1042)).toBe(formatCurrency(1042));
  });

  // Regression: contract-review-api's 1m plan (src/data/ideas.ts) has an
  // averageRevenue of 1042 — the only monthly figure over $999 in the
  // dataset. Run through formatArr (as the report used to), this renders as
  // "$1k ARR" — a >99.9% rounding loss and a wrong "ARR" unit label on a
  // monthly figure. formatMonthlyRevenue must render the true dollar amount.
  it("renders contract-review-api's $1,042/mo average revenue correctly", () => {
    expect(formatMonthlyRevenue(1042)).toBe("$1,042");
    expect(formatMonthlyRevenue(1042)).not.toContain("ARR");
    expect(formatMonthlyRevenue(1042)).not.toBe(formatArr(1042));
  });

  it("agrees with formatCurrency for every plan's average revenue in the dataset", () => {
    for (const idea of businessIdeas) {
      for (const plan of idea.plans) {
        expect(formatMonthlyRevenue(plan.pricing.averageRevenue)).toBe(
          formatCurrency(plan.pricing.averageRevenue),
        );
      }
    }
  });
});

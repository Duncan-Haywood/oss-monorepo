import { describe, expect, it } from "vitest";
import { pickNextDomain, type DomainState } from "./domainScheduler";

const foundation = [
  "values",
  "traits",
  "communication",
  "relationship",
  "lifestyle",
  "future-family",
  "intimacy",
  "behaviors",
  "affection",
  "combined",
];

function domains(counts: Record<string, number> = {}): DomainState[] {
  return foundation.map((slug) => ({
    slug,
    title: slug,
    kind: "ITEMS",
    confidence: 0,
    answeredCount: counts[slug] ?? 0,
  }));
}

describe("insight-foundation scheduling", () => {
  it("covers the same high-value domains before specialist topics", () => {
    expect(pickNextDomain(domains(), null, "SELF", () => 0.99)).toBe("values");
    expect(pickNextDomain(domains({ values: 4 }), "values", "PARTNER", () => 0.99)).toBe("traits");
  });

  it("does not get stuck when the current foundation domain is still short", () => {
    expect(pickNextDomain(domains(), "values", "PARTNER", () => 0)).toBe("traits");
  });

  it("switches to adaptive weighting once the foundation is covered", () => {
    const covered = domains(Object.fromEntries(foundation.map((slug) => [slug, 4])));
    expect(pickNextDomain(covered, null, "SELF", () => 0)).toBeTruthy();
  });
});

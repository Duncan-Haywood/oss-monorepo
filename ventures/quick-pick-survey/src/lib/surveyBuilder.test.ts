import { describe, expect, it } from "vitest";
import { parseSurveyDefinition, slugify } from "./surveyBuilder";

const ok = (body: unknown, taken?: Set<string>) => {
  const r = parseSurveyDefinition(body, taken);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.survey;
};
const errs = (body: unknown, taken?: Set<string>) => {
  const r = parseSurveyDefinition(body, taken);
  return r.ok ? [] : r.errors;
};

describe("surveyBuilder", () => {
  it("slugifies accents and punctuation", () => {
    expect(slugify("  Café & Crème — Best?! ")).toBe("cafe-creme-best");
  });
  it("builds a survey from one option per line with categories", () => {
    const s = ok({ title: "Team lunch", items: "Pizza\nFood | Tacos\n\nSushi" });
    expect(s.slug).toBe("team-lunch");
    expect(s.items.map((i) => i.label)).toEqual(["Pizza", "Tacos", "Sushi"]);
    expect(s.items[1].category).toBe("Food");
    expect(s.items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });
  it("accepts a pair selector and rejects an unknown one", () => {
    const items = "A\nB\nC";
    expect(ok({ title: "T", items }).pairSelector).toBeNull();
    expect(ok({ title: "T", items, pairSelector: "" }).pairSelector).toBeNull();
    expect(ok({ title: "T", items, pairSelector: "staged" }).pairSelector).toBe("staged");
    expect(errs({ title: "T", items, pairSelector: "magic" })[0]).toMatch(/pairSelector/);
  });
  it("disambiguates labels that slugify the same but differ", () => {
    const s = ok({ title: "t", items: ["A+B", "A-B", "C"] });
    expect(s.items.map((i) => i.slug)).toEqual(["a-b", "a-b-2", "c"]);
  });
  it("rejects exact duplicates, too few, empty and oversize", () => {
    expect(errs({ title: "t", items: ["a", "A", "b", "c"] }).join()).toMatch(/twice/);
    expect(errs({ title: "t", items: ["a", "b"] }).join()).toMatch(/At least 3/);
    expect(errs({ title: "", items: ["a", "b", "c"] }).join()).toMatch(/title/);
    expect(errs({ title: "t", items: Array.from({ length: 61 }, (_, i) => `x${i}`) }).join()).toMatch(/At most 60/);
    expect(errs({ title: "t", items: ["a".repeat(81), "b", "c"] }).join()).toMatch(/longer/);
  });
  it("rejects reserved and taken slugs", () => {
    expect(errs({ title: "Admin", items: "a\nb\nc" }).join()).toMatch(/reserved/);
    expect(errs({ title: "Lunch", items: "a\nb\nc" }, new Set(["lunch"])).join()).toMatch(/already exists/);
  });
  it("strips control characters", () => {
    const s = ok({ title: "t\u0000x", items: ["a\tb", "c", "d"] });
    expect(s.title).toBe("t x");
    expect(s.items[0].label).toBe("a b");
  });
  it("rejects non-objects", () => {
    expect(errs(null)).toHaveLength(1);
  });
});

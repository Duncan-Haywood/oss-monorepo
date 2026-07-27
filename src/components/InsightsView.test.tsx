import { describe, expect, it } from "vitest";
import { INSIGHTS } from "@/lib/insights";

/**
 * The insights page is driven entirely by the catalogue plus a content map,
 * so these guard the contract between them. A mismatch here is exactly the
 * class of bug that shows as a card that never fills in.
 */
describe("insight catalogue", () => {
  it("has no duplicate keys", () => {
    const keys = INSIGHTS.map((i) => i.key);
    // A duplicate key means two cards render the same content and React
    // gets duplicate list keys — this previously happened with top-three
    // appearing twice at different levels.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every insight a title, teaser and needs line", () => {
    for (const i of INSIGHTS) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.teaser.length).toBeGreaterThan(0);
      expect(i.needs.length).toBeGreaterThan(0);
    }
  });

  it("declares a known source for every insight", () => {
    const valid = new Set(["ITEMS", "FINANCIAL", "CONJOINED", "ANY"]);
    for (const i of INSIGHTS) expect(valid.has(i.source)).toBe(true);
  });

  it("exposes no level field — gating is by data readiness", () => {
    for (const i of INSIGHTS) {
      expect(i).not.toHaveProperty("level");
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildDeepProfile, metadataForCard } from "./cardMetadata";

describe("card interpretation metadata", () => {
  it("gives one card multiple auditable signals", () => {
    const metadata = metadataForCard({ category: "Behaviour", dimensions: ["warmth", "service"] });
    expect(metadata.source).toBe("ai-assisted-curation");
    expect(metadata.signals.length).toBeGreaterThanOrEqual(6);
    expect(metadata.contexts).toContain("mental load");
    expect(metadata.signals[0].weight).toBeGreaterThan(metadata.signals.at(-1)!.weight);
  });

  it("builds claims with item-level provenance", () => {
    const rows = [
      ["Listens fully", "Behaviour", 1680, 100, ["warmth"]],
      ["Repairs after fights", "Relationship", 1640, 110, ["warmth", "stability"]],
      ["Takes a task", "Affection", 1610, 105, ["service", "warmth"]],
      ["Handles logistics", "Behaviour", 1580, 115, ["service", "stability"]],
      ["Personal freedom", "Values", 1360, 120, ["independence"]],
      ["Status", "Values", 1320, 120, ["status"]],
    ] as const;
    const profile = buildDeepProfile(rows.map(([label, category, rating, rd, dimensions]) => ({
      label, category, rating, rd, dimensions: [...dimensions],
    })));
    expect(profile?.signals.length).toBeGreaterThan(2);
    expect(profile?.signals[0].evidence[0].rationale).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { normalizeEin } from "./propublica";
import {
  finalizeProspectScore,
  funderFacts,
  GIVING_UNKNOWN_CAP,
  NO_GIVING_CAP,
  type ProspectScoreOutput,
} from "./scoring";
import { hitPriority } from "./search";

const output = (o: Partial<ProspectScoreOutput> = {}): ProspectScoreOutput => ({
  fitScore: 85,
  approach: "letter_of_inquiry",
  approachNotes: "Send an LOI.",
  reasons: [{ text: "Local grantmaker.", polarity: "positive", factIds: ["ff_location", "fct_a"] }],
  ...o,
});

const base = {
  orgFactIds: new Set(["fct_a"]),
  funderFactIds: new Set(["ff_location", "ff_giving", "ff_type"]),
  totalGivingCents: 10_000_000,
  foundationType: "private_non_operating" as const,
};

describe("finalizeProspectScore", () => {
  it("keeps known ids, splits org vs funder facts, dedupes, drops uncited reasons", () => {
    const f = finalizeProspectScore({
      ...base,
      output: output({
        reasons: [
          {
            text: "A",
            polarity: "positive",
            factIds: ["fct_a", "fct_a", "ff_location", "fct_zzz"],
          },
          { text: "B", polarity: "negative", factIds: [] },
          { text: "C", polarity: "neutral", factIds: ["ff_nope"] },
        ],
      }),
    });
    expect(f.reasons).toEqual([
      { text: "A", polarity: "positive", factIds: ["fct_a"], funderFactIds: ["ff_location"] },
    ]);
    expect(f.droppedFactIds.sort()).toEqual(["fct_zzz", "ff_nope"]);
    expect(f.fitScore).toBe(85);
    expect(f.caps).toEqual([]);
  });

  it("caps unknown and zero giving, clamps out-of-range scores", () => {
    const unknown = finalizeProspectScore({ ...base, totalGivingCents: null, output: output() });
    expect(unknown).toMatchObject({
      fitScore: GIVING_UNKNOWN_CAP,
      approach: "research_first",
      caps: ["giving_unknown"],
    });
    expect(unknown.reasons.at(-1)?.funderFactIds).toEqual(["ff_giving"]);
    const zero = finalizeProspectScore({ ...base, totalGivingCents: 0, output: output() });
    expect(zero.fitScore).toBe(NO_GIVING_CAP);
    expect(finalizeProspectScore({ ...base, output: output({ fitScore: -5 }) }).fitScore).toBe(0);
    expect(
      finalizeProspectScore({ ...base, output: output({ fitScore: Number.NaN }) }).fitScore,
    ).toBe(0);
  });
});

describe("helpers", () => {
  it("normalizes EINs", () => {
    expect(normalizeEin(30466957)).toBe("030466957");
    expect(normalizeEin("85-0457010")).toBe("850457010");
    expect(normalizeEin("1234567890")).toBeNull();
  });

  it("prioritizes grantmaker-looking hits", () => {
    const hit = { ein: "1", city: null, state: "NM", subsectionCode: 3 };
    expect(hitPriority({ ...hit, name: "Mesa Foundation", nteeCode: "T20" }, 1)).toBeGreaterThan(
      hitPriority({ ...hit, name: "Mesa Tool Library", nteeCode: "S20" }, 1),
    );
  });

  it("states that giving is unknown rather than inventing a number", () => {
    const ff = funderFacts({
      ein: "000000001",
      name: "Sample Foundation",
      city: "Gallup",
      state: "NM",
      nteeCode: null,
      foundationType: "private_foundation",
      latestFilingYear: null,
      latestFormType: null,
      totalAssetsCents: null,
      totalGivingCents: null,
    });
    expect(ff.find((f) => f.id === "ff_giving")?.statement).toMatch(/not reported/);
    expect(ff.some((f) => f.id === "ff_assets")).toBe(false);
  });
});

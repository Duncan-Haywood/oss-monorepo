import { describe, expect, it } from "vitest";
import {
  descriptionWords,
  lineUsesRouting,
  materialFamily,
  type SuggestHistoryLine,
  type SuggestRouting,
  suggestionReason,
  suggestRoutings,
} from "./routing-suggest";

const op = (machineId: string, label: string) => ({ machineId, label });

const bracket: SuggestRouting = {
  id: "r_bracket",
  name: "6061 bracket",
  partFamily: "Brackets",
  operations: [op("m_saw", "Op 05 saw"), op("m_mill", "Op 10 mill")],
};
const shaft: SuggestRouting = {
  id: "r_shaft",
  name: "Turned shaft",
  partFamily: null,
  operations: [op("m_lathe", "Op 10 turn")],
};
const unused: SuggestRouting = {
  id: "r_unused",
  name: "Weldment",
  partFamily: null,
  operations: [op("m_weld", "Weld")],
};

const h = (
  lineId: string,
  materialId: string | null,
  operations: SuggestHistoryLine["operations"],
  won = false,
  description: string | null = null,
): SuggestHistoryLine => ({ lineId, materialId, operations, won, description });

describe("descriptionWords", () => {
  it("keeps the words that describe the part", () => {
    expect(descriptionWords("Mounting BRACKETS, 6061-T6, qty 50 per dwg")).toEqual([
      "mounting",
      "bracket",
      "6061",
    ]);
    expect(descriptionWords("Brass bushings")).toEqual(["brass", "bushing"]);
    expect(descriptionWords(null)).toEqual([]);
    expect(descriptionWords("   ")).toEqual([]);
  });
});

describe("lineUsesRouting", () => {
  it("finds the routing's operations in order, by machine and label", () => {
    const line = [op("m_deburr", "Deburr"), op("m_saw", " op 05  SAW"), op("m_mill", "Op 10 mill")];
    expect(lineUsesRouting(line, bracket.operations)).toBe(true);
    expect(
      lineUsesRouting([op("m_mill", "Op 10 mill"), op("m_saw", "Op 05 saw")], bracket.operations),
    ).toBe(false);
    expect(
      lineUsesRouting(
        [op("m_saw", "Op 05 saw"), op("m_x", "x"), op("m_mill", "Op 10 mill")],
        bracket.operations,
      ),
    ).toBe(false);
    expect(lineUsesRouting([op("m_saw", "Op 05 saw")], bracket.operations)).toBe(false);
    expect(lineUsesRouting(line, [])).toBe(false);
  });
});

describe("suggestRoutings", () => {
  it("ranks by use in the same material, wins, other use and matching words", () => {
    const history = [
      h("l1", "mat_6061", bracket.operations, true),
      h("l2", "mat_6061", bracket.operations),
      h("l3", "mat_1018", shaft.operations, false, "drive shaft"),
      h("l4", "mat_1018", shaft.operations),
      h("l5", "mat_1018", shaft.operations),
    ];
    const s = suggestRoutings({
      routings: [unused, shaft, bracket],
      history,
      materialId: "mat_6061",
      description: "Drive shaft, keyed",
    });
    // bracket: 2 same-material lines (6) + 1 won (2) = 8; shaft: 3 other lines (3) + "shaft" in name (2) + "drive" from history (1) = 6
    expect(s.map((x) => [x.routingId, x.score])).toEqual([
      ["r_bracket", 8],
      ["r_shaft", 6],
    ]);
    expect(s[1]).toMatchObject({ nameWords: ["shaft"], historyWords: ["drive"], otherLines: 3 });
  });

  it("never suggests a routing without evidence", () => {
    expect(
      suggestRoutings({
        routings: [unused, bracket],
        history: [],
        materialId: null,
        description: "",
      }),
    ).toEqual([]);
  });

  it("matches the name alone when there is no history", () => {
    const s = suggestRoutings({
      routings: [bracket, shaft],
      history: [],
      materialId: "mat_6061",
      description: "L bracket",
    });
    expect(s.map((x) => x.routingId)).toEqual(["r_bracket"]);
  });

  it("limits the list and breaks ties by name", () => {
    const routings = ["Delta", "alpha", "Charlie", "bravo"].map((name, i) => ({
      id: `r${i}`,
      name,
      partFamily: "plate",
      operations: [op(`m${i}`, "x")],
    }));
    const s = suggestRoutings({
      routings,
      history: [],
      materialId: null,
      description: "plate",
      limit: 3,
    });
    expect(s.map((x) => x.routingId)).toEqual(["r1", "r3", "r2"]);
  });

  it("does not count same-material use when the line has no material", () => {
    const [s] = suggestRoutings({
      routings: [bracket],
      history: [h("l1", null, bracket.operations, true)],
      materialId: null,
      description: null,
    });
    expect(s).toMatchObject({ sameMaterialLines: 0, otherLines: 1, score: 1 });
  });
});

describe("materialFamily", () => {
  it("reads the numbered grade, not the temper, form or size", () => {
    expect(materialFamily("6061-T6 Aluminum plate 0.500 in")).toBe("6061");
    expect(materialFamily('Aluminum 6061-T651 bar 1-1/2" dia')).toBe("6061");
    expect(materialFamily("6061 T6 round 2 in")).toBe("6061");
    expect(materialFamily("304L stainless sheet 16 ga")).toBe("304");
    expect(materialFamily("SS 304 tube")).toBe("304");
    expect(materialFamily("17-4 PH bar")).toBe("17-4");
    expect(materialFamily("17-4PH H1150")).toBe("17-4");
    expect(materialFamily("A36 plate 1/4")).toBe("A36");
    expect(materialFamily("C360 brass rod 3/4")).toBe("C360");
    expect(materialFamily("4140 PH&T 2x4 flat")).toBe("4140");
    expect(materialFamily("Tool steel D2 ground flat")).toBe("D2");
  });

  it("keeps different grades apart", () => {
    expect(materialFamily("6061-T6 plate")).not.toBe(materialFamily("7075-T6 plate"));
    expect(materialFamily("303 SS bar")).not.toBe(materialFamily("304 SS bar"));
  });

  it("uses the name's own words when it has no number", () => {
    expect(materialFamily("Delrin rod, black")).toBe("delrin");
    expect(materialFamily("Delrin plate")).toBe("delrin");
    expect(materialFamily("Acetal plate")).toBe("acetal");
    expect(materialFamily("Mild steel sheet 12 ga")).toBe("mild steel");
  });

  it("gives no family when it cannot say", () => {
    expect(materialFamily("Alloy 20 bar")).toBeNull();
    expect(materialFamily("Plate 0.25")).toBeNull();
    expect(materialFamily("")).toBeNull();
    expect(materialFamily(null)).toBeNull();
  });
});

describe("suggestRoutings by material family", () => {
  const names = new Map([
    ["mat_plate", "6061-T6 plate 0.5 in"],
    ["mat_bar", "6061 bar 1 in"],
    ["mat_7075", "7075-T6 plate"],
    ["mat_alloy20", "Alloy 20 bar"],
    ["mat_alloy20b", "Alloy 20 plate"],
  ]);

  it("counts lines in another row of the same alloy between the same row and other materials", () => {
    const history = [
      h("l1", "mat_bar", bracket.operations, true),
      h("l2", "mat_bar", bracket.operations),
      h("l3", "mat_7075", bracket.operations),
      h("l4", "mat_plate", shaft.operations),
    ];
    const s = suggestRoutings({
      routings: [bracket, shaft],
      history,
      materialId: "mat_plate",
      description: null,
      materialNames: names,
    });
    // bracket: 2 family lines (4) + 1 won (1) + 1 other (1) = 6; shaft: 1 same-material line (3)
    expect(s.map((x) => [x.routingId, x.score])).toEqual([
      ["r_bracket", 6],
      ["r_shaft", 3],
    ]);
    expect(s[0]).toMatchObject({
      sameMaterialLines: 0,
      sameFamilyLines: 2,
      sameFamilyWon: 1,
      family: "6061",
      otherLines: 1,
    });
    expect(s[1]).toMatchObject({ sameFamilyLines: 0, family: null });
  });

  it("reads no family without the names, or when the name gives none", () => {
    const history = [h("l1", "mat_bar", bracket.operations)];
    const [plain] = suggestRoutings({
      routings: [bracket],
      history,
      materialId: "mat_plate",
      description: null,
    });
    expect(plain).toMatchObject({ sameFamilyLines: 0, otherLines: 1, score: 1 });
    const [alloy] = suggestRoutings({
      routings: [bracket],
      history: [h("l1", "mat_alloy20b", bracket.operations)],
      materialId: "mat_alloy20",
      description: null,
      materialNames: names,
    });
    expect(alloy).toMatchObject({ sameFamilyLines: 0, otherLines: 1, score: 1 });
  });
});

describe("suggestionReason", () => {
  it("names the alloy family a suggestion rests on", () => {
    const base = {
      routingId: "r",
      sameMaterialWon: 0,
      nameWords: [],
      historyWords: [],
      score: 0,
    };
    expect(
      suggestionReason(
        {
          ...base,
          sameMaterialLines: 0,
          sameFamilyLines: 2,
          sameFamilyWon: 1,
          family: "6061",
          otherLines: 1,
        },
        "6061-T6 plate",
      ),
    ).toBe(
      "Used on 2 earlier lines in other 6061 stock (1 won); and 1 more line in other materials",
    );
    expect(
      suggestionReason(
        {
          ...base,
          sameMaterialLines: 1,
          sameFamilyLines: 1,
          sameFamilyWon: 0,
          family: "delrin",
          otherLines: 0,
        },
        "Delrin rod",
      ),
    ).toBe("Used on 1 earlier line in Delrin rod; and 1 more line in other delrin stock");
  });

  it("says what the suggestion rests on", () => {
    expect(
      suggestionReason(
        {
          routingId: "r",
          sameMaterialLines: 3,
          sameMaterialWon: 2,
          sameFamilyLines: 0,
          sameFamilyWon: 0,
          family: null,
          otherLines: 1,
          nameWords: ["bracket"],
          historyWords: [],
          score: 0,
        },
        "6061-T6 bar",
      ),
    ).toBe(
      'Used on 3 earlier lines in 6061-T6 bar (2 won); and 1 more line in other materials; its name matches "bracket"',
    );
    expect(
      suggestionReason(
        {
          routingId: "r",
          sameMaterialLines: 0,
          sameMaterialWon: 0,
          sameFamilyLines: 0,
          sameFamilyWon: 0,
          family: null,
          otherLines: 0,
          nameWords: [],
          historyWords: ["drive"],
          score: 1,
        },
        null,
      ),
    ).toBe('Lines that used it also said "drive"');
  });
});

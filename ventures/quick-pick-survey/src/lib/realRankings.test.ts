import { describe, expect, it } from "vitest";
import { groupRanking } from "./groupRanking";
import { answerAsRespondent, meanPositions, parseSoc, rankRanges, scorePanel, summarise } from "./realRankings";

// A made-up four-option soc file in PrefLib's layout (not real data).
const SOC = `# FILE NAME: made-up.soc
# DATA TYPE: soc
# NUMBER ALTERNATIVES: 4
# NUMBER VOTERS: 6
# ALTERNATIVE NAME 1: Apple
# ALTERNATIVE NAME 2: Banana
# ALTERNATIVE NAME 3: Cherry
# ALTERNATIVE NAME 4: Date
3: 1,2,3,4
2: 2,1,3,4
1: 4,3,2,1
`;

describe("parseSoc", () => {
  it("reads names and expands counted orders, 0-based", () => {
    const p = parseSoc(SOC);
    expect(p.names).toEqual(["Apple", "Banana", "Cherry", "Date"]);
    expect(p.orders).toHaveLength(6);
    expect(p.orders[0]).toEqual([0, 1, 2, 3]);
    expect(p.orders[5]).toEqual([3, 2, 1, 0]);
  });
  it("rejects an order that skips or repeats an option", () => {
    expect(() => parseSoc(SOC.replace("1: 4,3,2,1", "1: 4,3,3,1"))).toThrow(/exactly once/);
    expect(() => parseSoc(SOC.replace("1: 4,3,2,1", "1: 4,3,2"))).toThrow(/exactly once/);
  });
  it("rejects tied orders and lines it cannot read", () => {
    expect(() => parseSoc(SOC.replace("1: 4,3,2,1", "1: 4,{3,2},1"))).toThrow(/Tied/);
    expect(() => parseSoc(SOC + "nonsense\n")).toThrow(/order line/);
  });
  it("rejects a file with a missing option name", () => {
    expect(() => parseSoc(SOC.replace("# ALTERNATIVE NAME 3: Cherry\n", ""))).toThrow(/names/);
  });
});

describe("consensus helpers", () => {
  it("mean positions and tie-sharing rank ranges", () => {
    const m = meanPositions(parseSoc(SOC).orders, 4);
    // Apple: 0,0,0,1,1,3 -> 5/6; Banana: 1,1,1,0,0,2 -> 5/6.
    expect(m[0]).toBeCloseTo(5 / 6);
    expect(m[1]).toBeCloseTo(5 / 6);
    expect(rankRanges(m)).toEqual([
      { best: 1, worst: 2 },
      { best: 1, worst: 2 },
      { best: 3, worst: 3 },
      { best: 4, worst: 4 },
    ]);
  });
});

describe("answerAsRespondent", () => {
  it("a consistent respondent's ratings follow their own order", () => {
    let s = 1;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const rows = answerAsRespondent([2, 0, 3, 1], 30, "shipped", rand);
    const rating = (alt: number) => rows.find((r) => r.itemId === `alt-${alt}`)!.rating;
    expect(rating(2)).toBeGreaterThan(rating(0));
    expect(rating(0)).toBeGreaterThan(rating(3));
    expect(rating(3)).toBeGreaterThan(rating(1));
    expect(rows.every((r) => r.rd < 350)).toBe(true);
  });
});

describe("scorePanel", () => {
  const panel = parseSoc(SOC);
  it("is reproducible for a seed and scores against the people left out", () => {
    const a = scorePanel(panel, 3, 6, "information", 42);
    expect(scorePanel(panel, 3, 6, "information", 42)).toEqual(a);
    expect(a.vsPanel).toBeGreaterThanOrEqual(-1);
    expect(a.vsPanel).toBeLessThanOrEqual(1);
    expect(a.rangeWidth).toBeGreaterThanOrEqual(1);
    expect(a.rangeWidth).toBeLessThanOrEqual(4);
  });
  it("needs someone left over to score against", () => {
    expect(() => scorePanel(panel, 6, 6, "shipped", 1)).toThrow(/left over/);
    expect(() => scorePanel(panel, 0, 6, "shipped", 1)).toThrow(/left over/);
  });
  it("summarise averages shares into [0, 1]", () => {
    const s = summarise(panel, 2, 6, "random", 5);
    for (const k of ["top1", "rangeHolds", "ordered", "orderedWrong"] as const) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe("groupRanking range rules", () => {
  // Gap 100 with se 30 each: the 95% intervals overlap (1441-1559 vs 1541-1659)
  // but the difference, 100 / sqrt(2 * 30^2) = 2.36 se, is beyond 1.96.
  const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  const rows = [
    ...Array.from({ length: 4 }, () => ({ itemId: "a", rating: 1600, rd: 60 })),
    ...Array.from({ length: 4 }, () => ({ itemId: "b", rating: 1500, rd: 60 })),
  ];
  it("overlap (the default) ties two options whose intervals overlap", () => {
    const r = groupRanking(items, rows);
    expect(r[0].high - r[0].low).toBeCloseTo(2 * 1.96 * 30, 0);
    expect(r.map((x) => [x.bestRank, x.worstRank])).toEqual([[1, 2], [1, 2]]);
  });
  it("difference orders them when the gap is beyond 1.96 se of the difference", () => {
    const r = groupRanking(items, rows, "difference");
    expect(r.map((x) => [x.itemId, x.bestRank, x.worstRank])).toEqual([["a", 1, 1], ["b", 2, 2]]);
  });
});

import { describe, expect, it } from "vitest";
import { computeTradeOffs, describeTradeOff, HeadToHead } from "./tradeoffs";

function h2h(a: string, b: string, result: string, times = 1): HeadToHead[] {
  return Array.from({ length: times }, () => ({
    aDimensions: [a],
    bDimensions: [b],
    result,
  }));
}

describe("computeTradeOffs", () => {
  it("finds the winner of a lopsided pairing", () => {
    const rows = [...h2h("warmth", "status", "A", 9), ...h2h("warmth", "status", "B", 1)];
    const [t] = computeTradeOffs(rows);
    expect(t.winner).toBe("warmth");
    expect(t.loser).toBe("status");
    expect(t.winnerWins).toBe(9);
    expect(t.loserWins).toBe(1);
    expect(t.rate).toBeCloseTo(0.9, 6);
  });

  it("counts a win for whichever side actually won, regardless of slot", () => {
    // Same matchup, but warmth is sometimes shown as B rather than A.
    const rows = [...h2h("warmth", "status", "A", 5), ...h2h("status", "warmth", "B", 5)];
    const [t] = computeTradeOffs(rows);
    expect(t.winner).toBe("warmth");
    expect(t.winnerWins).toBe(10);
    expect(t.loserWins).toBe(0);
  });

  it("ignores same-dimension pairs — that isn't a trade-off", () => {
    expect(computeTradeOffs(h2h("warmth", "warmth", "A", 20))).toHaveLength(0);
  });

  it("only counts the primary dimension, so one choice isn't double-counted", () => {
    const rows: HeadToHead[] = Array.from({ length: 10 }, () => ({
      aDimensions: ["warmth", "family", "service"],
      bDimensions: ["status", "ambition"],
      result: "A",
    }));
    const out = computeTradeOffs(rows);
    // Exactly one pairing (warmth vs status), not six from the cross-product.
    expect(out).toHaveLength(1);
    expect(out[0].winner).toBe("warmth");
    expect(out[0].loser).toBe("status");
  });

  it("records ties without crediting either side", () => {
    const rows = [...h2h("warmth", "status", "A", 3), ...h2h("warmth", "status", "EQUAL", 4)];
    const [t] = computeTradeOffs(rows);
    expect(t.ties).toBe(4);
    expect(t.winnerWins).toBe(3);
    expect(t.loserWins).toBe(0);
    expect(t.n).toBe(7);
  });

  it("drops pairings below the observation minimum", () => {
    expect(computeTradeOffs(h2h("warmth", "status", "A", 2))).toHaveLength(0);
  });

  it("ranks a well-evidenced lean above a small-sample sweep", () => {
    const rows = [
      // 4/4 — perfect but thin.
      ...h2h("adventure", "stability", "A", 4),
      // 24/30 — weaker rate, far more evidence.
      ...h2h("warmth", "status", "A", 24),
      ...h2h("warmth", "status", "B", 6),
    ];
    const out = computeTradeOffs(rows);
    expect(out[0].winner).toBe("warmth");
    // Raw rate would have put the 100% pairing first; the Wilson bound doesn't.
    expect(out[0].rate).toBeLessThan(out[1].rate);
  });
});

describe("describeTradeOff", () => {
  it("stays silent when the evidence is thin", () => {
    const [t] = computeTradeOffs([...h2h("warmth", "status", "A", 3), ...h2h("warmth", "status", "B", 2)]);
    expect(describeTradeOff(t)).toBeNull();
  });

  it("describes a well-evidenced lean", () => {
    const [t] = computeTradeOffs([...h2h("warmth", "status", "A", 40), ...h2h("warmth", "status", "B", 5)]);
    const text = describeTradeOff(t);
    expect(text).toContain("warmth");
    expect(text).toMatch(/\d+% of the time/);
  });

  it("handles an empty result set", () => {
    expect(describeTradeOff(undefined)).toBeNull();
  });
});

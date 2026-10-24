import { describe, expect, it } from "vitest";
import { coverage, groupRanking, pool, rankingCsv } from "./groupRanking";

// Small seeded PRNG so the coverage check is reproducible.
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

describe("pool", () => {
  it("one respondent keeps their own rating and deviation", () => {
    const p = pool([{ rating: 1600, rd: 120 }]);
    expect(p.rating).toBeCloseTo(1600);
    expect(p.se).toBeCloseTo(120);
    expect(p.tau).toBe(0);
  });
  it("weights the more certain respondent more", () => {
    const p = pool([{ rating: 1700, rd: 50 }, { rating: 1500, rd: 200 }]);
    expect(p.rating).toBeGreaterThan(1650);
  });
  it("widens the interval when respondents disagree", () => {
    const agree = pool([1600, 1601, 1599, 1600].map((r) => ({ rating: r, rd: 60 })));
    const split = pool([1300, 1900, 1350, 1850].map((r) => ({ rating: r, rd: 60 })));
    expect(split.tau).toBeGreaterThan(200);
    expect(split.se).toBeGreaterThan(agree.se * 3);
  });
  it("covers the true mean about 95% of the time (seeded)", () => {
    const rand = mulberry(7);
    let hit = 0;
    const trials = 400;
    for (let t = 0; t < trials; t++) {
      const rows = Array.from({ length: 12 }, () => ({ rating: 1550 + 80 * normal(rand) + 60 * normal(rand), rd: 60 }));
      const p = pool(rows);
      if (Math.abs(p.rating - 1550) <= 1.96 * p.se) hit++;
    }
    expect(hit / trials).toBeGreaterThan(0.9);
    expect(hit / trials).toBeLessThan(0.99);
  });
});

describe("groupRanking", () => {
  const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];
  it("orders by pooled rating and gives rank ranges", () => {
    const rows = [
      ...[0, 1, 2, 3].map(() => ({ itemId: "a", rating: 1800, rd: 60 })),
      ...[0, 1, 2, 3].map(() => ({ itemId: "b", rating: 1505, rd: 60 })),
      ...[0, 1, 2, 3].map(() => ({ itemId: "c", rating: 1495, rd: 60 })),
    ];
    const r = groupRanking(items, rows);
    expect(r.map((x) => x.itemId)).toEqual(["a", "b", "c"]);
    expect(r[0]).toMatchObject({ bestRank: 1, worstRank: 1, tied: false });
    expect(r[1]).toMatchObject({ bestRank: 2, worstRank: 3, tied: true });
    expect(r[2]).toMatchObject({ bestRank: 2, worstRank: 3, tied: true });
  });
  it("ignores unanswered default ratings and shows an unrated item as maximally uncertain", () => {
    const r = groupRanking(items, [
      { itemId: "a", rating: 1600, rd: 100 },
      { itemId: "b", rating: 1500, rd: 350 },
    ]);
    const c = r.find((x) => x.itemId === "c")!;
    expect(c.respondents).toBe(0);
    expect(c.worstRank).toBe(3);
    expect(c.bestRank).toBe(1 + r.filter((x) => x.itemId !== "c" && x.low > c.high).length);
  });
  it("exports CSV and defuses formulas", () => {
    const r = groupRanking([{ id: "x", label: '=HYPERLINK("u")' }], [{ itemId: "x", rating: 1500.04, rd: 50 }]);
    const csv = rankingCsv(r);
    expect(csv.split("\n")[0]).toContain("ci_low");
    expect(csv).toContain(`"'=HYPERLINK(""u"")"`);
    expect(csv).toContain(",1500,");
  });

  describe("coverage", () => {
    const mk = (n: number, counts: number[]) =>
      groupRanking(
        Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` })),
        counts.flatMap((c, i) => Array.from({ length: c }, () => ({ itemId: `i${i}`, rating: 1500 + i, rd: 80 }))),
      );
    it("is empty with no answers", () => {
      expect(coverage(mk(3, [0, 0, 0]), 5).status).toBe("empty");
    });
    it("is ok when every option has enough raters", () => {
      const c = coverage(mk(3, [4, 5, 6]), 6);
      expect(c).toMatchObject({ status: "ok", thin: [], median: 5, advice: "" });
    });
    it("names thin options thinnest first and just says wait on a short list", () => {
      const c = coverage(mk(4, [6, 1, 0, 6]), 6);
      expect(c.status).toBe("thin");
      expect(c.thin).toEqual(["Item 2", "Item 1"]);
      expect(c.advice).toContain("Wait for more respondents");
      expect(c.advice).not.toContain("shorten");
    });
    it("suggests shortening a long list that reaches few respondents", () => {
      const counts = Array.from({ length: 40 }, (_, i) => (i < 20 ? 2 : 3));
      const c = coverage(mk(40, counts), 20);
      expect(c.advice).toContain("shorten the list to about 5 options");
      expect(c.advice).toContain("13%");
    });
    it("sizes the shorter list from measured answers per respondent", () => {
      const counts = Array.from({ length: 40 }, (_, i) => (i < 20 ? 2 : 3));
      const c = coverage(mk(40, counts), 20, 6);
      // 20 people * 2 options * 6 answers / 3 raters = 80 appearances' worth, capped below the list length
      expect(c.advice).toContain("shorten the list to about 39 options");
      expect(c.advice).toContain("median of 6 pairs");
      const c2 = coverage(mk(40, counts), 20, 1);
      expect(c2.advice).toContain("shorten the list to about 13 options");
    });
  });
});

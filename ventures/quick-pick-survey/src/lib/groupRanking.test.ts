import { describe, expect, it } from "vitest";
import { FIRST_OPTION_FALLBACK_SHARE, FIRST_OPTION_MIN_DECIDED } from "./pairing";
import { AGREEMENT_MIN_OPTIONS, agreementSummary, coverage, SLOT_CLICK_MIN_DECIDED, SLOT_CLICK_SHARE, slotClickerAdvice, slotClickers, groupRanking, LOW_AGREEMENT, pool, rankCorrelation, rankingCsv, respondentAgreement, type ParticipantRatingRow } from "./groupRanking";

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
  it("matches DerSimonian-Laird computed independently (tau above zero)", () => {
    // Reference: DerSimonian & Laird (1986) moment estimator, computed by a
    // separate Python implementation: Q = 4.5576 on k = 3, so
    // tau^2 = (Q - (k - 1)) / C > 0.
    const p = pool([{ rating: 1600, rd: 100 }, { rating: 1450, rd: 80 }, { rating: 1750, rd: 120 }]);
    expect(p.rating).toBeCloseTo(1582.4258, 3);
    expect(p.se).toBeCloseTo(86.1424, 3);
    expect(p.tau).toBeCloseTo(111.6348, 3);
  });
  it("matches DerSimonian-Laird on five unequal-precision respondents", () => {
    const p = pool([
      { rating: 1500, rd: 50 }, { rating: 1520, rd: 60 }, { rating: 1480, rd: 70 },
      { rating: 1700, rd: 90 }, { rating: 1350, rd: 40 },
    ]);
    expect(p.rating).toBeCloseTo(1495.3895, 3);
    expect(p.se).toBeCloseTo(53.0126, 3);
    expect(p.tau).toBeCloseTo(101.1839, 3);
  });
  it("truncates tau to zero when Q is below its degrees of freedom", () => {
    // Q = 0.02 < k - 1 = 2: the fixed-effect answer, se = 100 / sqrt(3).
    const p = pool([{ rating: 1500, rd: 100 }, { rating: 1510, rd: 100 }, { rating: 1490, rd: 100 }]);
    expect(p.tau).toBe(0);
    expect(p.rating).toBeCloseTo(1500, 6);
    expect(p.se).toBeCloseTo(57.735027, 5);
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

describe("rankCorrelation", () => {
  it("is 1 for the same order, -1 for the reverse, and averages ties", () => {
    expect(rankCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(rankCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    // Reference: Pearson on average ranks, computed separately in Python: 0.9746794344808964
    expect(rankCorrelation([1, 2, 3, 4, 5], [1, 2, 2, 3, 5])).toBeCloseTo(0.9746794, 6);
    expect(rankCorrelation([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe("respondentAgreement", () => {
  // Ten options with a shared order; honest people rate by it with a little noise.
  const ids = Array.from({ length: 10 }, (_, i) => `o${i}`);
  function panel(seed: number, odd: (i: number) => number) {
    const r = mulberry(seed);
    const rows: ParticipantRatingRow[] = [];
    for (let p = 0; p < 8; p++) {
      for (let i = 0; i < ids.length; i++) {
        const rating = p === 0 ? odd(i) : 1500 + 40 * i + 15 * normal(r);
        rows.push({ participantId: `p${p}`, itemId: ids[i], rating, rd: 90 });
      }
    }
    return rows;
  }

  it("scores honest respondents high and one answering by an unrelated trait near or below zero", () => {
    // p0 ranks the options in an order unrelated to everyone else's (Spearman with it: -0.04).
    const unrelated = [4, 9, 1, 7, 0, 6, 2, 8, 3, 5];
    const out = respondentAgreement(panel(5, (i) => 1500 + 40 * unrelated[i]));
    const byId = new Map(out.map((a) => [a.participantId, a]));
    expect(byId.get("p0")!.rho!).toBeLessThan(LOW_AGREEMENT);
    for (let p = 1; p < 8; p++) expect(byId.get(`p${p}`)!.rho!).toBeGreaterThan(0.8);
    expect(out[0].participantId).toBe("p0"); // lowest first
  });

  it("leaves out the respondent being scored (a reversed person cannot agree with a pool that holds them)", () => {
    const out = respondentAgreement(panel(9, (i) => 1900 - 40 * i));
    expect(out.find((a) => a.participantId === "p0")!.rho!).toBeLessThan(-0.9);
  });

  it("gives no score under AGREEMENT_MIN_OPTIONS answered options, and ignores never-answered rows", () => {
    const rows: ParticipantRatingRow[] = [
      ...ids.slice(0, AGREEMENT_MIN_OPTIONS - 1).map((itemId, i) => ({ participantId: "few", itemId, rating: 1500 + i, rd: 100 })),
      ...ids.map((itemId, i) => ({ participantId: "many", itemId, rating: 1500 + i, rd: 100 })),
      ...ids.map((itemId, i) => ({ participantId: "other", itemId, rating: 1500 + i, rd: 100 })),
      { participantId: "few", itemId: "o9", rating: 1500, rd: 350 },
    ];
    const out = new Map(respondentAgreement(rows).map((a) => [a.participantId, a]));
    expect(out.get("few")).toEqual({ participantId: "few", options: AGREEMENT_MIN_OPTIONS - 1, rho: null });
    expect(out.get("many")!.rho).toBeCloseTo(1);
  });
});

describe("agreementSummary", () => {
  const a = (rho: number | null, i: number) => ({ participantId: `p${i}`, options: 10, rho });
  it("says nothing on a small panel or when everyone agrees", () => {
    expect(agreementSummary([0.9, 0.1, 0.8, 0.7].map(a)).advice).toBe("");
    expect(agreementSummary([0.9, 0.8, 0.85, 0.7, 0.6, null].map(a))).toEqual({ checked: 5, low: 0, advice: "" });
  });
  it("names how many disagree, and does not call a large block careless", () => {
    const few = agreementSummary([0.9, 0.8, 0.85, 0.7, 0.6, 0.75, 0.05].map(a));
    expect(few.low).toBe(1);
    expect(few.advice).toMatch(/^1 of 7 respondents/);
    expect(few.advice).toMatch(/genuinely different taste/);
    expect(few.advice).toMatch(/counts every respondent equally/);
    const split = agreementSummary([0.9, 0.8, -0.2, 0.1, 0.6, 0.75, 0.05].map(a));
    expect(split.low).toBe(3);
    expect(split.advice).toMatch(/split into groups/);
  });
});

describe("slotClickers", () => {
  it("uses the selector's own first-option rule (pairing.ts), so the two cannot drift", () => {
    expect(SLOT_CLICK_MIN_DECIDED).toBe(FIRST_OPTION_MIN_DECIDED);
    expect(SLOT_CLICK_SHARE).toBe(FIRST_OPTION_FALLBACK_SHARE);
  });
  it("flags a one-sided slot share from 30 decided answers, either side, and nobody near half", () => {
    const out = slotClickers([
      { participantId: "top", first: 28, second: 2 },
      { participantId: "bottom", first: 9, second: 21 },
      { participantId: "edge", first: 21, second: 9 }, // exactly 0.7
      { participantId: "honest", first: 17, second: 13 },
      { participantId: "short", first: 29, second: 0 }, // under 30 decided
    ]);
    expect([...out].sort()).toEqual(["bottom", "edge", "top"]);
  });
  it("advice names the count and is empty when nobody was left out", () => {
    expect(slotClickerAdvice(0, 12)).toBe("");
    expect(slotClickerAdvice(2, 12)).toMatch(/^2 of 12 respondents .* at least 70% .* left out of this ranking\.$/);
  });
});

import { describe, expect, it } from "vitest";
import { FIRST_OPTION_FALLBACK_SHARE, FIRST_OPTION_MIN_DECIDED } from "./pairing";
import { AGREEMENT_MIN_OPTIONS, AGREEMENT_MIN_RESPONDENTS, agreementSummary, blockAgreementDrop, autoFastBlockMinLog, autoWalkMin, bestFastSplit, panelWalkRatio, stepOverWalk, FAST_BLOCK_AUTO_FLOOR, stepOverTrend, stepNetOfTrend, stepNetOfTrendT, coverage, FAST_BLOCK_MIN_LOG, FAST_BLOCK_MIN_SEG, FAST_PACE, fastBlockSplit, fastBlockStarts, ratingsWithoutAnswers, fastAnswerCutMs, fastAnswerers, PACE_MAX_MS, PACE_MIN_TIMED, paceSummary, parseDrop, respondentPace, type AnswerTime, SLOT_CLICK_MIN_DECIDED, SLOT_CLICK_SHARE, slotClickerAdvice, slotClickers, SLOT_BLOCK_ALPHA, SLOT_BLOCK_MIN, fairCoinTail, slotBlockAdvice, slotBlockStarts, slotFlags, SLOT_BLOCK_MIN_KEPT, groupRanking, LOW_AGREEMENT, pool, rankCorrelation, rankingCsv, respondentAgreement, ratingsWithoutFastAnswers, type ParticipantRatingRow, type ReplayAnswer } from "./groupRanking";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "./glicko2";

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

describe("slotBlockStarts", () => {
  const seq = (id: string, results: string) => [...results].map((c) => ({ participantId: id, result: c === "a" ? "A" : c === "b" ? "B" : "EQUAL" }));
  // A fair-coin-looking honest stretch: alternating slots with no long run.
  const honest = (n: number) => Array.from({ length: n }, (_, i) => (i % 4 < 2 ? (i % 2 ? "a" : "b") : i % 2 ? "b" : "a")).join("");
  it("fairCoinTail is the exact two-sided binomial tail", () => {
    expect(fairCoinTail(10, 5)).toBe(1);
    expect(fairCoinTail(4, 4)).toBeCloseTo(2 / 16, 12);
    expect(fairCoinTail(4, 0)).toBeCloseTo(2 / 16, 12);
    expect(fairCoinTail(20, 17)).toBeCloseTo((2 * (1 + 20 + 190 + 1140)) / 2 ** 20, 12);
    expect(() => fairCoinTail(5, 6)).toThrow();
  });
  it("finds a run of top-slot clicks that starts partway, which the whole-session share misses", () => {
    const answers = seq("late", honest(40) + "a".repeat(20));
    expect(slotClickers([{ participantId: "late", first: 40 / 2 + 20, second: 40 / 2 }]).size).toBe(0); // 40 of 60 is 67%
    const out = slotBlockStarts(answers);
    expect(out.get("late")).toBeGreaterThanOrEqual(38);
    expect(out.get("late")).toBeLessThanOrEqual(40);
  });
  it("reads either slot, and counts ties in the start index as ratingsWithoutAnswers does", () => {
    const plain = slotBlockStarts(seq("bottom", honest(20) + "b".repeat(20))).get("bottom");
    expect(plain).toBeGreaterThanOrEqual(18);
    expect(plain).toBeLessThanOrEqual(20);
    expect(slotBlockStarts(seq("bottom", "eee" + honest(20) + "b".repeat(20))).get("bottom")).toBe(plain! + 3);
  });
  it("leaves alone a run too short to be told from a coin, and an even session", () => {
    expect(slotBlockStarts(seq("short", honest(40) + "a".repeat(SLOT_BLOCK_MIN - 1))).size).toBe(0);
    expect(slotBlockStarts(seq("even", honest(120))).size).toBe(0);
  });
  it("flags honest coin-flip slots at most SLOT_BLOCK_ALPHA of the time", () => {
    let s = 12345;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const answers = Array.from({ length: 2000 }, (_, p) => Array.from({ length: 60 }, () => ({ participantId: `h${p}`, result: rand() < 0.5 ? "A" : "B" }))).flat();
    expect(slotBlockStarts(answers).size / 2000).toBeLessThanOrEqual(SLOT_BLOCK_ALPHA);
  });
  it("slotFlags keeps a late run's start, and leaves out whole a run from the first answers or a share-only clicker", () => {
    const answers = [...seq("late", honest(30) + "a".repeat(20)), ...seq("always", "a".repeat(40)), ...seq("early", "b".repeat(SLOT_BLOCK_MIN_KEPT - 3) + "a".repeat(40)), ...seq("honest", honest(40))];
    const counts = [
      { participantId: "late", first: 35, second: 15 },
      { participantId: "always", first: 40, second: 0 },
      { participantId: "early", first: 40, second: SLOT_BLOCK_MIN_KEPT - 3 },
      { participantId: "honest", first: 20, second: 20 },
      { participantId: "share", first: 22, second: 9 }, // 71% over 31: slotClickers' rule, too weak for a block
    ];
    const { whole, from } = slotFlags(answers, counts);
    expect([...whole].sort()).toEqual(["always", "early", "share"]);
    expect([...from.keys()]).toEqual(["late"]);
    expect(from.get("late")).toBeGreaterThanOrEqual(SLOT_BLOCK_MIN_KEPT);
  });
  it("advice names people and answers, and is empty when nobody was flagged", () => {
    expect(slotBlockAdvice(0, 0)).toBe("");
    expect(slotBlockAdvice(1, 20)).toMatch(/^1 respondent answered .* the 20 answers from that point on are left out/);
  });
});

describe("respondentPace", () => {
  const timesFor = (id: string, ms: number, n = PACE_MIN_TIMED): AnswerTime[] => Array.from({ length: n }, (_, i) => ({ participantId: id, ms: ms + (i % 3) * 10 }));
  it("is each person's median over the panel's median of medians, fastest first", () => {
    const out = respondentPace([...timesFor("a", 3000), ...timesFor("b", 3000), ...timesFor("c", 2800), ...timesFor("d", 3200), ...timesFor("quick", 900)]);
    expect(out[0].participantId).toBe("quick");
    expect(out[0].medianMs).toBe(910);
    expect(out[0].pace).toBeCloseTo(910 / 3010, 6);
    expect([...fastAnswerers(out)]).toEqual(["quick"]);
  });
  it("ignores missing, zero and left-open times, and judges nobody on under PACE_MIN_TIMED answers or a panel under five", () => {
    const junk: AnswerTime[] = [{ participantId: "a", ms: null }, { participantId: "a", ms: 0 }, { participantId: "a", ms: PACE_MAX_MS }];
    const few = respondentPace([...timesFor("a", 3000, PACE_MIN_TIMED - 1), ...junk, ...timesFor("b", 3000), ...timesFor("c", 3000), ...timesFor("d", 3000), ...timesFor("e", 3000)]);
    expect(few.find((p) => p.participantId === "a")).toEqual({ participantId: "a", timed: PACE_MIN_TIMED - 1, medianMs: null, pace: null });
    // Four judged respondents: no panel pace, so nobody is called fast.
    expect(few.every((p) => p.pace === null)).toBe(true);
    expect(fastAnswerers(few).size).toBe(0);
  });
  it("calls fast only under FAST_PACE, not at it", () => {
    const flat = (id: string, ms: number): AnswerTime[] => Array.from({ length: PACE_MIN_TIMED }, () => ({ participantId: id, ms }));
    const at = respondentPace([...flat("a", 3000), ...flat("b", 3000), ...flat("c", 3000), ...flat("d", 3000), ...flat("half", 3000 * FAST_PACE), ...flat("under", 3000 * FAST_PACE - 1)]);
    expect(at.find((p) => p.participantId === "half")!.pace).toBe(FAST_PACE);
    expect([...fastAnswerers(at)]).toEqual(["under"]);
  });
});

describe("paceSummary", () => {
  const pace = (id: string, p: number | null) => ({ participantId: id, timed: 20, medianMs: p === null ? null : 3000 * p, pace: p });
  const agree = (id: string, rho: number | null) => ({ participantId: id, options: 10, rho });
  const panel = [pace("a", 1), pace("b", 1.1), pace("c", 0.9), pace("d", 1.2)];
  it("says nothing on a small panel, or when nobody is fast and everybody agrees", () => {
    expect(paceSummary([pace("a", 1), pace("q", 0.2)], []).advice).toBe("");
    expect(paceSummary([...panel, pace("e", 0.8)], [agree("a", 0.9)])).toMatchObject({ checked: 5, fast: 0, advice: "" });
  });
  it("reads out-of-step respondents at a normal pace as a likely different taste", () => {
    const s = paceSummary([...panel, pace("camp", 1)], [agree("camp", 0.05), agree("a", 0.9)]);
    expect(s).toMatchObject({ fast: 0, lowAgreement: 1, lowAndFast: 0, typicalSeconds: 3 });
    expect(s.advice).toMatch(/^None of the 5 timed respondents answered unusually fast \(the typical pick took 3 s\)/);
    expect(s.advice).toMatch(/different taste/);
  });
  it("counts the fast ones and how many of the out-of-step were among them", () => {
    const s = paceSummary([...panel, pace("q1", 0.3), pace("q2", 0.4), pace("camp", 1)], [agree("q1", 0.1), agree("camp", 0.0), agree("q2", 0.8)]);
    expect(s).toMatchObject({ checked: 7, fast: 2, lowAgreement: 2, lowAndFast: 1 });
    expect(s.advice).toMatch(/^2 respondents of 7 answered in under half the typical time per pick/);
    expect(s.advice).toMatch(/Of the 2 respondents whose order barely matches the rest, 1 was among them/);
    expect(s.advice).toMatch(/counted in this ranking/);
  });
});

describe("parseDrop", () => {
  it("accepts only absent, exactly \"fast\", \"fast-answers\" or \"fast-blocks\"", () => {
    expect(parseDrop(null)).toEqual({ ok: true, fast: false, fastAnswers: false, fastBlocks: false });
    expect(parseDrop("fast")).toEqual({ ok: true, fast: true, fastAnswers: false, fastBlocks: false });
    expect(parseDrop("fast-answers")).toEqual({ ok: true, fast: false, fastAnswers: true, fastBlocks: false });
    expect(parseDrop("fast-blocks")).toEqual({ ok: true, fast: false, fastAnswers: false, fastBlocks: true });
    for (const bad of ["", "Fast", "slot", "fast,slot", "fast-answer", "fast,fast-answers", "fast-block", "Fast-blocks"]) expect(parseDrop(bad)).toEqual({ ok: false });
  });
});

describe("fastAnswerCutMs", () => {
  it("is FAST_PACE times the panel's median of medians, null when no pace was judged", () => {
    const paces = respondentPace(["a", "b", "c", "d", "e"].flatMap((id, i) => Array.from({ length: PACE_MIN_TIMED }, () => ({ participantId: id, ms: 2000 + i * 500 }))));
    expect(fastAnswerCutMs(paces)).toBeCloseTo(3000 * FAST_PACE, 6);
    expect(fastAnswerCutMs(respondentPace([{ participantId: "a", ms: 3000 }]))).toBeNull();
  });
});

describe("ratingsWithoutFastAnswers", () => {
  const ans = (participantId: string, itemAId: string, itemBId: string, result: string, ms: number | null): ReplayAnswer => ({ participantId, itemAId, itemBId, result, ms });
  const answers = [
    ans("p", "x", "y", "A", 3000), ans("p", "y", "z", "B", 400), ans("p", "x", "z", "EQUAL", null),
    ans("q", "x", "y", "B", 2500), ans("q", "x", "z", "A", 1500), ans("q", "y", "z", "A", 1499),
  ];
  // The answer route's own update, one answer at a time from the default state.
  function byHand(list: ReplayAnswer[]) {
    const st = new Map<string, GlickoState>();
    for (const a of list) {
      const k = (i: string) => `${a.participantId}/${i}`;
      const out = applyComparison(st.get(k(a.itemAId)) ?? DEFAULT_GLICKO_STATE, st.get(k(a.itemBId)) ?? DEFAULT_GLICKO_STATE, a.result as "A" | "B" | "EQUAL");
      st.set(k(a.itemAId), out.a);
      st.set(k(a.itemBId), out.b);
    }
    return new Map([...st].map(([k, v]) => [k, { rating: v.rating, rd: v.rd }]));
  }
  const keyed = (rows: ParticipantRatingRow[]) => new Map(rows.map((r) => [`${r.participantId}/${r.itemId}`, { rating: r.rating, rd: r.rd }]));
  it("reproduces the stored ratings exactly when nothing is under the cut", () => {
    const out = ratingsWithoutFastAnswers(answers, 1);
    expect(out.dropped).toBe(0);
    expect(keyed(out.rows)).toEqual(byHand(answers));
  });
  it("leaves out answers under the cut, keeps untimed ones and ones exactly at it", () => {
    const out = ratingsWithoutFastAnswers(answers, 1500);
    expect(out).toMatchObject({ dropped: 2, people: 2 });
    expect(keyed(out.rows)).toEqual(byHand(answers.filter((a) => a.ms === null || a.ms >= 1500)));
  });
  it("refuses a result that is not A, B or EQUAL rather than guessing", () => {
    expect(() => ratingsWithoutFastAnswers([ans("p", "x", "y", "a", 3000)], 1)).toThrow(/A, B or EQUAL/);
  });
});

describe("fastBlockSplit", () => {
  it("finds where a sequence turns faster, and nothing in a flat one", () => {
    const flat = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    expect(fastBlockSplit(flat)).toBeNull();
    const block = flat.map((v, i) => (i >= 18 ? v - 1 : v));
    expect(fastBlockSplit(block)).toBe(18);
  });
  it("ignores a slow-down, a small speed-up and a sequence too short for two FAST_BLOCK_MIN_SEG sides", () => {
    const flat = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    expect(fastBlockSplit(flat.map((v, i) => (i >= 15 ? v + 1 : v)))).toBeNull();
    expect(fastBlockSplit(flat.map((v, i) => (i >= 15 ? v - (FAST_BLOCK_MIN_LOG - 0.1) : v)))).toBeNull();
    expect(fastBlockSplit(flat.slice(0, 2 * FAST_BLOCK_MIN_SEG - 1).map((v, i) => (i >= FAST_BLOCK_MIN_SEG ? v - 1 : v)))).toBeNull();
  });
});

describe("stepOverTrend", () => {
  const noise = (i: number) => 0.1 * Math.sin(i * 1.7);
  it("is large for a step and negative for a steady slope the split search alone would take for a block", () => {
    const step = Array.from({ length: 40 }, (_, i) => noise(i) - (i >= 20 ? 0.6 : 0));
    const slope = Array.from({ length: 40 }, (_, i) => noise(i) - 1.2 * (i / 39));
    expect(fastBlockSplit(slope)).not.toBeNull(); // the split search sees a 0.6 gap in a steady speed-up
    expect(stepOverTrend(step, 20)).toBeGreaterThan(10);
    expect(stepOverTrend(slope, fastBlockSplit(slope)!)).toBeLessThan(1);
    expect(fastBlockSplit(slope, undefined, undefined, undefined, 1)).toBeNull();
    expect(fastBlockSplit(step, undefined, undefined, undefined, 1)).toBe(20);
  });
});

describe("stepNetOfTrend", () => {
  const noise = (i: number) => 0.1 * Math.sin(i * 1.7);
  it("is near zero for a steady slope and recovers a step's size on top of any slope", () => {
    const slope = (d: number) => Array.from({ length: 60 }, (_, i) => noise(i) - d * (i / 59));
    for (const d of [-1.2, 0, 0.6, 1.2]) {
      const x = slope(d);
      expect(Math.abs(stepNetOfTrend(x, 30))).toBeLessThan(0.1);
      const stepped = x.map((v, i) => (i >= 40 ? v - 0.5 : v));
      expect(stepNetOfTrend(stepped, 40)).toBeCloseTo(0.5, 1);
      expect(stepNetOfTrendT(stepped, 40)).toBeGreaterThan(5);
    }
    // A slow turn reads negative, as bestFastSplit's gap does.
    expect(stepNetOfTrend(slope(0).map((v, i) => (i >= 20 ? v + 0.5 : v)), 20)).toBeCloseTo(-0.5, 1);
  });
  it("is zero for a split at either end", () => {
    const x = Array.from({ length: 20 }, (_, i) => noise(i));
    expect(stepNetOfTrend(x, 0)).toBe(0);
    expect(stepNetOfTrend(x, 20)).toBe(0);
    expect(stepNetOfTrendT(x, 0)).toBe(0);
  });
});

describe("blockAgreementDrop", () => {
  // Ten items rated 1500 + 40i by the rest of the panel; pairs are neighbours, so the panel's gap is 40 every time and the
  // chance of agreeing it implies is 1 / (1 + 10^-0.1), about 0.557.
  const rating = new Map(Array.from({ length: 10 }, (_, i) => [`i${i}`, 1500 + 40 * i]));
  const pair = (k: number, agree: boolean) => { const lo = `i${k % 9}`, hi = `i${(k % 9) + 1}`; return { itemAId: lo, itemBId: hi, result: agree ? "B" : "A" }; };
  it("is large when the picks from the split on stop agreeing with the panel, and near zero when they agree as before", () => {
    const before = Array.from({ length: 30 }, (_, k) => pair(k, k % 5 !== 0)); // 80% agree
    const flips = Array.from({ length: 30 }, (_, k) => pair(k, k % 2 === 0)); // 50% agree
    const same = Array.from({ length: 30 }, (_, k) => pair(k, k % 5 !== 1)); // 80% agree
    const drop = blockAgreementDrop([...before, ...flips], 30, rating);
    // 0.8 against 0.5 agreeing: 0.3 over the binomial standard error of the gap's chance on 30 answers a side.
    const chance = 1 / (1 + 10 ** -0.1);
    expect(drop).toBeCloseTo(0.3 / Math.sqrt((2 * chance * (1 - chance)) / 30), 9);
    expect(Math.abs(blockAgreementDrop([...before, ...same], 30, rating))).toBeLessThan(1e-9);
    // Agreeing more after the split reads negative, not as a drop.
    expect(blockAgreementDrop([...flips, ...before], 30, rating)).toBeCloseTo(-drop, 9);
  });
  it("skips ties, pairs the panel rates level and items it has not rated, and needs enough scored answers on each side", () => {
    const before = Array.from({ length: 30 }, (_, k) => pair(k, true));
    const after = Array.from({ length: 30 }, (_, k) => pair(k, k % 2 === 0));
    const noise = [{ itemAId: "i1", itemBId: "i2", result: "EQUAL" }, { itemAId: "i1", itemBId: "zz", result: "A" }];
    const base = blockAgreementDrop([...before, ...after], 30, rating);
    // Two extra unscored answers at the start shift the split by two and change nothing else.
    expect(blockAgreementDrop([...noise, ...before, ...after], 32, rating)).toBeCloseTo(base, 9);
    expect(blockAgreementDrop([...before.slice(0, 7), ...after], 7, rating)).toBe(0);
    expect(blockAgreementDrop([...before, ...after], 30, new Map([["i1", 1500], ["i2", 1500]]))).toBe(0);
  });
});

describe("stepOverWalk", () => {
  // Seeded draws, so the counts below are fixed.
  const draws = (seed: number) => { let s = seed >>> 0; const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 2 ** 32; }; return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); };
  const walk = (seed: number, sd: number, n = 60, step = 0) => { const z = draws(seed); let l = 0; return Array.from({ length: n }, (_, i) => { if (i) l += sd * z(); return l - (i >= n / 2 ? step : 0) + 0.35 * z(); }); };
  it("scores a held-still pace with one step far above a pace that drifts down in many small moves", () => {
    const noise = (i: number) => 0.1 * Math.sin(i * 1.7);
    const step = Array.from({ length: 40 }, (_, i) => noise(i) - (i >= 20 ? 0.5 : 0));
    const stairs = Array.from({ length: 40 }, (_, i) => noise(i) - 0.0625 * Math.floor(i / 5)); // 0.5 down in eight small moves
    expect(stepOverWalk(step, 20)).toBeGreaterThan(30);
    expect(stepOverWalk(stairs, 20)).toBeLessThan(3);
  });
  it("leaves most splits a wandering pace makes under a bar a held-still block clears", () => {
    // Of 400 sequences of 60 answers whose pace wanders N(0, 0.08) per answer, the ones whose best split already passes
    // the gap and t tests mostly score under 12; of 400 with a 0.51 step halfway and no wander, most score over it.
    let walkFlagged = 0, walkOver = 0, stepFlagged = 0, stepOver = 0;
    for (let k = 0; k < 400; k++) {
      for (const [x, isStep] of [[walk(1000 + k, 0.08), false], [walk(5000 + k, 0, 60, 0.51), true]] as const) {
        const b = bestFastSplit(x)!;
        if (b.t < 4 || b.gap < 0.45) continue;
        const over = stepOverWalk(x, b.at) >= 12;
        if (isStep) { stepFlagged++; if (over) stepOver++; } else { walkFlagged++; if (over) walkOver++; }
      }
    }
    expect(walkFlagged).toBeGreaterThan(40);
    expect(walkOver / walkFlagged).toBeLessThan(0.35);
    expect(stepOver / stepFlagged).toBeGreaterThan(0.25);
    expect(stepOver / stepFlagged).toBeGreaterThan(2 * (walkOver / walkFlagged));
  });
  it("is zero for a split at either end or a sequence too short to fit", () => {
    const x = walk(7, 0.05, 20);
    expect(stepOverWalk(x, 0)).toBe(0);
    expect(stepOverWalk(x, 20)).toBe(0);
    expect(stepOverWalk([0, 1, 0, 1, 0], 2)).toBe(0);
  });
  it("autoWalkMin sets a higher bar for a panel whose pace wanders, ignores quick turns, and needs AGREEMENT_MIN_RESPONDENTS", () => {
    const quiet = Array.from({ length: 20 }, (_, k) => walk(300 + k, 0));
    const wander = Array.from({ length: 20 }, (_, k) => walk(300 + k, 0.08));
    expect(autoWalkMin(wander, 0.9)!).toBeGreaterThan(autoWalkMin(quiet, 0.9)! + 1);
    const quickTurns = quiet.map((x, k) => (k < 6 ? x.map((v, i) => (i >= 30 ? v - 0.8 : v)) : x));
    expect(autoWalkMin(quickTurns, 1)).toBe(autoWalkMin(quiet, 1));
    expect(autoWalkMin(quiet, 1, 50)).toBe(50);
    expect(autoWalkMin(quiet.slice(0, AGREEMENT_MIN_RESPONDENTS - 1), 1)).toBeNull();
    // With `engage`, a panel whose pace does not wander gets no bar at all; one that wanders gets the same bar as without.
    expect(autoWalkMin(quiet, 0.9, 0, 0.003)).toBe(0);
    expect(autoWalkMin(wander, 0.9, 0, 0.003)).toBe(autoWalkMin(wander, 0.9));
  });
  it("panelWalkRatio reads 0 for a panel that holds still or drifts along lines, even with blocks in it, and more for one that wanders", () => {
    const lines = Array.from({ length: 20 }, (_, k) => walk(700 + k, 0).map((v, i) => v - (k % 5 - 2) * 0.3 * (i / 59)));
    const blocked = lines.map((x, k) => (k < 8 ? x.map((v, i) => (i >= 30 ? v - 0.51 : v)) : x));
    expect(panelWalkRatio(lines)).toBe(0);
    expect(panelWalkRatio(blocked)).toBe(0);
    expect(panelWalkRatio(Array.from({ length: 20 }, (_, k) => walk(700 + k, 0.08)))).toBeGreaterThanOrEqual(0.01);
    expect(panelWalkRatio([[0, 1, 2]])).toBe(0);
  });
});

describe("autoFastBlockMinLog", () => {
  const seq = (k: number) => Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.05 : -0.05) * (1 + k / 10));
  it("sits at the floor for a quiet panel, at FAST_BLOCK_MIN_LOG for one whose people slow down by 0.5 or more, and in between otherwise", () => {
    expect(autoFastBlockMinLog(Array.from({ length: 8 }, (_, k) => seq(k)))).toBe(FAST_BLOCK_AUTO_FLOOR);
    expect(autoFastBlockMinLog(Array.from({ length: 8 }, (_, k) => seq(k).map((v, i) => (i >= 15 ? v + 0.8 : v))))).toBe(FAST_BLOCK_MIN_LOG);
    const mid = autoFastBlockMinLog(Array.from({ length: 8 }, (_, k) => seq(k).map((v, i) => (i >= 15 ? v + 0.4 : v))))!;
    expect(mid).toBeGreaterThan(FAST_BLOCK_AUTO_FLOOR);
    expect(mid).toBeLessThan(FAST_BLOCK_MIN_LOG);
  });
  it("is not moved by people who turn quick (only slow turns count), and needs AGREEMENT_MIN_RESPONDENTS sequences", () => {
    expect(autoFastBlockMinLog(Array.from({ length: 8 }, (_, k) => seq(k).map((v, i) => (k < 4 && i >= 15 ? v - 1 : v))))).toBe(FAST_BLOCK_AUTO_FLOOR);
    expect(autoFastBlockMinLog(Array.from({ length: 4 }, (_, k) => seq(k)))).toBeNull();
  });
});

describe("fastBlockStarts", () => {
  // Deterministic jitter so the t statistic is finite.
  const jitter = (i: number, p: number) => Math.exp(0.15 * Math.sin(i * 1.7 + p * 2.3));
  const panel = (people: number, n: number, ms: (p: number, i: number) => number | null): AnswerTime[] =>
    Array.from({ length: n }, (_, i) => Array.from({ length: people }, (_, p) => ({ participantId: `p${p}`, ms: ms(p, i) }))).flat();
  it("flags the one person who turns quick halfway, at the answer they did", () => {
    const out = fastBlockStarts(panel(8, 40, (p, i) => 3000 * jitter(i, p) * (p === 0 && i >= 20 ? 0.4 : 1)));
    expect([...out]).toEqual([["p0", 20]]);
  });
  it("does not take a warm-up or a learning curve everyone shares for a block", () => {
    // Everyone's first ten answers take twice as long and everyone speeds up 50% over the session: read against
    // their own start every one of them would be flagged; read against the panel at the same point, none is.
    const out = fastBlockStarts(panel(8, 40, (p, i) => 3000 * jitter(i, p) * (i < 10 ? 2 : 1) * Math.exp(-0.7 * (i / 39))));
    expect(out.size).toBe(0);
    expect(fastBlockSplit(Array.from({ length: 40 }, (_, i) => Math.log(3000 * jitter(i, 0) * (i < 10 ? 2 : 1) * Math.exp(-0.7 * (i / 39)))))).not.toBeNull();
  });
  it("skips untimed answers in the reading but reports the person's own answer index", () => {
    const out = fastBlockStarts(panel(8, 42, (p, i) => (p === 0 && i < 2 ? null : 3000 * jitter(i, p) * (p === 0 && i >= 22 ? 0.4 : 1))));
    expect(out.get("p0")).toBe(22);
  });
  it("against an upper quantile of the panel's times, still finds four in ten who turn quick at the same answer", () => {
    // Four of ten at 0.55x from answer 20 drag the panel's median down with them, hiding all four; the 0.75
    // quantile sits among the honest six and finds them, and no honest person (FAST_BLOCK_CURVE_Q).
    const ms = (p: number, i: number) => 3000 * jitter(i, p) * (p < 4 && i >= 20 ? 0.55 : 1);
    expect(fastBlockStarts(panel(10, 40, ms), 0.5, FAST_BLOCK_MIN_LOG, 0).size).toBe(0); // the median, with the rules of that day
    expect([...fastBlockStarts(panel(10, 40, ms), 0.75)].sort()).toEqual([["p0", 20], ["p1", 20], ["p2", 20], ["p3", 20]]);
    expect(fastBlockStarts(panel(10, 40, ms)).size).toBe(4); // the shipped default
    expect(() => fastBlockStarts(panel(10, 40, ms), 1)).toThrow();
  });
  it("with a per-survey threshold, finds a slower block a quiet panel's noise cannot make", () => {
    // One of eight turns 0.65x quicker (a log gap of 0.43) from answer 20: under the fixed 0.5 (the rule before
    // 2026-11-13, later) nobody is flagged; the quiet panel's own slow turns are tiny, so the default "auto" drops the
    // threshold to its floor (FAST_BLOCK_AUTO_FLOOR, 0.4) and finds them.
    const ms = (p: number, i: number) => 3000 * jitter(i, p) * (p === 0 && i >= 20 ? 0.65 : 1);
    expect(fastBlockStarts(panel(8, 40, ms), undefined, FAST_BLOCK_MIN_LOG, 0).size).toBe(0);
    expect([...fastBlockStarts(panel(8, 40, ms))]).toEqual([["p0", 20]]);
    // How a noisier panel raises the threshold is pinned in autoFastBlockMinLog's own tests: end to end, people who
    // slow down also lift the panel's curve and so widen everyone else's gaps.
    expect(() => fastBlockStarts(panel(8, 40, ms), undefined, 0)).toThrow();
  });
  it("asks a split for a step net of the person's own line, so a speed-up with a small bump in it is not a block", () => {
    // p0 speeds up steadily by 0.5 log over the session and turns 0.3 log (26%) quicker at answer 20: the split sees a
    // gap well over the threshold, and a step fits that better than a line does, but on top of their own line only
    // 0.3 is left, under the 0.4 the quiet panel sets. p1 turns 0.55x quick at answer 20 with no trend. Without the
    // net-step test (netShare 0, the rule before 2026-11-13, latest) both are flagged; with it, only p1.
    const ms = (step: number) => (p: number, i: number) => 3000 * jitter(i, p) * (p === 0 ? Math.exp(-0.5 * (i / 39) - (i >= 20 ? step : 0)) : 1) * (p === 1 && i >= 20 ? 0.55 : 1);
    expect([...fastBlockStarts(panel(10, 40, ms(0.3)), undefined, "auto", undefined, undefined, 0)].sort()).toEqual([["p0", 20], ["p1", 20]]);
    expect([...fastBlockStarts(panel(10, 40, ms(0.3)))]).toEqual([["p1", 20]]);
    // A step of 0.45 on top of the same line is still a block.
    expect([...fastBlockStarts(panel(10, 40, ms(0.45)))].sort()).toEqual([["p0", 20], ["p1", 20]]);
    expect(() => fastBlockStarts(panel(10, 40, ms(0.3)), undefined, "auto", undefined, undefined, -1)).toThrow();
  });
  it("asks for a step a wandering pace would not make, but only when the panel's pace is seen to wander", () => {
    // Twenty people, 60 answers each, 0.35 log noise (seeded). In the first panel everyone's pace wanders as a random walk
    // of N(0, 0.08) log per answer and nobody is careless: without the wander test (walkQ 0, the rule before 2026-11-14)
    // three honest people are flagged, with it none. In the second nobody wanders and three turn 0.55x quick at answer
    // 30: the panel's walk ratio reads 0, the test is not engaged, and the same three are found either way.
    const draws = (seed: number) => { let s = seed >>> 0; const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 2 ** 32; }; return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); };
    const seqs = (sd: number, blocks: number) => Array.from({ length: 20 }, (_, k) => { const z = draws(400 + k); let l = 0; return Array.from({ length: 60 }, (_, i) => { if (i) l += sd * z(); return 3000 * Math.exp(l + 0.35 * z() - (k < blocks && i >= 30 ? 0.6 : 0)); }); });
    const answers = (q: number[][]): AnswerTime[] => Array.from({ length: 60 }, (_, i) => q.map((x, p) => ({ participantId: `p${p}`, ms: x[i] }))).flat();
    const flagged = (a: AnswerTime[], walkQ?: number) => [...fastBlockStarts(a, undefined, "auto", undefined, undefined, undefined, walkQ).keys()].sort();
    const wander = answers(seqs(0.08, 0)), blocks = answers(seqs(0, 3));
    expect(flagged(wander, 0)).toEqual(["p11", "p18", "p3"]);
    expect(flagged(wander)).toEqual([]);
    expect(flagged(blocks, 0)).toEqual(["p0", "p1", "p2"]);
    expect(flagged(blocks)).toEqual(["p0", "p1", "p2"]);
    expect(() => fastBlockStarts(wander, undefined, "auto", undefined, undefined, undefined, 1.5)).toThrow();
  });
  it("under a wandering pace, also counts a block whose picks stop agreeing with the panel (picks given)", () => {
    // Twenty people, 60 answers on random pairs of 12 items, everyone's pace wandering N(0, 0.08) log per answer (seeded).
    // p0 to p3 turn 0.6x quick at answer 30 and pick at random from then on. Without the wander bar (walkQ 0) p1, p2 and
    // three honest people are flagged; with it on times alone (as before 2026-11-14, later) only p2; with the picks the
    // default also finds p1, whose later picks agree with the panel far less than their earlier ones, and no one honest.
    const draws = (seed: number) => { let s = seed >>> 0; const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 2 ** 32; }; return { u, z: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) }; };
    const per = Array.from({ length: 20 }, (_, k) => { const { u, z } = draws(700 + k); let l = 0; return Array.from({ length: 60 }, (_, i) => {
      if (i) l += 0.08 * z();
      const careless = k < 4 && i >= 30;
      const a = Math.floor(u() * 12); let b = Math.floor(u() * 11); if (b >= a) b++;
      const pickA = careless ? u() < 0.5 : u() < 1 / (1 + Math.exp(-(a - b) * 0.5));
      return { participantId: `p${k}`, ms: 3000 * Math.exp(l + 0.35 * z() - (careless ? 0.5 : 0)), itemAId: `i${a}`, itemBId: `i${b}`, result: pickA ? "A" : "B" };
    }); });
    const answers = Array.from({ length: 60 }, (_, i) => per.map((p) => p[i])).flat();
    const keys = (m: Map<string, number>) => [...m.keys()].sort();
    expect(keys(fastBlockStarts(answers, undefined, "auto", undefined, undefined, undefined, 0))).toEqual(["p1", "p10", "p16", "p2", "p8"]);
    expect(keys(fastBlockStarts(answers.map(({ participantId, ms }) => ({ participantId, ms }))))).toEqual(["p2"]);
    expect(keys(fastBlockStarts(answers, undefined, "auto", undefined, undefined, undefined, undefined, undefined, undefined, 0))).toEqual(["p2"]);
    expect(keys(fastBlockStarts(answers))).toEqual(["p1", "p2"]);
    expect(fastBlockStarts(answers).get("p1")).toBeGreaterThanOrEqual(22);
    expect(() => fastBlockStarts(answers, undefined, "auto", undefined, undefined, undefined, undefined, undefined, undefined, -1)).toThrow();
    expect(() => fastBlockStarts(answers, undefined, "auto", undefined, undefined, undefined, undefined, undefined, undefined, 2, "and" as "or")).toThrow();
  });
  it("does not take one person's steady speed-up over the whole session for a block", () => {
    // p0 gets steadily quicker, to 0.3x by the last answer: a split finds a gap over 0.5 with a large t, but a line fits
    // as well as a step, so the default (FAST_BLOCK_TREND_F) flags nobody; without it (or the net-step test) p0 is flagged.
    const ms = (p: number, i: number) => 3000 * jitter(i, p) * (p === 0 ? Math.exp(-1.2 * (i / 39)) : 1);
    expect(fastBlockStarts(panel(8, 40, ms), undefined, FAST_BLOCK_MIN_LOG, 0, undefined, 0).has("p0")).toBe(true);
    expect(fastBlockStarts(panel(8, 40, ms)).size).toBe(0);
  });
  it("reads its later passes against the median of the people not yet flagged, which spread growing over the session cannot lift", () => {
    // Twelve people whose own pace drifts from 2.7x quicker to 2.7x slower over the session (half speed up, half slow
    // down), so the panel's spread grows with every answer and lifts its upper quantile; four of them turn 0.55x quick
    // from answer 20. Read against the 0.75 quantile in every pass (laterQ 0.75, before 2026-11-13, last), only two
    // are found; the default (FAST_BLOCK_LATER_Q) finds all four, and no one else.
    const n = 12;
    const d = (p: number) => 2 * p / (n - 1) - 1;
    const ms = (p: number, i: number) => 3000 * jitter(i, p) * Math.exp(-d(p) * (i / 39)) * (p % 3 === 0 ? 1.3 : p % 3 === 1 ? 0.8 : 1) * (p >= n - 4 && i >= 20 ? 0.55 : 1);
    expect(fastBlockStarts(panel(n, 40, ms), 0.75, "auto", undefined, 0.75).size).toBe(2);
    expect([...fastBlockStarts(panel(n, 40, ms))].sort()).toEqual([["p10", 20], ["p11", 20], ["p8", 20], ["p9", 20]]);
    expect(() => fastBlockStarts(panel(n, 40, ms), 0.75, "auto", undefined, 1)).toThrow();
  });
  it("needs AGREEMENT_MIN_RESPONDENTS people with enough timed answers", () => {
    expect(fastBlockStarts(panel(4, 40, (p, i) => 3000 * jitter(i, p) * (p === 0 && i >= 20 ? 0.4 : 1))).size).toBe(0);
  });
});

describe("ratingsWithoutAnswers", () => {
  it("counts each respondent's answers from 0, so a block start leaves out exactly their later answers", () => {
    const a = (participantId: string, itemAId: string, itemBId: string): ReplayAnswer => ({ participantId, itemAId, itemBId, result: "A", ms: 2000 });
    const answers = [a("p", "x", "y"), a("q", "x", "y"), a("p", "y", "z"), a("q", "y", "z"), a("p", "x", "z")];
    const out = ratingsWithoutAnswers(answers, (ans, i) => ans.participantId === "p" && i >= 1);
    expect(out).toMatchObject({ dropped: 2, people: 1 });
    expect(out.rows.filter((r) => r.participantId === "p").map((r) => r.itemId).sort()).toEqual(["x", "y"]);
    expect(out.rows.filter((r) => r.participantId === "q")).toHaveLength(3);
  });
});

describe("groupRanking answeredOnly", () => {
  const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  // Person 2 down-weighted by scaling their rd past the starting 350, as the sweeps' weighting schemes do.
  const rows = [
    { itemId: "a", rating: 1700, rd: 120 },
    { itemId: "b", rating: 1400, rd: 120 },
    { itemId: "a", rating: 1300, rd: 600 },
    { itemId: "b", rating: 1650, rd: 600 },
  ];
  it("by default a row at or above the starting rd reads as never answered and is left out", () => {
    const r = groupRanking(items, rows);
    expect(r.find((x) => x.itemId === "a")!.respondents).toBe(1);
  });
  it("with answeredOnly every row counts, so a down-weighted person still pulls a little", () => {
    const r = groupRanking(items, rows, "overlap", { answeredOnly: true });
    const a = r.find((x) => x.itemId === "a")!;
    expect(a.respondents).toBe(2);
    expect(a.rating).toBeLessThan(1700);
    expect(a.rating).toBeGreaterThan(1600);
  });
  it("a never-answered row capped just under the starting rd would count as a rater at 1500 (the sweeps' old bug)", () => {
    // The sweeps capped rd at 349 to keep down-weighted rows in; that also let
    // every never-answered row (1500, rd 350) through as a real rating.
    const unanswered = [{ itemId: "a", rating: 1500, rd: 350 }, { itemId: "b", rating: 1500, rd: 350 }];
    const kept = groupRanking(items, [...rows.slice(0, 2), ...unanswered]);
    const capped = groupRanking(items, [...rows.slice(0, 2), ...unanswered.map((u) => ({ ...u, rd: 349 }))]);
    expect(kept.find((x) => x.itemId === "a")!.respondents).toBe(1);
    expect(capped.find((x) => x.itemId === "a")!.respondents).toBe(2);
  });
});

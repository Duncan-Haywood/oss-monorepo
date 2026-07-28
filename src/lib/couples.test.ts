import { describe, expect, it } from "vitest";
import {
  actionableCount,
  actionableTop,
  asymmetries,
  compareRankings,
  confidentCount,
  coupleReadiness,
  sharedValues,
  strengthScores,
  type Ranking,
} from "@/lib/couples";

/**
 * Builds a ranking from `[label, rating]` pairs. Everything is confidently
 * rated unless a third element says otherwise, so tests read as being about
 * the ordering rather than about deviations.
 */
function ranking(rows: [string, number, number?][]): Ranking {
  return new Map(
    rows.map(([label, rating, rd]) => [
      label,
      { label, rating, rd: rd ?? 80, category: null, dimensions: [] },
    ]),
  );
}

/** N confidently-rated filler items, so cross-person output isn't suppressed. */
function padded(rows: [string, number, number?][], count = 10): Ranking {
  const r = ranking(rows);
  for (let i = r.size; i < count; i++) {
    r.set(`filler-${i}`, { label: `filler-${i}`, rating: 1500, rd: 80, category: null, dimensions: [] });
  }
  return r;
}

describe("strengthScores", () => {
  it("maps a person's own ratings onto 0-100 regardless of their spread", () => {
    const wide = strengthScores(ranking([["a", 1200], ["b", 1500], ["c", 1900]]));
    const narrow = strengthScores(ranking([["a", 1490], ["b", 1500], ["c", 1510]]));

    // Same ordering, same positions — the raw scale is gone.
    expect(wide.get("a")).toBe(0);
    expect(wide.get("b")).toBe(50);
    expect(wide.get("c")).toBe(100);
    expect([...narrow.entries()]).toEqual([...wide.entries()]);
  });

  it("gives tied items the same midrank instead of an arbitrary order", () => {
    const s = strengthScores(ranking([["a", 1500], ["b", 1500], ["c", 1600]]));
    expect(s.get("a")).toBe(s.get("b"));
    expect(s.get("c")).toBe(100);
  });

  it("ignores items the model is still unsure about", () => {
    const s = strengthScores(ranking([["sure", 1600], ["unsure", 1900, 300]]));
    expect(s.has("unsure")).toBe(false);
    expect(s.size).toBe(1);
  });

  it("does not divide by zero on an empty or single-item ranking", () => {
    expect(strengthScores(ranking([])).size).toBe(0);
    expect(strengthScores(ranking([["only", 1500]])).get("only")).toBe(50);
  });
});

describe("asymmetries", () => {
  it("is not fooled by one partner having answered far more questions", () => {
    // Both rank the same three things the same way. The only difference is
    // that `mine` has swiped enough for a wide Glicko spread and `theirs`
    // has not. Nothing should look like it matters more to either of them.
    const mine = padded([["walks", 1900], ["gifts", 1500], ["chores", 1100]]);
    const theirs = padded([["walks", 1540], ["gifts", 1500], ["chores", 1460]]);

    expect(asymmetries(mine, theirs)).toEqual([]);
    // The raw-rating version of this test would have reported walks as
    // mattering ~360 points more to `mine`, purely from swipe volume.
  });

  it("surfaces a genuine difference in position", () => {
    const mine = padded([["chores", 1100], ["walks", 1500]]);
    const theirs = padded([["chores", 1900], ["walks", 1500]]);

    const rows = asymmetries(mine, theirs);
    expect(rows[0].label).toBe("chores");
    expect(rows[0].gap).toBeGreaterThan(20);
  });

  it("stays quiet until there is enough on both sides to compare", () => {
    const thin = ranking([["a", 1600], ["b", 1400]]);
    expect(asymmetries(thin, thin)).toEqual([]);
  });

  it("never reports an item only one of them has rated", () => {
    const mine = padded([["walks", 1900]]);
    const theirs = padded([["opera", 1900]]);
    expect(asymmetries(mine, theirs).some((r) => r.label === "opera")).toBe(false);
  });
});

describe("sharedValues", () => {
  it("only counts things both place above their own middle", () => {
    const a = padded([["walks", 1900], ["opera", 1000]]);
    const b = padded([["walks", 1900], ["opera", 1000]]);

    const shared = sharedValues(a, b);
    expect(shared.map((s) => s.label)).toContain("walks");
    expect(shared.map((s) => s.label)).not.toContain("opera");
  });

  it("excludes something one of them rates below their own middle", () => {
    const a = padded([["opera", 1900]]);
    const b = padded([["opera", 1000]]);
    expect(sharedValues(a, b).map((s) => s.label)).not.toContain("opera");
  });

  it("stays quiet until there is enough on both sides", () => {
    const thin = ranking([["a", 1600], ["b", 1400]]);
    expect(sharedValues(thin, thin)).toEqual([]);
  });
});

describe("compareRankings", () => {
  it("reports perfect agreement on identical orderings", () => {
    const r = ranking([
      ["a", 1900], ["b", 1800], ["c", 1700], ["d", 1600],
      ["e", 1500], ["f", 1400], ["g", 1300], ["h", 1200],
    ]);
    const c = compareRankings(r, r);
    expect(c.agreement).toBeCloseTo(1, 10);
    expect(c.overlap).toBe(8);
  });

  it("reports perfect disagreement on a reversed ordering", () => {
    const labels = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const up = ranking(labels.map((l, i) => [l, 1200 + i * 100] as [string, number]));
    const down = ranking(labels.map((l, i) => [l, 1900 - i * 100] as [string, number]));
    expect(compareRankings(up, down).agreement).toBeCloseTo(-1, 10);
  });

  it("withholds a match score that only three items could not support", () => {
    const a = ranking([["a", 1900], ["b", 1500], ["c", 1100], ["d", 1000], ["e", 900]]);
    const b = ranking([["a", 1800], ["b", 1500], ["c", 1200], ["d", 1000], ["e", 900]]);

    const c = compareRankings(a, b);
    // Rows are useful this early; a headline percentage is not.
    expect(c.agreement).toBeNull();
    expect(c.aligned.length).toBeGreaterThan(0);
  });

  it("returns nothing at all when almost nothing overlaps", () => {
    const a = ranking([["a", 1900], ["b", 1500]]);
    const b = ranking([["a", 1800], ["b", 1400]]);
    expect(compareRankings(a, b)).toMatchObject({ overlap: 2, agreement: null, aligned: [], diverged: [] });
  });

  it("ranks within the shared set only, so unshared items shift nothing", () => {
    const base: [string, number][] = [
      ["a", 1900], ["b", 1800], ["c", 1700], ["d", 1600],
      ["e", 1500], ["f", 1400], ["g", 1300], ["h", 1200],
    ];
    const a = ranking(base);
    const b = ranking([...base, ["z", 2000]]);
    expect(compareRankings(a, b).agreement).toBeCloseTo(1, 10);
  });
});

describe("actionableTop", () => {
  const withCategory = (rows: [string, number, string | null, number?][]): Ranking =>
    new Map(
      rows.map(([label, rating, category, rd]) => [
        label,
        { label, rating, rd: rd ?? 80, category, dimensions: [] },
      ]),
    );

  it("returns only things a partner could actually do", () => {
    const r = withCategory([
      ["Surgeon", 1900, "Profession"],
      ["Takes a task off your plate", 1800, "Behaviour"],
      ["Holds your hand", 1700, "Affection"],
    ]);
    expect(actionableTop(r).map((x) => x.label)).toEqual([
      "Takes a task off your plate",
      "Holds your hand",
    ]);
  });

  it("drops anything the model is not yet sure about", () => {
    const r = withCategory([["Holds your hand", 1900, "Affection", 260]]);
    expect(actionableTop(r)).toEqual([]);
  });
});

describe("coupleReadiness", () => {
  const actionable = (n: number, rd = 80): Ranking =>
    new Map(
      Array.from({ length: n }, (_, i) => [
        `do-${i}`,
        { label: `do-${i}`, rating: 1500 + i, rd, category: "Behaviour", dimensions: [] as string[] },
      ]),
    );

  it("says who is holding up the cross-person sections", () => {
    const mine = padded([], 10);
    const theirs = padded([], 3);
    const r = coupleReadiness(mine, theirs);
    expect(r.shared).toMatchObject({ ready: false, waitingOn: "them", mine: 10, theirs: 3, needed: 8 });
    // Both sections come off the same threshold, so they must never disagree.
    expect(r.mattersMoreToThem).toEqual(r.shared);
  });

  it("names both partners when neither has enough", () => {
    expect(coupleReadiness(padded([], 2), padded([], 3)).shared).toMatchObject({
      ready: false,
      waitingOn: "both",
    });
  });

  it("is ready once both sides clear the floor", () => {
    expect(coupleReadiness(padded([], 8), padded([], 9)).shared).toMatchObject({
      ready: true,
      waitingOn: null,
    });
  });

  it("counts only items the model is confident about", () => {
    // Ten items, all rated, none of them settled: not progress a couple can use.
    const unsure = padded([], 10);
    for (const [k, v] of unsure) unsure.set(k, { ...v, rd: 260 });
    expect(confidentCount(unsure)).toBe(0);
    expect(coupleReadiness(unsure, padded([], 8)).shared.mine).toBe(0);
  });

  it("tracks the one-sided action lists against the partner they come from", () => {
    const r = coupleReadiness(actionable(0), actionable(2));
    // "What makes them happy" is built from THEIR ranking, so it can only ever
    // be waiting on them — and vice versa.
    expect(r.makeThemHappy).toMatchObject({ ready: true, mine: null, theirs: 2 });
    expect(r.makeYouHappy).toMatchObject({ ready: false, waitingOn: "you", theirs: null });
  });

  it("ignores non-actionable items when gating the action lists", () => {
    const professions: Ranking = new Map(
      Array.from({ length: 10 }, (_, i) => [
        `job-${i}`,
        { label: `job-${i}`, rating: 1500, rd: 80, category: "Profession", dimensions: [] as string[] },
      ]),
    );
    expect(actionableCount(professions)).toBe(0);
    expect(coupleReadiness(professions, professions).makeThemHappy.ready).toBe(false);
  });

  /**
   * The invariant that keeps the locked state honest. Readiness is computed
   * separately from the functions it describes, so the two can drift — and
   * either direction is a real defect: a "not ready" notice covering real
   * content hides the payoff, and a "ready" section with nothing in it is the
   * silent blank this whole change exists to remove.
   *
   * The two sides are built with opposed spreads, so the comparison functions
   * genuinely produce rows the moment their threshold allows. With identical
   * filler ratings they never would, and this test would pass against any
   * threshold at all.
   */
  it("flips to ready exactly when the sections start producing rows", () => {
    /**
     * Two fixtures, because the two sections need opposite data to produce
     * anything. Reversed orderings make every item a large asymmetry and
     * leave zero common ground; identical orderings do the reverse. Using one
     * fixture for both would leave one section permanently empty, and the
     * biconditional below would hold against any threshold at all.
     */
    const pair = (n: number, reversed: boolean) => {
      const mine: Ranking = new Map();
      const theirs: Ranking = new Map();
      for (let i = 0; i < n; i++) {
        const label = `item-${i}`;
        const base = { label, rd: 80, category: null, dimensions: [] as string[] };
        mine.set(label, { ...base, rating: 1500 + i * 40 });
        theirs.set(label, { ...base, rating: 1500 + (reversed ? n - 1 - i : i) * 40 });
      }
      return { mine, theirs };
    };

    let sawReady = false;
    let sawLocked = false;
    for (let n = 0; n <= 12; n++) {
      const opposed = pair(n, true);
      const aligned = pair(n, false);
      const rOpposed = coupleReadiness(opposed.mine, opposed.theirs);
      const rAligned = coupleReadiness(aligned.mine, aligned.theirs);

      // Each section checked against the fixture that can actually feed it.
      expect(rOpposed.mattersMoreToThem.ready).toBe(asymmetries(opposed.mine, opposed.theirs).length > 0);
      expect(rAligned.shared.ready).toBe(sharedValues(aligned.mine, aligned.theirs).length > 0);

      // On the other fixture the section is legitimately empty, so only the
      // one-way guarantee holds: locked must never cover real rows.
      if (!rOpposed.shared.ready) expect(sharedValues(opposed.mine, opposed.theirs)).toEqual([]);
      if (!rAligned.mattersMoreToThem.ready) {
        expect(asymmetries(aligned.mine, aligned.theirs)).toEqual([]);
      }

      if (rAligned.shared.ready) sawReady = true;
      else sawLocked = true;
    }
    // Guards the guard: if the fixture never crossed the threshold in either
    // direction, the loop above would assert nothing interesting.
    expect(sawReady && sawLocked).toBe(true);
  });

  it("never reports not-ready for an action list that has rows to show", () => {
    for (const n of [0, 1, 2, 6]) {
      const r = coupleReadiness(actionable(n), actionable(n));
      expect(r.makeThemHappy.ready).toBe(actionableTop(actionable(n)).length > 0);
      expect(r.makeYouHappy.ready).toBe(actionableTop(actionable(n)).length > 0);
    }
  });
});

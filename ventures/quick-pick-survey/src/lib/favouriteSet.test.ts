import { describe, expect, it } from "vitest";
import { contenders, contendersLine, favouriteSet } from "@/lib/favouriteSet";
import { refitRatings } from "@/lib/btRefit";

const diag = (sds: number[]) => {
  const n = sds.length;
  const c = new Float64Array(n * n);
  sds.forEach((s, i) => (c[i * n + i] = s * s));
  return c;
};

describe("favouriteSet", () => {
  it("gives two exchangeable items about even chances and needs both for 90%", () => {
    const f = favouriteSet([0, 0], diag([1, 1]), { draws: 20000 });
    expect(f.chance[0]).toBeCloseTo(0.5, 1);
    expect(f.members.sort()).toEqual([0, 1]);
  });

  it("matches the closed form for two independent items", () => {
    // P(a > b) = Phi((1 - 0) / sqrt(2)) = 0.7602 for unit variances.
    const f = favouriteSet([1, 0], diag([1, 1]), { draws: 40000 });
    expect(Math.abs(f.chance[0] - 0.7602)).toBeLessThan(0.01);
  });

  it("uses the covariance: a strongly correlated pair is easier to separate", () => {
    const n = 2;
    const cov = new Float64Array([1, 0.95, 0.95, 1]);
    // sd of the difference is sqrt(0.1) = 0.316, so a 1-point lead is 3.2 sd: clear.
    expect(favouriteSet([1, 0], cov, { draws: 20000 }).members).toEqual([0]);
    expect(favouriteSet([1, 0], diag([1, 1]), { draws: 20000 }).members.length).toBe(n);
  });

  it("leaves out items far behind the leader and still sums chances to one", () => {
    const f = favouriteSet([10, 9.5, 0, -5], diag([0.5, 0.5, 0.5, 0.5]));
    expect(f.chance[2]).toBe(0);
    expect(f.chance[3]).toBe(0);
    expect(f.chance.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(f.members[0]).toBe(0);
  });

  it("is deterministic for the same input (the card must not flicker)", () => {
    const a = favouriteSet([0.3, 0.2, 0.1, 0], diag([1, 1, 1, 1]));
    const b = favouriteSet([0.3, 0.2, 0.1, 0], diag([1, 1, 1, 1]));
    expect(a).toEqual(b);
  });

  it("finds the bottom set with bottom: true", () => {
    const f = favouriteSet([5, 4, -3], diag([0.3, 0.3, 0.3]), { bottom: true });
    expect(f.members).toEqual([2]);
  });

  it("works on a refit's own covariance", () => {
    const ids = ["a", "b", "c", "d"];
    const answers = [
      ...Array(6).fill({ winner: "a", loser: "c" }),
      ...Array(6).fill({ winner: "b", loser: "c" }),
      ...Array(6).fill({ winner: "c", loser: "d" }),
      { winner: "a", loser: "b" },
      { winner: "b", loser: "a" },
    ];
    const fit = refitRatings(ids, answers);
    const f = favouriteSet(fit.mu, fit.cov);
    expect(f.members.map((i) => ids[i]).sort()).toEqual(["a", "b"]);
  });
});

describe("contenders", () => {
  type I = { name: string; rating: number; rd: number };
  const indep = (a: I, b: I) => (a === b ? a.rd * a.rd : 0);

  it("lists more than the three highest when the answers have not separated them", () => {
    const items: I[] = [1610, 1600, 1595, 1590, 1585, 1300].map((r, i) => ({ name: `i${i}`, rating: r, rd: 80 }));
    const got = contenders(items, indep).map((x) => x.name);
    expect(got.length).toBeGreaterThan(3);
    expect(got).not.toContain("i5");
  });

  it("never returns fewer than two names", () => {
    const items: I[] = [{ name: "a", rating: 2000, rd: 20 }, { name: "b", rating: 1500, rd: 20 }, { name: "c", rating: 1400, rd: 20 }];
    expect(contenders(items, indep).map((x) => x.name)).toEqual(["a", "b"]);
    expect(contenders(items, indep, { bottom: true }).map((x) => x.name)).toEqual(["c", "b"]);
  });
});

describe("contendersLine", () => {
  it("names two or three in full and counts the rest", () => {
    expect(contendersLine(["A", "B"])).toBe("Still too close to call — it's between A and B.");
    expect(contendersLine(["A", "B", "C"])).toBe("Still too close to call — it's between A, B and C.");
    expect(contendersLine(["A", "B", "C", "D", "E"])).toBe("Still too close to call — most likely A, B, C, or one of 2 more you rated near them.");
  });
});

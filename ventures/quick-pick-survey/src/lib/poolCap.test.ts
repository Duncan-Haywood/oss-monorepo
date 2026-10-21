import { describe, expect, it } from "vitest";
import { DEFAULT_GLICKO_STATE } from "@/lib/glicko2";
import { capPool, selectNextPairByInformation, type PairItem } from "@/lib/pairing";

function build(n: number) {
  const items: PairItem[] = [];
  const timesShown = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const shown = i % 7;
    timesShown.set(`i${i}`, shown);
    items.push({ id: `i${i}`, rating: DEFAULT_GLICKO_STATE.rating + ((i * 37) % 200) - 100, rd: 350 - shown * 20 - (i % 5) });
  }
  return { items, timesShown };
}

describe("information pool cap", () => {
  it("leaves a pool at or under the cap alone", () => {
    const { items, timesShown } = build(50);
    expect(capPool(items, timesShown, 50)).toBe(items);
  });
  it("keeps the most uncertain items, deterministically", () => {
    const { items, timesShown } = build(1000);
    const a = capPool(items, timesShown, 100);
    const b = capPool([...items].reverse(), timesShown, 100);
    expect(a).toHaveLength(100);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    const minKept = Math.min(...a.map((i) => i.rd));
    expect(items.filter((i) => i.rd > minKept).every((i) => a.includes(i))).toBe(true);
  });
  it("matches the uncapped choice when the cap is not reached, and stays fast at 3000 items", () => {
    const small = build(60);
    const input = { ...small, recentPairKeys: new Set<string>(), answeredCount: 200, rand: () => 0.5 };
    expect(selectNextPairByInformation(input, { poolCap: 60 })).toEqual(selectNextPairByInformation(input, { poolCap: 10_000 }));
    const big = { ...build(3000), recentPairKeys: new Set<string>(), answeredCount: 400, rand: () => 0.5 };
    const t = performance.now();
    const [x, y] = selectNextPairByInformation(big);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(x).not.toBe(y);
  });
});

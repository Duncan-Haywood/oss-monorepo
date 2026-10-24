/**
 * How long does choosing the next pair take at a large list? Pure compute only
 * (no database): the route adds a handful of indexed queries around it.
 * Run `PAIR_BENCH=out.txt npx vitest run src/lib/pairLatency.test.ts` to print a table.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_GLICKO_STATE } from "@/lib/glicko2";
import { pairKey, selectNextPair, selectNextPairByInformation, selectNextPairHybrid, type PairItem } from "@/lib/pairing";

function build(n: number, answered: number) {
  const items: PairItem[] = [];
  const timesShown = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const id = `item-${i}`;
    const shown = Math.min(Math.floor((answered * 2) / n) + (i % 3), 40);
    timesShown.set(id, shown);
    items.push({
      id,
      rating: DEFAULT_GLICKO_STATE.rating + ((i * 37) % 200) - 100,
      rd: Math.max(60, DEFAULT_GLICKO_STATE.rd - shown * 15),
      category: `c${i % 6}`,
      dimensions: [`d${i % 4}`],
    });
  }
  const recent = new Set([pairKey("item-0", "item-1"), pairKey("item-2", "item-3")]);
  return { items, timesShown, recentPairKeys: recent, answeredCount: answered };
}

function median(fn: () => void, reps = 15): number {
  const t: number[] = [];
  for (let r = 0; r < reps; r++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(reps / 2)];
}

describe("pair selection latency at 220 items", () => {
  const sizes = [50, 220, 500];
  const answers = [0, 90, 300, 1000];
  it("stays well under a human-noticeable delay", () => {
    const rows: string[] = ["items answered shipped info staged (median ms)"];
    let worst = 0;
    for (const n of sizes) {
      for (const a of answers) {
        const input = build(n, a);
        const ship = median(() => selectNextPair(input));
        const info = median(() => selectNextPairByInformation(input));
        const stg = median(() => selectNextPairHybrid(input));
        rows.push(`${n} ${a} ${ship.toFixed(2)} ${info.toFixed(2)} ${stg.toFixed(2)}`);
        if (n === 220) worst = Math.max(worst, ship, stg);
      }
    }
    if (process.env.PAIR_BENCH) writeFileSync(process.env.PAIR_BENCH, rows.join("\n") + "\n");
    expect(worst).toBeLessThan(250);
  });
});

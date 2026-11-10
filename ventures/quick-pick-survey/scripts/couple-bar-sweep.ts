/**
 * How many answers until the couple screen can say something? It needs at
 * least MIN_ITEMS_FOR_CROSS_PERSON (8) items under CONFIDENT_RD (200) in one
 * person's ranking (src/lib/couples.ts). For each list length and selector,
 * prints the median and 90th-percentile answer count at which a synthetic
 * respondent (src/lib/infoGainSim.ts) first reaches that bar, and rank accuracy
 * at a few budgets. docs/INFORMATION-GAIN-SELECTOR.md, "A switch point that
 * depends on list length".
 *
 *   npx tsx scripts/couple-bar-sweep.ts [--seeds 40] [--items 8,11,15,20,30,41,60,80,120]
 */
import { HYBRID_SWITCH_ANSWERS, hybridSwitchAt, selectNextPair, selectNextPairByInformation, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "40"));
const itemCounts = opt("--items", "8,11,15,20,30,41,60,80,120").split(",").map(Number);
const seeds = Array.from({ length: nSeeds }, (_, i) => 1000 + i * 7);
const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

console.log(`| items | selector | answers to the couple bar (median / p90) | rank at 2n | rank at 4n | rank at 8n |`);
console.log(`|---:|---|---:|---:|---:|---:|`);
for (const items of itemCounts) {
  const need = Math.min(8, items);
  const cap = Math.max(300, 8 * items);
  const policies: [string, Policy][] = [
    ["shipped", selectNextPair],
    ["information", (i) => selectNextPairByInformation(i)],
    [`staged, switch at ${HYBRID_SWITCH_ANSWERS}`, (i) => selectNextPairHybrid(i, { switchAt: HYBRID_SWITCH_ANSWERS })],
    [`staged, switch at ${hybridSwitchAt(items)} (by length)`, (i) => selectNextPairHybrid(i)],
  ];
  for (const [name, p] of policies) {
    const reached: number[] = [];
    const rank: Record<number, number[]> = { 2: [], 4: [], 8: [] };
    for (const s of seeds) {
      let at = Infinity;
      const r = simulate(p, items, cap, s, 0, 0, 0, false, (answered, rds) => {
        if (at === Infinity && rds.filter((rd) => rd < 200).length >= need) at = answered;
      });
      reached.push(at);
      for (const m of [2, 4, 8]) rank[m].push(simulate(p, items, m * items, s).rankAccuracy);
      void r;
    }
    const fmt = (x: number) => (x === Infinity ? `>${cap}` : String(x));
    console.log(`| ${items} | ${name} | ${fmt(q(reached, 0.5))} / ${fmt(q(reached, 0.9))} | ${mean(rank[2]).toFixed(3)} | ${mean(rank[4]).toFixed(3)} | ${mean(rank[8]).toFixed(3)} |`);
  }
}

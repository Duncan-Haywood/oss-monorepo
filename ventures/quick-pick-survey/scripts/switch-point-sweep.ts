/**
 * Where should the staged selector hand over to the information selector?
 * Sweeps the switch point as a multiple of list length on the synthetic
 * respondent of src/lib/infoGainSim.ts and prints, per list length and answer
 * count, the items under rd 150 (the couple screen's settled-item bar) and
 * rank accuracy for each switch point. docs/INFORMATION-GAIN-SELECTOR.md,
 * "A switch point that depends on list length".
 *
 *   npx tsx scripts/switch-point-sweep.ts [--seeds 10] [--items 11,15,20,41,80,220]
 */
import { selectNextPair, selectNextPairByInformation, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "10"));
const itemCounts = opt("--items", "11,15,20,41,80,220").split(",").map(Number);
const multiples = opt("--multiples", "0,1,2,3,4,6").split(",").map(Number);
const seeds = Array.from({ length: nSeeds }, (_, i) => 1000 + i * 7);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

for (const items of itemCounts) {
  const budgets = [...new Set([2, 4, 6, 8, 12].map((m) => Math.round((m * items) / 2)).concat([90, 120, 200, 300]))].filter((b) => b <= Math.max(300, 6 * items)).sort((a, b) => a - b);
  const policies: [string, Policy][] = [
    ["shipped", selectNextPair],
    ["info", (i) => selectNextPairByInformation(i)],
    ["fixed120", (i) => selectNextPairHybrid(i, { switchAt: 120 })],
    ...multiples.map((m) => [`${m}n`, (i: Parameters<Policy>[0]) => selectNextPairHybrid(i, { switchAt: m * items })] as [string, Policy]),
  ];
  console.log(`\n## ${items} items (cells: under rd 150 / rank accuracy, mean of ${nSeeds} seeds)\n`);
  console.log(`| answers | ${policies.map(([n]) => n).join(" | ")} |`);
  console.log(`|---:|${policies.map(() => "---").join("|")}|`);
  for (const b of budgets) {
    const cells = policies.map(([, p]) => {
      const rs = seeds.map((s) => simulate(p, items, b, s));
      return `${mean(rs.map((r) => r.under(150))).toFixed(1)} / ${mean(rs.map((r) => r.rankAccuracy)).toFixed(3)}`;
    });
    console.log(`| ${b} | ${cells.join(" | ")} |`);
  }
}

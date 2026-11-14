/**
 * The honest flag rate of slotBlockStarts (groupRanking.ts), measured. Behind the route's slot shuffle an honest
 * respondent's slot on each answer is a fair coin, so this draws fair coins and nothing else; SLOT_BLOCK_ALPHA is
 * the bound, and this shows how far under it the Bonferroni split lands (docs/INFORMATION-GAIN-SELECTOR.md,
 * "Clicking one position from partway through").
 *
 *   npx tsx scripts/slot-block-null.ts [--answers 30,60,120,240,480] [--people 20000] [--seed 9]
 */
import { SLOT_BLOCK_MIN_KEPT, slotBlockStarts, slotClickers } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const lengths = opt("--answers", "30,60,120,240,480").split(",").map(Number);
const people = Number(opt("--people", "20000"));
let s = Number(opt("--seed", "9")) >>> 0;
const rand = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
for (const n of lengths) {
  const answers: { participantId: string; result: string }[] = [];
  const counts: { participantId: string; first: number; second: number }[] = [];
  for (let p = 0; p < people; p++) {
    let first = 0;
    for (let i = 0; i < n; i++) {
      const a = rand() < 0.5;
      if (a) first++;
      answers.push({ participantId: `h${p}`, result: a ? "A" : "B" });
    }
    counts.push({ participantId: `h${p}`, first, second: n - first });
  }
  const blocks = slotBlockStarts(answers);
  const partial = [...blocks.values()].filter((at) => at >= SLOT_BLOCK_MIN_KEPT).length;
  console.log(JSON.stringify({ answers: n, people, slotBlocks: blocks.size / people, partOfSession: partial / people, slotClickers: slotClickers(counts).size / people }));
}

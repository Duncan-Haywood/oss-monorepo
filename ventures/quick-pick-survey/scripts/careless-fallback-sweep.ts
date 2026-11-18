/**
 * Careless answering and the staged selector. With 35% to 50% of answers given
 * at random the information selector trailed the shipped one on 15 and 30
 * items (docs/INFORMATION-GAIN-SELECTOR.md, "A switch point that depends on
 * list length"). Candidate fallback: hand the pair back to the shipped
 * selector when the "answers look random" score (answerAgreement, last 80
 * decided answers scored on the ratings before each answer) is below a bar.
 * Sticky variants stay on the shipped selector once the bar is crossed.
 *
 * The agreement score is passed to the fallback rule only; the information
 * selector is called without it, so its admission pause stays off as in the
 * route. Synthetic respondent of src/lib/infoGainSim.ts. Prints mean rank
 * accuracy by list length, lapse rate and budget (answers per item), and the
 * share of runs the fallback fired in.
 *
 *   npx tsx scripts/careless-fallback-sweep.ts [--seeds 30] [--seed-base 1000] [--items 8,11,15,20,30] [--lapses 0,0.1,0.2,0.35,0.5] [--per-item 2,4,8] [--policies 'shipped;staged']
 */
import { selectNextPair, selectNextPairByInformation, selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "30"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,11,15,20,30").split(",").map(Number);
const lapses = opt("--lapses", "0,0.1,0.2,0.35,0.5").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const only = opt("--policies", "");
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** The staged selector, with the agreement score kept away from the information selector. */
const staged = (i: PairingInput) => selectNextPairHybrid({ ...i, answerAgreement: undefined });

function fallback(bar: number, sticky: boolean): { policy: Policy; fired: () => boolean; reset: () => void } {
  let tripped = false;
  return {
    reset: () => (tripped = false),
    fired: () => tripped,
    policy: (i) => {
      const z = i.answerAgreement;
      const low = z !== undefined && z < bar;
      if (low) tripped = true;
      if (low || (sticky && tripped)) return selectNextPair({ ...i, answerAgreement: undefined });
      return staged(i);
    },
  };
}

type Row = { name: string; policy: Policy; useAgreement: boolean; fired?: () => boolean; reset?: () => void };
const rows: Row[] = [
  { name: "shipped", policy: (i) => selectNextPair({ ...i, answerAgreement: undefined }), useAgreement: false },
  { name: "information", policy: (i) => selectNextPairByInformation({ ...i, answerAgreement: undefined }), useAgreement: false },
  { name: "staged", policy: staged, useAgreement: false },
];
for (const bar of [-2, -1.5, -1]) {
  for (const sticky of [false, true]) {
    const f = fallback(bar, sticky);
    rows.push({ name: `staged, z<${bar}${sticky ? " sticky" : ""}`, policy: f.policy, useAgreement: true, fired: f.fired, reset: f.reset });
  }
}
// No detection at all: a share of answers always goes to the shipped selector.
for (const share of [0.25, 0.5]) {
  rows.push({ name: `staged, ${+(share * 100).toFixed(4)}% shipped`, policy: (i) => ((i.rand ?? Math.random)() < share ? selectNextPair({ ...i, answerAgreement: undefined }) : staged(i)), useAgreement: false });
}
const chosen = only ? rows.filter((r) => only.split(";").includes(r.name)) : rows;

const out: Record<string, unknown>[] = [];
for (const items of itemCounts) {
  for (const lapse of lapses) {
    for (const k of perItem) {
      const budget = k * items;
      const cell: Record<string, unknown> = { items, lapse, perItem: k, budget };
      for (const r of chosen) {
        const acc: number[] = [];
        let fired = 0;
        for (const s of seeds) {
          r.reset?.();
          acc.push(simulate(r.policy, items, budget, s, lapse, 0, 0, r.useAgreement).rankAccuracy);
          if (r.fired?.()) fired++;
        }
        cell[r.name] = Number(mean(acc).toFixed(3));
        if (r.fired) cell[`${r.name} fired`] = Number((fired / seeds.length).toFixed(2));
      }
      out.push(cell);
      console.log(JSON.stringify(cell));
    }
  }
}

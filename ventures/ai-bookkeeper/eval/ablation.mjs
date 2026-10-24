// Per-layer ablation on the SYNTHETIC year (eval/synth.mjs), same protocol as
// benchmark.mjs: each month is categorised with every earlier month confirmed.
// Runs the whole year with some layers switched off and reports, for months
// 4 to 12, how many lines end up with the right account without the person
// touching them (posted alone), how many carry a right suggestion, how many
// are wrong, and how many have none.
//
//   node ventures/ai-bookkeeper/eval/ablation.mjs [--seeds 5] [--json]
import { runSeed } from "./benchmark.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const SEEDS = +arg("--seeds", 5);
const ALL = ["rule", "memory", "learned", "built-in"];
// The synthetic studio has no rules, so "rule" is never exercised and is left out.
const LAYERS = ["memory", "learned", "built-in"];
const configs = [
  { name: "all layers", skip: [] },
  ...LAYERS.map((l) => ({ name: `without ${l}`, skip: [l] })),
  ...LAYERS.map((l) => ({ name: `${l} only`, skip: LAYERS.filter((x) => x !== l) })),
];

export function ablate(seeds = SEEDS) {
  return configs.map((c) => {
    const t = { lines: 0, auto: 0, autoWrong: 0, suggested: 0, suggestedRight: 0, blank: 0, transfer: 0 };
    for (let seed = 1; seed <= seeds; seed++)
      for (const r of runSeed(seed, undefined, { skipLayers: c.skip }).slice(3)) for (const k of Object.keys(t)) t[k] += r[k];
    const nonTransfer = t.lines - t.transfer;
    return { ...c, ...t, nonTransfer, rightAlone: t.auto - t.autoWrong, rightAny: t.auto - t.autoWrong + t.suggestedRight };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = ablate();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ seeds: SEEDS, rows }, null, 2)); process.exit(0); }
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
  console.log(`Synthetic studio, ${SEEDS} seeds, months 4-12, lines other than paired transfers.\n`);
  console.log("layers | lines | right, posted alone | wrong, posted alone | right in all (alone or suggested) | wrong suggestion | no suggestion");
  for (const r of rows) {
    const wrongSug = r.suggested - r.suggestedRight;
    console.log(`${r.name} | ${r.nonTransfer} | ${pct(r.rightAlone, r.nonTransfer)} | ${r.autoWrong} | ${pct(r.rightAny, r.nonTransfer)} | ${wrongSug} | ${pct(r.blank, r.nonTransfer)}`);
  }
}

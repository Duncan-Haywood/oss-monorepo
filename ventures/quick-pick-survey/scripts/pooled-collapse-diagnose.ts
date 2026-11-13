/**
 * Why does the pooled Gaussian prior sd collapse toward the 0.3 floor under the
 * staged selector with many answers per item? (docs/INFORMATION-GAIN-SELECTOR.md,
 * "Why the pooled sd collapsed".)
 *
 * For one cell, rebuilds the independent panel the interval sweeps pool over,
 * and prints, on a grid of phi: the pooled sampled evidence (2000 draws, as
 * shipped), the same with 20000 draws and another seed, each person's effective
 * sample size, and which respondents move the pooled curve most.
 *
 *   npx tsx scripts/pooled-collapse-diagnose.ts [--items 15] [--per-item 8] [--seed-base 50000] [--seeds 40] [--selector staged]
 */
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { pooledPriorPhi, sampledEvidence, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const items = Number(opt("--items", "15"));
const k = Number(opt("--per-item", "8"));
const seedBase = Number(opt("--seed-base", "50000"));
const nSeeds = Number(opt("--seeds", "40"));
const sel = opt("--selector", "staged");
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7 + 100000);
const panel = seeds.map((s) => {
  const r = simulate(SELECTORS[sel], items, k * items, s, 0, 0, 0, false);
  const ids = [...r.truth.keys()];
  const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
  const t = ids.map((id) => 2 * r.truth.get(id)!);
  const gaps = r.history.map(({ picked, other }) => Math.abs(r.truth.get(picked)! - r.truth.get(other)!) * 2);
  const upsets = r.history.filter(({ picked, other }) => r.truth.get(picked)! < r.truth.get(other)!).length;
  const pairs = new Set(r.history.map(({ picked, other }) => [picked, other].sort().join("|"))).size;
  const m = t.reduce((a, b) => a + b, 0) / t.length;
  const sd = Math.sqrt(t.reduce((a, b) => a + (b - m) ** 2, 0) / (t.length - 1));
  return { seed: s, ids, answers, sd, gap: gaps.reduce((a, b) => a + b, 0) / gaps.length, upsets: upsets / r.history.length, pairs };
});
const avg = (f: (p: (typeof panel)[0]) => number) => (panel.reduce((a, p) => a + f(p), 0) / panel.length).toFixed(3);
console.log(`panel: realised truth sd ${avg((p) => p.sd)}, mean |logit gap| of asked pairs ${avg((p) => p.gap)}, upset share ${avg((p) => p.upsets)}, distinct pairs ${avg((p) => p.pairs)}`);
const grid = [0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0];
console.log("pooled phi (shipped search):", pooledPriorPhi(panel).toFixed(3));
const ev = (p: (typeof panel)[0], phi: number, draws: number, seed: number) => sampledEvidence(p.ids, p.answers, phi, { draws, seed });
const rows = panel.map((p) => ({ seed: p.seed, base: grid.map((g) => ev(p, g, 2000, 0xe71d)), big: grid.map((g) => ev(p, g, 20000, 0x5eed)) }));
const sum = (key: "base" | "big") => grid.map((_, j) => rows.reduce((s, r) => s + r[key][j], 0));
const fmt = (v: number[]) => v.map((x) => x.toFixed(1).padStart(8)).join("");
console.log("phi            " + grid.map((g) => g.toFixed(2).padStart(8)).join(""));
console.log("pooled 2000   " + fmt(sum("base")));
console.log("pooled 20000  " + fmt(sum("big")));
// Per-person: evidence at 1.2 minus at 0.3 (positive favours the true-ish spread), two estimates.
const diffs = rows.map((r) => ({ seed: r.seed, d2k: r.base[5] - r.base[0], d20k: r.big[5] - r.big[0] })).sort((a, b) => a.d2k - b.d2k);
console.log("most floor-favouring respondents (ev(1.2) - ev(0.3)): 2000 draws / 20000 draws");
for (const d of diffs.slice(0, 8)) console.log(`  seed ${d.seed}: ${d.d2k.toFixed(2)} / ${d.d20k.toFixed(2)}`);
console.log("median", diffs[Math.floor(diffs.length / 2)].d2k.toFixed(2));

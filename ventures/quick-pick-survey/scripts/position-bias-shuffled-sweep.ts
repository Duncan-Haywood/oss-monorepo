/**
 * The 2026-10-28 position-bias tables re-measured behind the route's slot
 * shuffle (docs/INFORMATION-GAIN-SELECTOR.md, "Position bias behind the slot
 * shuffle").
 *
 * `simulate(..., positionBias)` gives the bias to the policy's first id, and
 * the selectors do not shuffle where /api/trials/next does, so the old
 * biasedRespondent tables put every biased answer on the item the selector
 * chose first. Here every policy is wrapped in the route's per-pair coin flip,
 * so a biased answer lands on a random one of the two, as live.
 *
 * Policies (30 items is under INFO_FROM_START_MAX_ITEMS, so staged has no
 * warm-up and differs from the information selector only by its fallback):
 *
 *   shipped      selectNextPair (the original pairing)
 *   info         selectNextPairByInformation (staged with the fallback off)
 *   staged@t     the information selector, falling back to shipped when the
 *                first-option share (30+ decided answers) is >= t or <= 1 - t;
 *                t = 0.7 is FIRST_OPTION_FALLBACK_SHARE, what ships
 *
 * Each cell also reports, for staged@t, the share of answers served by the
 * fallback ("fb"), and for bias 0 the share of honest respondents for whom it
 * ever fired (a false trigger).
 *
 * Usage: npx tsx scripts/position-bias-shuffled-sweep.ts [--items 30]
 *        [--seeds 30] [--seed0 9100] [--budgets 120,300]
 *        [--biases -0.5,-0.3,...] [--thresholds 0.6,0.65,0.7,0.75,0.8]
 *        [--out rows.jsonl]
 * Prints one JSON row per (budget, bias) cell and a markdown summary.
 */
import { appendFileSync } from "node:fs";
import { FIRST_OPTION_FALLBACK_SHARE, selectNextPair, selectNextPairByInformation, type PairingInput } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);

const items = Number(opt("--items", "30"));
const seedCount = Number(opt("--seeds", "30"));
const seed0 = Number(opt("--seed0", "9100"));
const budgets = nums(opt("--budgets", "120,300"));
const biases = nums(opt("--biases", "-0.5,-0.3,-0.1,0,0.1,0.2,0.3,0.4,0.5,0.6"));
const thresholds = nums(opt("--thresholds", "0.6,0.65,0.7,0.75,0.8"));
const out = opt("--out", "");

/** The route's slot shuffle (src/app/api/trials/next/route.ts): a coin flip per pair, from the run's rand. */
function shuffled(policy: Policy): Policy {
  return (input: PairingInput) => {
    const [a, b] = policy(input);
    return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
  };
}

/** selectNextPairHybrid at 30 items (switchAt 0) with the fallback share as a parameter, counting fallback answers. */
function staged(t: number, counter: { fb: number }): Policy {
  return (input: PairingInput) => {
    const s = input.firstOptionShare;
    if (s !== undefined && (s >= t || s <= 1 - t)) {
      counter.fb++;
      return selectNextPair(input);
    }
    return selectNextPairByInformation(input);
  };
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r3 = (x: number) => Number(x.toFixed(3));
const seeds = Array.from({ length: seedCount }, (_, i) => seed0 + i * 13);

type Row = { budget: number; bias: number; acc: Record<string, number>; perSeed: Record<string, number[]>; fb: Record<string, number>; everFired: Record<string, number> };
const rows: Row[] = [];

for (const budget of budgets) {
  for (const bias of biases) {
    const perSeed: Record<string, number[]> = { shipped: [], info: [] };
    const fb: Record<string, number> = {};
    const everFired: Record<string, number> = {};
    for (const seed of seeds) {
      perSeed.shipped.push(simulate(shuffled(selectNextPair), items, budget, seed, 0, bias).rankAccuracy);
      perSeed.info.push(simulate(shuffled((i) => selectNextPairByInformation(i)), items, budget, seed, 0, bias).rankAccuracy);
      for (const t of thresholds) {
        const k = `staged@${t}`;
        const c = { fb: 0 };
        (perSeed[k] ??= []).push(simulate(shuffled(staged(t, c)), items, budget, seed, 0, bias).rankAccuracy);
        fb[k] = (fb[k] ?? 0) + c.fb / budget / seeds.length;
        everFired[k] = (everFired[k] ?? 0) + (c.fb > 0 ? 1 / seeds.length : 0);
      }
    }
    const acc = Object.fromEntries(Object.entries(perSeed).map(([k, v]) => [k, r3(mean(v))]));
    const row: Row = { budget, bias, acc, perSeed, fb: Object.fromEntries(Object.entries(fb).map(([k, v]) => [k, r3(v)])), everFired: Object.fromEntries(Object.entries(everFired).map(([k, v]) => [k, r3(v)])) };
    rows.push(row);
    const line = JSON.stringify({ items, seeds: seedCount, seed0, budget, bias, acc, fb: row.fb, everFired: row.everFired, perSeed: Object.fromEntries(Object.entries(perSeed).map(([k, v]) => [k, v.map(r3)])) });
    if (out) appendFileSync(out, line + "\n");
    console.error(`budget ${budget} bias ${bias}: ${JSON.stringify(acc)} fb ${JSON.stringify(row.fb)}`);
  }
}

/** Paired difference (a - b) over seeds: mean and a normal 95% half-width. */
function paired(a: number[], b: number[]) {
  const d = a.map((x, i) => x - b[i]);
  const m = mean(d);
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
  return `${m >= 0 ? "+" : ""}${m.toFixed(3)} ± ${((1.96 * sd) / Math.sqrt(d.length)).toFixed(3)}`;
}

const ship = `staged@${FIRST_OPTION_FALLBACK_SHARE}`;
console.log(`\n${items} items, ${seedCount} seeds, slots shuffled per pair\n`);
console.log(`| answers | bias | shipped | info | ${thresholds.map((t) => `staged@${t}`).join(" | ")} | ${ship} - info | ${ship} - shipped | ${ship} fb share |`);
console.log(`|---|---|---|---|${thresholds.map(() => "---|").join("")}---|---|---|`);
for (const r of rows) {
  console.log(`| ${r.budget} | ${r.bias} | ${r.acc.shipped} | ${r.acc.info} | ${thresholds.map((t) => r.acc[`staged@${t}`]).join(" | ")} | ${paired(r.perSeed[ship], r.perSeed.info)} | ${paired(r.perSeed[ship], r.perSeed.shipped)} | ${r.fb[ship]} (ever ${r.everFired[ship]}) |`);
}

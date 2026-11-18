// Seeded simulation of the online rules against batch Benjamini-Hochberg.
//   node eval/simulate_online.mjs [--reps 400] > eval/simulation_online.json
// A stream of n independent one-sided z-tests; a share pi1 are true effects
// (mean shift `shift`), the rest N(0,1). The order is random unless
// `order` is "effects-first" or "effects-last". Reports per rule, at alpha
// 0.05, the mean false discovery proportion (FDR), the share of runs with
// any false discovery, and the mean share of true effects found (power).
import { runOnline } from "../online.mjs";
import { bh } from "../engine.mjs";
import { mulberry32, gauss, normSf } from "./simulate.mjs";
import { pathToFileURL } from "node:url";

export function simulateOnline({ n = 1000, pi1 = 0.1, shift = 3, order = "random", reps = 400, alpha = 0.05, seed = 20261116 } = {}) {
  const rand = mulberry32(seed);
  const acc = {};
  const add = (id, rej, truth) => {
    let R = 0, V = 0, S = 0;
    rej.forEach((r, i) => { if (r) { R++; if (truth[i]) S++; else V++; } });
    const n1 = truth.filter(Boolean).length;
    const a = (acc[id] ??= { fdp: 0, anyFalse: 0, power: 0, rejections: 0 });
    a.fdp += R ? V / R : 0; a.anyFalse += V > 0 ? 1 : 0; a.power += n1 ? S / n1 : 0; a.rejections += R;
  };
  for (let r = 0; r < reps; r++) {
    let truth = Array.from({ length: n }, () => rand() < pi1);
    if (order === "effects-first") truth.sort((a, b) => b - a);
    if (order === "effects-last") truth.sort((a, b) => a - b);
    const p = truth.map((t) => normSf(gauss(rand) + (t ? shift : 0)));
    const res = runOnline(p, { alpha });
    for (const id of Object.keys(res)) add(id, res[id].reject, truth);
    add("bh_batch", bh(p).map((x) => x <= alpha), truth);
  }
  const out = {};
  for (const [id, a] of Object.entries(acc)) out[id] = { fdr: +(a.fdp / reps).toFixed(4), pAnyFalse: +(a.anyFalse / reps).toFixed(4), power: +(a.power / reps).toFixed(4), meanRejections: +(a.rejections / reps).toFixed(2) };
  return { setting: { n, pi1, shift, order, reps, alpha, seed }, results: out };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const i = process.argv.indexOf("--reps");
  const reps = i > 0 ? Number(process.argv[i + 1]) : 400;
  const settings = [
    { pi1: 0.1 }, { pi1: 0.3 }, { pi1: 0.5 },
    { pi1: 0.1, order: "effects-first" }, { pi1: 0.1, order: "effects-last" },
    { pi1: 0.02 },
  ];
  process.stdout.write(JSON.stringify({ generator: "eval/simulate_online.mjs", runs: settings.map((s) => simulateOnline({ ...s, reps })) }, null, 2) + "\n");
}

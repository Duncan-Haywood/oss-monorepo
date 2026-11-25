// Do the intervals cover, and do the standard errors match the spread of
// estimates across repeated studies?
//   node eval/coverage.mjs [sims] > eval/coverage-output.txt
// Part 1: utilities identical across respondents (the logit is the true
// model): coverage of the 95% intervals, model-based and cluster-robust.
// Part 2: utilities vary by respondent (the meal-kit example's settings):
// each SE against the standard deviation of the estimates across studies,
// and the estimates against the true mean utilities.
import { analyze, parseAttributes } from "../engine.mjs";
import { simulate, MEAL_KIT_ATTRIBUTES, TRUE_MEAN, TRUE_SD } from "../simulate.mjs";
import { CASES } from "./cases.mjs";

const sims = Number(process.argv[2] ?? 400);
const out = [];
const sd = (a) => { const m = a.reduce((t, x) => t + x, 0) / a.length; return Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)); };
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;

{
  const c = CASES[2];
  const atts = parseAttributes(c.levels);
  const truth = c.sim.mean;
  const key = (label) => label.replace(" (per unit)", "").replace(" (no-choice constant)", "");
  let names = null;
  const hitM = {}, hitR = {};
  for (let s = 0; s < sims; s++) {
    const text = simulate({ attributes: atts, ...c.sim, seed: 1000 + s });
    const r = analyze({ text, levels: c.levels, numeric: c.numeric, price: c.price, bootstrap: 0 });
    names ??= r.coefficients.map((x) => x.label);
    for (const x of r.coefficients) {
      const t = truth[key(x.label)] ?? 0;
      hitM[x.label] = (hitM[x.label] ?? 0) + (Math.abs(x.estimate - t) <= 1.959964 * x.se ? 1 : 0);
      hitR[x.label] = (hitR[x.label] ?? 0) + (Math.abs(x.estimate - t) <= 1.959964 * x.seRobust ? 1 : 0);
    }
  }
  out.push(`Part 1: homogeneous utilities, ${c.sim.n} respondents x ${c.sim.tasks} tasks, ${c.sim.concepts} concepts + none, ${sims} studies`);
  out.push("coefficient,coverage_model_95,coverage_cluster_robust_95");
  for (const n of names) out.push(`${n},${(100 * hitM[n] / sims).toFixed(1)},${(100 * hitR[n] / sims).toFixed(1)}`);
  const all = (h) => (100 * Object.values(h).reduce((a, b) => a + b, 0) / (sims * names.length)).toFixed(1);
  out.push(`all,${all(hitM)},${all(hitR)}`);
  out.push("");
}

{
  const atts = parseAttributes(MEAL_KIT_ATTRIBUTES);
  const n2 = Math.max(50, Math.round(sims / 2));
  const est = {}, seM = {}, seR = {};
  const wtp = {};
  let names = null;
  for (let s = 0; s < n2; s++) {
    const text = simulate({ attributes: atts, seed: 5000 + s });
    const r = analyze({ text, levels: MEAL_KIT_ATTRIBUTES, price: "Price per serving", bootstrap: 0 });
    names ??= r.coefficients.map((x) => x.label);
    for (const x of r.coefficients) {
      (est[x.label] ??= []).push(x.estimate); (seM[x.label] ??= []).push(x.se); (seR[x.label] ??= []).push(x.seRobust);
    }
    for (const w of r.wtp) (wtp[`${w.attr}: ${w.level}`] ??= []).push(w.value);
  }
  out.push(`Part 2: utilities vary by respondent (meal-kit settings: SD ${TRUE_SD["Price per serving"]} on price, ${TRUE_SD.other} on levels, ${TRUE_SD.None} on none), 300 respondents x 12 tasks, ${n2} studies`);
  out.push("coefficient,true_mean,mean_estimate,sd_of_estimates,mean_model_se,mean_cluster_robust_se");
  for (const n of names) {
    const k = n.replace(" (per unit)", "").replace(" (no-choice constant)", "");
    out.push(`${n},${(TRUE_MEAN[k] ?? 0).toFixed(3)},${mean(est[n]).toFixed(3)},${sd(est[n]).toFixed(4)},${mean(seM[n]).toFixed(4)},${mean(seR[n]).toFixed(4)}`);
  }
  const big = names.filter((n) => !n.startsWith("None") && Math.abs(TRUE_MEAN[n.replace(" (per unit)", "")]) >= 0.25);
  const shrink = big.map((n) => 100 * (1 - mean(est[n]) / TRUE_MEAN[n.replace(" (per unit)", "")]));
  const under = names.map((n) => 100 * (1 - mean(seM[n]) / sd(est[n])));
  const underR = names.map((n) => Math.abs(100 * (1 - mean(seR[n]) / sd(est[n]))));
  out.push(`summary: coefficients with |true mean| >= 0.25 shrink by ${Math.min(...shrink).toFixed(0)} to ${Math.max(...shrink).toFixed(0)} percent`);
  out.push(`summary: model-based SEs understate the spread by ${Math.min(...under).toFixed(0)} to ${Math.max(...under).toFixed(0)} percent; cluster-robust SEs are within ${Math.max(...underR).toFixed(0)} percent`);
  out.push("");
  out.push("willingness_to_pay,true_ratio_of_means,mean_estimate,sd_of_estimates");
  const gaps = [];
  for (const [k, v] of Object.entries(wtp)) {
    const tk = k === "None: no-choice constant" ? "None" : k;
    const t = TRUE_MEAN[tk] != null ? -TRUE_MEAN[tk] / TRUE_MEAN["Price per serving"] : NaN;
    out.push(`${k},${t.toFixed(2)},${mean(v).toFixed(2)},${sd(v).toFixed(3)}`);
    if (!k.startsWith("None")) gaps.push(Math.abs(mean(v) - t));
  }
  out.push(`summary: WTP (none constant aside) lands within ${Math.min(...gaps).toFixed(2)} to ${Math.max(...gaps).toFixed(2)} dollars of the true ratio of means`);
}
console.log(out.join("\n"));

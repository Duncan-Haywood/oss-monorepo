// node scripts/rank-stop-calibration.mjs [--runs 12] [--rules fixed,eb,hold3,hold6,phi1,phi0_6] [--out docs/rank-stop-eb-2026-11-14.jsonl]
//
// How well the rank page's stop rule (site/rank.html, orderConfidence >=
// STOP_CONFIDENCE) matches what it claims, on simulated respondents, and
// whether a second check at the respondent's own empirical-Bayes prior sd
// (empiricalPriorPhi, the insights route's favourite-set prior) stops the
// rule overclaiming for very noisy answerers (docs/RANK-PAGE.md, "Noisy
// answerers").
//
// Respondent: true scores evenly spaced over `spread` logits, shuffled;
// answers P(i over j) = sigmoid(s_i - s_j), no ties. Pairs come from the
// page's own nextPair. Each run records, for every rule, the picks it stopped
// at (or the cap), the confidence it read, and the true Spearman between the
// order then shown and the respondent's real order.
import { writeFileSync } from "node:fs";
import { fit, nextPair, order, orderConfidence, suggestedMax, STOP_CONFIDENCE, fitAt, stopCheck } from "../site/rank-core.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 8));
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 1000));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spearmanWithTruth(shownOrder, truth) {
  const n = truth.length;
  const trueOrder = truth.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const tr = new Array(n), sr = new Array(n);
  trueOrder.forEach((it, k) => (tr[it] = k));
  shownOrder.forEach((it, k) => (sr[it] = k));
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (tr[i] - sr[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const cells = [];
for (const n of [8, 15, 25]) for (const spread of [100, 6, 3, 1.5]) cells.push({ n, spread });

const RULES = (opt("--rules", "fixed,eb,hold3,phi1")).split(",");
// Each rule sees the fixed fit and confidence after every pick and returns
// { done, confidence, phi? }. State per run lets a rule look back.
const makeRule = (name) => {
  if (name === "fixed") return () => (n, answers, g, cf) => ({ done: cf >= STOP_CONFIDENCE, confidence: cf });
  if (name === "eb") return () => (n, answers, g, cf) => stopCheck(n, answers, { fixedFit: g, fixedConfidence: cf });
  if (name.startsWith("hold")) {
    const k = Number(name.slice(4));
    return () => { let streak = 0; return (n, answers, g, cf) => { streak = cf >= STOP_CONFIDENCE ? streak + 1 : 0; return { done: streak >= k, confidence: cf }; }; };
  }
  if (name.startsWith("phi")) {
    const phi = Number(name.slice(3).replace("_", "."));
    return () => (n, answers, g, cf) => {
      if (cf < STOP_CONFIDENCE) return { done: false, confidence: cf };
      const c2 = Math.min(cf, orderConfidence(fitAt(n, answers, phi)));
      return { done: c2 >= STOP_CONFIDENCE, confidence: c2 };
    };
  }
  throw new Error(`unknown rule ${name}`);
};

const rows = [];
for (const { n, spread } of cells) {
  const agg = Object.fromEntries(RULES.map((k) => [k, []]));
  for (let r = 0; r < RUNS; r++) {
    const seed = SEED0 + 7919 * r + 31 * n + Math.round(10 * spread);
    const rand = mulberry32(seed);
    const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
    const cap = suggestedMax(n);
    const answers = [];
    const rules = Object.fromEntries(RULES.map((k) => [k, makeRule(k)()]));
    const stopped = Object.fromEntries(RULES.map((k) => [k, null]));
    let last = null;
    while (answers.length < cap && RULES.some((k) => !stopped[k])) {
      const f = fit(n, answers);
      const [a, b] = nextPair(f, answers, { seed });
      const p = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
      answers.push(rand() < p ? [a, b, false] : [b, a, false]);
      const g = fit(n, answers);
      const cf = orderConfidence(g);
      const rho = spearmanWithTruth(order(g), truth);
      last = { g, cf, rho };
      for (const k of RULES) {
        if (stopped[k]) continue;
        const s = rules[k](n, answers, g, cf);
        if (s.done || answers.length >= cap) stopped[k] = { picks: answers.length, conf: s.confidence, rho, cap: !s.done, phi: s.phi };
      }
    }
    for (const k of RULES) agg[k].push(stopped[k]);
  }
  const mean = (xs, k) => xs.reduce((s, x) => s + (x[k] ?? 0), 0) / xs.length;
  const row = { n, spread, runs: RUNS };
  for (const k of RULES) {
    const xs = agg[k];
    row[k] = {
      picks: +mean(xs, "picks").toFixed(1),
      confidence: +mean(xs, "conf").toFixed(3),
      trueSpearman: +mean(xs, "rho").toFixed(3),
      overclaim: +(mean(xs, "conf") - mean(xs, "rho")).toFixed(3),
      atCap: xs.filter((x) => x.cap).length,
    };
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify({ run: "rank-stop-rules", seed0: SEED0, ...r })).join("\n") + "\n");

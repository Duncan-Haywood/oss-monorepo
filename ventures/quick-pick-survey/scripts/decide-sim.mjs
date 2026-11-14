// node scripts/decide-sim.mjs [--runs 12] [--out docs/decide-sim-2026-11-14.jsonl]
//
// Simulated people answering site/decide.html's questions. Each person has
// true criterion logits s ~ N(0, 1) (weights softmax(s)) and, per criterion,
// true option scores x_c ~ N(0, (spread/4)^2), and answers every question
// with Bradley-Terry odds on the true values. The truth is the overall order
// of sum_c softmax(s)_c * centred(x_c), the model the page fits.
//
// Two measurements:
//   1. fixed budgets: the shown order's Spearman with the true order, and how
//      often the shown best is the true best, adaptive picker vs random
//      questions, at the same number of answers;
//   2. the stop rule: picks until decisionDone (or decisionMax), with the
//      confidence read against the true Spearman at the stop.
// The picker is the page default (focus "winner" since 2026-11-14 later);
// docs/decide-sim-2026-11-14.jsonl was written with the first, "order" focus.
import { writeFileSync } from "node:fs";
import { decisionFit, nextQuestion, decisionTable, decisionDone, decisionMax, overallOrder } from "../site/decide-core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const RUNS = Number(args.runs || 12);
const OUT = args.out || null;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

function person(n, C, spread, seed) {
  const r = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const s = Array.from({ length: C }, g);
  const x = Array.from({ length: C }, () => Array.from({ length: n }, () => (g() * spread) / 4));
  const w = softmax(s);
  const total = Array.from({ length: n }, (_, i) => x.reduce((a, xc, c) => a + w[c] * (xc[i] - xc.reduce((p, q) => p + q, 0) / n), 0));
  const truth = total.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  return { s, x, truth, rand: r };
}

function answer(p, q, answers) {
  const [a, b] = q.pair;
  const d = q.kind === "crit" ? p.s[a] - p.s[b] : p.x[q.c][a] - p.x[q.c][b];
  const aWins = p.rand() < 1 / (1 + Math.exp(-d));
  const [w, l] = aWins ? [a, b] : [b, a];
  if (q.kind === "crit") answers.crit.push([w, l, false]); else answers.opt.push([q.c, w, l, false]);
  answers.lastKind = q.kind;
}

function spearman(shown, truth) {
  const n = shown.length, rs = new Array(n), rt = new Array(n);
  shown.forEach((it, k) => (rs[it] = k)); truth.forEach((it, k) => (rt[it] = k));
  let d2 = 0; for (let i = 0; i < n; i++) d2 += (rs[i] - rt[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const rows = [];
const cases = [
  { n: 5, C: 3, spread: 6 }, { n: 5, C: 3, spread: 3 },
  { n: 8, C: 4, spread: 6 }, { n: 8, C: 4, spread: 3 },
  { n: 12, C: 5, spread: 6 },
];
for (const { n, C, spread } of cases) {
  const max = decisionMax(n, C);
  const budgets = [Math.round(max / 4), Math.round(max / 2), max];
  for (const strategy of ["adaptive", "random"]) {
    const acc = budgets.map(() => ({ sp: 0, best: 0 }));
    for (let run = 0; run < RUNS; run++) {
      const p = person(n, C, spread, 1000 + run);
      const answers = { crit: [], opt: [] };
      let df = decisionFit(n, C, answers);
      for (let t = 1; t <= max; t++) {
        answer(p, nextQuestion(df, answers, { seed: run + 1, strategy }), answers);
        df = decisionFit(n, C, answers);
        const bi = budgets.indexOf(t);
        if (bi >= 0) { const o = overallOrder(df); acc[bi].sp += spearman(o, p.truth); acc[bi].best += o[0] === p.truth[0] ? 1 : 0; }
      }
    }
    const row = { kind: "budget", n, C, spread, strategy, runs: RUNS, budgets, spearman: acc.map((a) => +(a.sp / RUNS).toFixed(3)), bestRight: acc.map((a) => a.best) };
    rows.push(row); console.log(JSON.stringify(row));
  }
  // Stop rule (adaptive picker), checking every answer as the page does.
  let picks = 0, conf = 0, sp = 0, atCap = 0, best = 0;
  for (let run = 0; run < RUNS; run++) {
    const p = person(n, C, spread, 1000 + run);
    const answers = { crit: [], opt: [] };
    let df = decisionFit(n, C, answers), table = decisionTable(df, { draws: 400 });
    while (!decisionDone(table, answers) && answers.crit.length + answers.opt.length < max) {
      answer(p, nextQuestion(df, answers, { seed: run + 1 }), answers);
      df = decisionFit(n, C, answers);
      table = decisionTable(df, { draws: 400 });
    }
    const t = answers.crit.length + answers.opt.length;
    picks += t; conf += table.confidence; atCap += decisionDone(table, answers) ? 0 : 1;
    const o = overallOrder(df); sp += spearman(o, p.truth); best += o[0] === p.truth[0] ? 1 : 0;
  }
  const row = { kind: "stop", n, C, spread, runs: RUNS, max, picks: +(picks / RUNS).toFixed(1), confidence: +(conf / RUNS).toFixed(3), trueSpearman: +(sp / RUNS).toFixed(3), bestRight: best, atCap };
  rows.push(row); console.log(JSON.stringify(row));
}
if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

// node scripts/decide-graded-sim.mjs --config ordinal [--tau-true 2] [--runs 24] [--case 0..4] > rows.jsonl
//
// Graded answers on site/decide.html ("a bit better" / "much better"),
// measured on scripts/decide-sim.mjs's simulated people (same person model,
// seeds 1000+, cases and adaptive winner-focus picker).
//
// Answer model: the person feels z = d - logit(u), u uniform, with d the true
// difference (criterion logits, or option scores on that criterion). They
// pick A when z > 0, which is exactly decide-sim.mjs's Bradley-Terry draw on
// the same u (so the pick is unchanged and only the grade is new), and say
// "much" when |z| > tau_true, else "a bit". `--tau-true spread` draws a fresh
// tau_true uniformly in [0.5, 4] for every answer: a person who uses "much"
// inconsistently.
//
// --config says how the page reads the grades:
//   ignore   every pick as one plain win (today's page, the baseline)
//   double   a "much" pick as two plain wins (the cheap reading)
//   ordinal  the cumulative-logit fit in site/graded-fit.mjs at --tau-model
//            (a number, default GRADED_TAU = 2, or auto: the person's own tau,
//            estimateTau, refitted after every answer as the page does)
// --grade both|opt grades every question, or only the option questions.
//
// Each person answers to decisionMax. Rows record, at a quarter, half and all
// of the cap, the shown order's Spearman with the true order and whether the
// shown best is the true best; and where the winner stop (decisionDone, page
// defaults) would have ended: picks, the shown best, and its true shortfall.
import { decisionFit, nextQuestion, decisionTable, decisionDone, decisionDoneGraded, decisionMax, overallOrder, GRADED_TAU, BIT, MUCH } from "../site/decide-core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const RUNS = Number(args.runs || 24);
const CONFIG = args.config || "ordinal";
const TAU_TRUE = args["tau-true"] || "2";
const TAU_MODEL = args["tau-model"] === "auto" ? "auto" : Number(args["tau-model"] || GRADED_TAU);
const GRADE = args.grade || "both";
const GUARD = args.guard ? (args.guard === "auto" ? "auto" : Number(args.guard)) : null; // --guard <tau>|auto: stop through decisionDoneGraded (auto: min(1, the person's estimateTau), the page)
if (!["ignore", "double", "ordinal"].includes(CONFIG)) throw new Error("--config ignore|double|ordinal");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

// The same person as scripts/decide-sim.mjs, plus a second stream for tau_true draws.
function person(n, C, spread, seed) {
  const r = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const s = Array.from({ length: C }, g);
  const x = Array.from({ length: C }, () => Array.from({ length: n }, () => (g() * spread) / 4));
  const w = softmax(s);
  const total = Array.from({ length: n }, (_, i) => x.reduce((a, xc, c) => a + w[c] * (xc[i] - xc.reduce((p, q) => p + q, 0) / n), 0));
  const truth = total.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  return { s, x, total, truth, rand: r, tauRand: mulberry32(seed ^ 0x7a0) };
}
function answer(p, q, answers) {
  const [a, b] = q.pair;
  const d = q.kind === "crit" ? p.s[a] - p.s[b] : p.x[q.c][a] - p.x[q.c][b];
  const u = Math.min(Math.max(p.rand(), 1e-12), 1 - 1e-12);
  const z = d - Math.log(u / (1 - u));
  const [w, l] = z > 0 ? [a, b] : [b, a];
  const tau = TAU_TRUE === "spread" ? 0.5 + 3.5 * p.tauRand() : Number(TAU_TRUE);
  const graded = GRADE === "both" || q.kind === "opt";
  const g = graded ? (Math.abs(z) > tau ? MUCH : BIT) : undefined;
  if (q.kind === "crit") answers.crit.push(g ? [w, l, false, g] : [w, l, false]);
  else answers.opt.push(g ? [q.c, w, l, false, g] : [q.c, w, l, false]);
  answers.lastKind = q.kind;
}
function spearman(shown, truth) {
  const n = shown.length, rs = new Array(n), rt = new Array(n);
  shown.forEach((it, k) => (rs[it] = k)); truth.forEach((it, k) => (rt[it] = k));
  let d2 = 0; for (let i = 0; i < n; i++) d2 += (rs[i] - rt[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const cases = [
  { n: 5, C: 3, spread: 6 }, { n: 5, C: 3, spread: 3 },
  { n: 8, C: 4, spread: 6 }, { n: 8, C: 4, spread: 3 },
  { n: 12, C: 5, spread: 6 },
];
const fitOptions = { grades: CONFIG, tau: TAU_MODEL };
const pick = args.case !== undefined ? [cases[Number(args.case)]] : cases;
for (const { n, C, spread } of pick) {
  const max = decisionMax(n, C);
  const budgets = [Math.round(max / 4), Math.round(max / 2), max];
  for (let run = 0; run < RUNS; run++) {
    const p = person(n, C, spread, 1000 + run);
    const answers = { crit: [], opt: [] };
    let df = decisionFit(n, C, answers, fitOptions);
    let stop = null, much = 0, graded = 0;
    const at = [];
    for (let t = 0; t <= max; t++) {
      if (!stop) {
        const table = decisionTable(df, { draws: 400 });
        const done = GUARD ? decisionDoneGraded(n, C, answers, table, { guardTau: GUARD }).done : decisionDone(table, answers);
        if (done || t === max) {
          const shown = overallOrder(df)[0];
          stop = { picks: t, atCap: !done, bestRight: shown === p.truth[0] ? 1 : 0, shortfall: +(p.total[p.truth[0]] - p.total[shown]).toFixed(4), safe: +table.safe.toFixed(3) };
        }
      }
      if (budgets.includes(t)) { const o = overallOrder(df); at.push({ t, spearman: +spearman(o, p.truth).toFixed(4), bestRight: o[0] === p.truth[0] ? 1 : 0 }); }
      if (t === max) break;
      answer(p, nextQuestion(df, answers, { seed: run + 1 }), answers);
      const last = answers.lastKind === "crit" ? answers.crit.at(-1)[3] : answers.opt.at(-1)[4];
      if (last) { graded++; if (last === MUCH) much++; }
      df = decisionFit(n, C, answers, fitOptions);
    }
    console.log(JSON.stringify({ n, C, spread, run, seed: 1000 + run, config: CONFIG, tauTrue: TAU_TRUE, tauModel: TAU_MODEL, grade: GRADE, guard: GUARD, max, muchShare: graded ? +(much / graded).toFixed(3) : null, tauFitted: typeof df.tau === "number" ? +df.tau.toFixed(3) : null, at, stop }));
  }
}

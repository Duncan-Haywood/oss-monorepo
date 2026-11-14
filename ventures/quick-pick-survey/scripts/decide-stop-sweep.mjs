// node scripts/decide-stop-sweep.mjs [--runs 12] [--case 0..4] > rows.jsonl
//
// The decide page's stop rule on scripts/decide-sim.mjs's simulated people
// (same person model, seeds and adaptive picker): each person answers up to
// decisionMax, and at every answer the script records whether each rule
// would have stopped there:
//   - "order": the whole order STOP_CONFIDENCE settled (the first rule);
// The picker's focus is --focus winner (default) or order (the first picker).
//   - "winner@m": that, or under a 1 - STOP_CONFIDENCE chance that any
//     option beats the leader by more than m on the overall score.
// At each rule's stop: picks, whether the shown best is the true best, the
// true shortfall of the shown best (true best's score minus its score), and
// the stop read (`safe`) for calibration against "shortfall <= m".
import { decisionFit, nextQuestion, decisionTable, decisionDone, decisionMax, overallOrder } from "../site/decide-core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const RUNS = Number(args.runs || 12);
const MARGINS = [0.15, 0.25, 0.4];
const FOCUS = args.focus || "winner";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

// The same person and answer model as scripts/decide-sim.mjs.
function person(n, C, spread, seed) {
  const r = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const s = Array.from({ length: C }, g);
  const x = Array.from({ length: C }, () => Array.from({ length: n }, () => (g() * spread) / 4));
  const w = softmax(s);
  const total = Array.from({ length: n }, (_, i) => x.reduce((a, xc, c) => a + w[c] * (xc[i] - xc.reduce((p, q) => p + q, 0) / n), 0));
  const truth = total.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  return { s, x, total, truth, rand: r };
}
function answer(p, q, answers) {
  const [a, b] = q.pair;
  const d = q.kind === "crit" ? p.s[a] - p.s[b] : p.x[q.c][a] - p.x[q.c][b];
  const [w, l] = p.rand() < 1 / (1 + Math.exp(-d)) ? [a, b] : [b, a];
  if (q.kind === "crit") answers.crit.push([w, l, false]); else answers.opt.push([q.c, w, l, false]);
  answers.lastKind = q.kind;
}

const cases = [
  { n: 5, C: 3, spread: 6 }, { n: 5, C: 3, spread: 3 },
  { n: 8, C: 4, spread: 6 }, { n: 8, C: 4, spread: 3 },
  { n: 12, C: 5, spread: 6 },
];
const pick = args.case !== undefined ? [cases[Number(args.case)]] : cases;
for (const { n, C, spread } of pick) {
  const max = decisionMax(n, C);
  for (let run = 0; run < RUNS; run++) {
    const p = person(n, C, spread, 1000 + run);
    const answers = { crit: [], opt: [] };
    const stops = {};
    const rules = ["order", ...MARGINS.map((m) => `winner@${m}`)];
    let df = decisionFit(n, C, answers);
    for (let t = 0; ; t++) {
      const open = rules.filter((r) => !stops[r]);
      if (!open.length) break;
      const tables = {};
      for (const r of open) {
        const m = r === "order" ? 0.25 : Number(r.split("@")[1]);
        tables[r] = decisionTable(df, { draws: 400, margin: m });
        const done = decisionDone(tables[r], answers, { rule: r === "order" ? "order" : "winner" });
        if (done || t >= max) {
          const shown = overallOrder(df)[0];
          stops[r] = { picks: t, atCap: !done, bestRight: shown === p.truth[0] ? 1 : 0, shortfall: +(p.total[p.truth[0]] - p.total[shown]).toFixed(4), safe: +tables[r].safe.toFixed(3), confidence: +tables[r].confidence.toFixed(3), margin: m };
        }
      }
      if (t >= max) break;
      answer(p, nextQuestion(df, answers, { seed: run + 1, focus: FOCUS }), answers);
      df = decisionFit(n, C, answers);
    }
    console.log(JSON.stringify({ n, C, spread, run, seed: 1000 + run, focus: FOCUS, max, stops }));
  }
}

// node scripts/decide-cap-sweep.mjs [--tau-true 2|1|spread] [--long-run none|level|tau] [--power 1] [--runs 60] [--case 0..4] [--scales 1,1.5,2,3] [--focus winner|order] > rows.jsonl
//
// How large should site/decide.html's question cap be? (docs/DECIDE-PAGE.md,
// "A larger cap".) The page as shipped (graded answers read at GRADED_TAU,
// the guarded winner stop with the person's own tau, the winner-focus picker)
// on scripts/decide-graded-sim.mjs's simulated people: same person and answer
// model, cases and seeds 1000+.
//
// The picker never looks at the cap, so one walk to the largest cap gives the
// run under every smaller one: for each scale s the stop is the first answer
// count where decisionDoneGraded passes, or ceil(s * decisionMax(n, C)).
// At each cap's stop: picks, whether it hit the cap, whether the shown best
// is the true best, the shown best's true shortfall, the stop read (`safe`),
// and the whole order's Spearman with the truth.
import { decisionFit, nextQuestion, decisionTable, decisionDoneGraded, decisionMax, overallOrder, BIT, MUCH } from "../site/decide-core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const RUNS = Number(args.runs || 60);
const TAU_TRUE = args["tau-true"] || "2";
const SCALES = (args.scales || "1,1.5,2,3").split(",").map(Number);
const FOCUS = args.focus || "winner";
// "Rank them all" (--focus order) pairs the order picker with the order stop, as the page does.
const RULE = FOCUS === "order" ? "order" : "winner";
// --long-run none|level|tau [--power p]: the stop past the checkpoint (site/decide-core.mjs longRunLevel; none = the page on 2026-11-15).
const LONG_RUN = args["long-run"] || "none";
const POWER = Number(args.power || 1);
// --guard auto|plain|switch|<tau> [--guard-scale k] [--switch-below t]: the graded guard (auto = min(1, k x estimateTau), the page).
const GUARD = !args.guard || ["auto", "plain", "switch"].includes(args.guard) ? (args.guard || "auto") : Number(args.guard);
const GUARD_SCALE = Number(args["guard-scale"] || 1);
// --switch-below t: with --guard switch, the plain guard runs when estimateTau < t (site/decide-core.mjs PLAIN_GUARD_BELOW).
const SWITCH_BELOW = Number(args["switch-below"] || 1.25);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };

// The same person and answer model as scripts/decide-graded-sim.mjs (grades on every question).
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
  const g = Math.abs(z) > tau ? MUCH : BIT;
  if (q.kind === "crit") answers.crit.push([w, l, false, g]); else answers.opt.push([q.c, w, l, false, g]);
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
const pick = args.case !== undefined ? [cases[Number(args.case)]] : cases;
for (const { n, C, spread } of pick) {
  const base = decisionMax(n, C);
  const caps = SCALES.map((s) => Math.ceil(s * base));
  const max = Math.max(...caps);
  for (let run = 0; run < RUNS; run++) {
    const p = person(n, C, spread, 1000 + run);
    const answers = { crit: [], opt: [] };
    let df = decisionFit(n, C, answers);
    let selfStop = null;
    const stops = {};
    const snap = (t, done, table) => {
      const o = overallOrder(df);
      return { picks: t, atCap: !done, bestRight: o[0] === p.truth[0] ? 1 : 0, shortfall: +(p.total[p.truth[0]] - p.total[o[0]]).toFixed(4), safe: +table.safe.toFixed(3), spearman: +spearman(o, p.truth).toFixed(4) };
    };
    for (let t = 0; t <= max; t++) {
      const table = decisionTable(df, { draws: 400 });
      const done = decisionDoneGraded(n, C, answers, table, { rule: RULE, longRun: LONG_RUN, power: POWER, guardTau: GUARD, guardScale: GUARD_SCALE, switchBelow: SWITCH_BELOW }).done;
      if (done) { selfStop = snap(t, true, table); break; }
      caps.forEach((cap, k) => { if (t === cap) stops[SCALES[k]] = snap(t, false, table); });
      if (t === max) break;
      answer(p, nextQuestion(df, answers, { seed: run + 1, focus: FOCUS }), answers);
      df = decisionFit(n, C, answers);
    }
    // A run that stopped on its own before a cap has that stop under the cap.
    SCALES.forEach((s) => { if (!stops[s]) stops[s] = selfStop; });
    console.log(JSON.stringify({ n, C, spread, run, seed: 1000 + run, tauTrue: TAU_TRUE, focus: FOCUS, rule: RULE, longRun: LONG_RUN, power: POWER, guard: GUARD, guardScale: GUARD_SCALE, ...(GUARD === "switch" ? { switchBelow: SWITCH_BELOW } : {}), base, caps, stops }));
  }
}

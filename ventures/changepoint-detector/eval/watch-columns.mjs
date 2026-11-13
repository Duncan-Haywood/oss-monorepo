// Several metrics in one watch (watch.mjs --columns): does splitting the alert budget evenly across the columns keep
// the whole watch near the budget a person asked for, and what does it cost in real, documented changes?
//
// Written before it was run (2026-11-13). Question and rule, fixed here:
//   For each multi-column set, replay the watch on every column with "--detector auto" twice: (A) each column gets the
//   whole budget (2 alerts per 100 daily checks, the default), (B) each gets 2/k. Sum the alerts of the picked settings
//   over the columns, per 100 checks of the watch (one check sends at most one message, so this counts alert lines).
//   Ship the split (B) as the default for --columns if, on the synthetic null cell (k independent noise columns with
//   no change, 20 seeds, k = 5), B's mean whole-watch rate is at or under 2 per 100 checks and A's is above it.
//   Report, not decide: the real sets' rates under A and B, and on the UK seat-belt set whether the 1983-02 law
//   (documented, Harvey & Durbin 1986) is still alerted within 3 months in the columns that alerted on it under A.
// The pick is made on the same history it is scored on (as the page's hint is); this is what a person's own replay
// would say, not a forecast of the next year.
//
//   node eval/watch-columns.mjs > eval/watch-columns.out.txt
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { chooseDetector, replayWatch, HINT_BUDGET } from '../watch-core.mjs';

const here = (f) => new URL(`../data/${f}`, import.meta.url);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());

function watchSet(cols, budgetEach) {
  let alerts = 0, checks = 0; const per = [];
  for (const c of cols) {
    const pick = chooseDetector(c.values, c.labels, { ...c.opts, budget: budgetEach });
    const r = replayWatch(c.values, c.labels, { ...c.opts, detector: pick.detector });
    alerts += r.alerts.length; checks = Math.max(checks, r.n - r.from);
    per.push({ column: c.name, pick: pick.key, alerts: r.alerts.map((a) => a.label) });
  }
  return { alerts, checks, per100: checks ? (100 * alerts) / checks : 0, per };
}

const B = HINT_BUDGET;
const fmt = (x) => x.toFixed(2);
console.log(`Budget ${B} alerts per 100 checks for the whole watch. A: each column gets ${B}. B: each gets ${B}/k.\n`);

// Synthetic null: k = 5 independent N(0,1) columns, 300 points, no change.
const K = 5, N = 300, SEEDS = 20;
let sa = 0, sb = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const cols = Array.from({ length: K }, (_, j) => { const g = gauss(lcg(seed * 101 + j)); const values = Array.from({ length: N }, () => g()); return { name: `c${j}`, values, labels: values.map((_, i) => String(i + 1)), opts: {} }; });
  const a = watchSet(cols, B), b = watchSet(cols, B / K);
  sa += a.per100; sb += b.per100;
}
const nullA = sa / SEEDS, nullB = sb / SEEDS;
console.log(`Synthetic null, k=${K} independent N(0,1) columns, ${N} points, ${SEEDS} seeds: whole-watch alerts per 100 checks A ${fmt(nullA)}, B ${fmt(nullB)}`);
console.log(`Rule (B <= ${B} and A > ${B}): ${nullB <= B && nullA > B ? 'PASS, the split ships as the --columns default' : 'FAIL'}\n`);

const SETS = [
  { file: 'uk-road-casualties.csv', cols: ['DriversKilled', 'drivers', 'front', 'rear', 'VanKilled'], opts: { period: 12 }, law: '1983-02' },
  { file: 'bike-sharing-daily.csv', cols: ['casual', 'registered'], opts: { model: 'poisson', period: 7 } },
  { file: 'german-unemployment.csv', cols: ['unadjusted', 'adjusted'], opts: {} },
  { file: 'frozen-juice.csv', cols: ['price', 'ppi'], opts: { log: true } },
];
for (const s of SETS) {
  const csv = readFileSync(here(s.file), 'utf8');
  const cols = s.cols.map((name) => { const { values, labels } = parseSeries(csv, name, null); return { name, values, labels, opts: s.opts }; });
  const a = watchSet(cols, B), b = watchSet(cols, B / cols.length);
  console.log(`${s.file} (${cols.length} columns, ${cols[0].values.length} points, ${JSON.stringify(s.opts)}): A ${fmt(a.per100)} (${a.alerts} alerts), B ${fmt(b.per100)} (${b.alerts} alerts) per 100 checks`);
  for (let j = 0; j < cols.length; j++) console.log(`  ${cols[j].name}: A ${a.per[j].pick} [${a.per[j].alerts.join(' ')}]  B ${b.per[j].pick} [${b.per[j].alerts.join(' ')}]`);
  if (s.law) {
    const near = (labs) => labs.some((l) => { const [y, m] = l.split('-').map(Number), [Y, M] = s.law.split('-').map(Number); const d = (y - Y) * 12 + (m - M); return d >= -3 && d <= 3; });
    const inA = a.per.filter((p) => near(p.alerts)).map((p) => p.column), inB = b.per.filter((p) => near(p.alerts)).map((p) => p.column);
    console.log(`  ${s.law} law alerted within 3 months: A in [${inA.join(', ')}], B in [${inB.join(', ')}]`);
  }
  console.log('');
}

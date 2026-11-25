// Should a published composite fed in as one column take 3-month phases? A pre-registered round on a make not
// seen before: Japan's Cabinet Office coincident composite index (CI, 景気動向指数 一致指数), against the Cabinet
// Office's own reference dates (ESRI 景気基準日付), 1985-2026, with an older copy of the index as a vintage.
//
// Open item from README "A second make": on the Philadelphia Fed's US index the one-column default (6-month
// phases) missed the 1980 recession, and 3-month phases (the composite default, `COMPOSITE_MIN_PHASE`) dated it
// with no false turn. That was a look after the result. This round asks it beforehand, on another maker's index.
// What this session could reach set the make: esri.cao.go.jp, e-stat.go.jp, conference-board.org, cepr.org,
// eabcn.org, dbnomics and OECD's SDMX all refused its proxy (2026-11-24); raw.githubusercontent.com answers.
// GitHub code search found two public copies of the Cabinet Office's CI (one through 2026-08, one through 2024-07,
// re-estimated between them) and two independent public transcriptions of ESRI's monthly reference dates that
// agree on every date (data/SOURCE.md, "Japan CI").
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: each copy's
// first and last rows, that both are contiguous monthly runs from 1985-01 with no missing value, and the median
// difference of their monthly growth (0.105 points). BBQ has not been run on either copy. Not seen: any turn, any
// phase, any plot of the index.
//
// Labels: ESRI's peaks and troughs inside 1985-01..2026-08 at indices 1..n-2: peaks 1985-06, 1991-02, 1997-05,
// 2000-11, 2008-02, 2012-03, 2018-10; troughs 1986-11, 1993-10, 1999-01, 2002-01, 2009-03, 2012-11, 2020-05 (14
// turns). ESRI dates no turn after the 2020-05 trough in either transcription, and it rules on a turn a year or more
// after it, so a dated turn after 2023-12 is printed and not counted as false (FALSE_UNTIL).
//
// Arms, both the shipped path turnsResult({ csv, column: 'ci_coincident', ... }) from turns-cli.mjs (one column,
// monthly, window 5, cycles 15, bigMove 0.05, logged):
//   A6: the one-column default (phases 6);
//   A3: minPhase 3 (the composite default).
// Scoring as eval/turns-usphci.mjs: matched when a dated turn of the same kind is within 3 months of ESRI's; false
// when no ESRI turn of its kind is within 6 (counted to FALSE_UNTIL); F1 kind-blind at margin 6; random = k uniform
// cuts at the arm's count, 5,000 draws, seed 20261124.
//
// Expectation written down beforehand: every ESRI contraction since 1985 lasted 8 months or more (2012-03 to
// 2012-11 is the shortest), so A6 should date them all and A3 has little to add; A3 may instead add turns ESRI did
// not date (ESRI's list has none around the March 2011 earthquake or the April 2014 consumption-tax rise). If so
// the 1980 gain on USPHCI was one short recession, not a reason to change anything.
//
// Bars:
//   J1 A3 on its own: matched >= 12 of 14 (0.80 rounded up) and at most 2 false turns;
//   J2 A3 better than A6: A3 matches at least 1 more turn than A6, has at most 1 more false turn, and its F1 is no
//      lower;
//   J3 A3 beyond chance: F1 - random mean F1 >= +0.15 with p <= 0.05;
//   J4 A3 on the vintage: every turn A3 matches on the main copy is matched on the 2024-07 copy, and no dated month
//      of a matched turn moves by more than 3 months between the two.
// What it decides: a column cannot be recognised as a published composite, so no default changes in any case. If
// J1-J4 all pass, the `--turns` trust note (turns-cli.mjs, the page's static note in index.html, and llms.txt) adds
// that for a published composite fed in as one column, `--min-phase 3` dated N of ESRI's 14 turns on Japan's CI
// and 10 of NBER's 12 on the Philadelphia Fed's index. If any bar fails, nothing in the CLI, page or llms.txt
// changes, and the README says what each arm dated.
// Printed, no bar: both arms per ESRI turn and per copy; minPhase 4 and 5; bigMove off at phases 6; dated turns
// after FALSE_UNTIL.
//
// usage: node eval/turns-jp-ci.mjs > eval/turns-jp-ci.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { turnsResult } from '../turns-cli.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance } from './turns-iran.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DRAWS = 5000, SEED = 20261124, NEAR = 3, FAR = 6, MARGIN = 6;
export const FALSE_UNTIL = '2023-12';
export const MAIN = 'jp-ci-coincident.csv';
export const VINTAGE = 'jp-ci-coincident-vintage-2024-07.csv';
export const COLUMN = 'ci_coincident';
// ESRI reference dates (景気基準日付), cycles 10-16 (data/SOURCE.md, "Japan CI")
export const ESRI = [
  ['peak', '1985-06'], ['trough', '1986-11'], ['peak', '1991-02'], ['trough', '1993-10'],
  ['peak', '1997-05'], ['trough', '1999-01'], ['peak', '2000-11'], ['trough', '2002-01'],
  ['peak', '2008-02'], ['trough', '2009-03'], ['peak', '2012-03'], ['trough', '2012-11'],
  ['peak', '2018-10'], ['trough', '2020-05'],
];

const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;

export function load(file) {
  const csv = readFileSync(join(ROOT, 'data', file), 'utf8');
  const label = csv.trim().split('\n').slice(1).map((l) => l.split(',')[0]);
  const n = label.length;
  const turns = ESRI.map(([kind, month]) => ({ kind, month, i: label.indexOf(month) })).filter((t) => t.i >= 1 && t.i <= n - 2);
  return { file, csv, label, n, turns, until: label.indexOf(FALSE_UNTIL) };
}

function nearest(found, t) {
  const d = found.filter((f) => f.kind === t.kind).map((f) => f.i - t.i).sort((a, b) => Math.abs(a) - Math.abs(b));
  return d.length ? d[0] : null;
}

export function score(s, opts = {}, draws = DRAWS) {
  const r = turnsResult({ csv: s.csv, column: COLUMN, ...opts });
  const found = r.turns.map((t) => ({ kind: t.kind, i: t.index, label: t.label }));
  const ann = { esri: [...new Set(s.turns.map((t) => t.i))].sort((a, b) => a - b) };
  const F = fMeasure(ann, found.map((f) => f.i), MARGIN).F;
  const R = draws ? chance(s.n, found.length, ann, MARGIN, F, draws, SEED) : null;
  const per = s.turns.map((t) => { const d = nearest(found, t); return { month: t.month, kind: t.kind, off: d, matched: d !== null && Math.abs(d) <= NEAR }; });
  const matched = per.filter((p) => p.matched).length;
  const cut = s.until >= 0 ? s.until : s.n - 1;
  const unlabelled = found.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= FAR));
  const falseLabels = unlabelled.filter((f) => f.i <= cut).map((f) => `${f.label}${f.kind[0]}`);
  const after = unlabelled.filter((f) => f.i > cut).map((f) => `${f.label}${f.kind[0]}`);
  return { found, F, R, per, matched, falses: falseLabels.length, falseLabels, after, minPhase: r.minPhase };
}

export function run({ draws = DRAWS } = {}) {
  const main = load(MAIN), vint = load(VINTAGE);
  const A6 = score(main, {}, draws), A3 = score(main, { minPhase: 3 }, draws);
  const V6 = score(vint, {}, 0), V3 = score(vint, { minPhase: 3 }, 0);
  const J1 = A3.matched >= 12 && A3.falses <= 2;
  const J2 = A3.matched - A6.matched >= 1 && A3.falses - A6.falses <= 1 && A3.F >= A6.F - 1e-12;
  const J3 = A3.R.mean !== undefined && A3.F - A3.R.mean >= 0.15 && A3.R.p <= 0.05;
  const j4rows = A3.per.filter((p) => p.matched).map((p) => {
    const v = V3.per.find((q) => q.month === p.month);
    return { month: p.month, inVintage: !!(v && v.matched), spread: v && v.off !== null ? Math.abs(v.off - p.off) : null };
  });
  const J4 = j4rows.every((r) => r.inVintage && r.spread !== null && r.spread <= NEAR);
  const side = {
    phase4: score(main, { minPhase: 4 }, 0),
    phase5: score(main, { minPhase: 5 }, 0),
    phase6BigMoveOff: score(main, { bigMove: 'off' }, 0),
  };
  const decision = J1 && J2 && J3 && J4 ? 'trust note adds --min-phase 3 for a published composite' : 'nothing changes';
  return { main, vint, A6, A3, V6, V3, J1, J2, J3, J4, j4rows, side, decision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const lab = o.main.label;
  const dated = (a) => a.found.map((f) => `${f.label}${f.kind[0]}`).join(' ') || '-';
  console.log("3-month phases for a published composite: Japan's Cabinet Office coincident CI vs ESRI's reference dates");
  console.log(`\nmain file ${MAIN}: n ${o.main.n} (${lab[0]} to ${lab[o.main.n - 1]}); vintage ${VINTAGE}: n ${o.vint.n}`);
  console.log(`ESRI turns scored: ${o.main.turns.length}: ${o.main.turns.map((t) => `${t.month}${t.kind[0]}`).join(' ')}; false turns counted to ${FALSE_UNTIL}`);
  console.log('\nDated turns:');
  for (const [k, a] of [['A6 main', o.A6], ['A3 main', o.A3], ['A6 vintage', o.V6], ['A3 vintage', o.V3]]) console.log(`  ${k.padEnd(11)} ${dated(a)}`);
  console.log('\nPer ESRI turn, months from ESRI to the nearest dated turn of its kind (+ late, - early; * outside 3):');
  const cols = [['A6', o.A6], ['A3', o.A3], ['A6 v24', o.V6], ['A3 v24', o.V3]];
  console.log(`  ${'turn'.padEnd(10)}${cols.map(([k]) => k.padStart(9)).join('')}`);
  for (const t of o.main.turns) {
    const cells = cols.map(([, a]) => { const p = a.per.find((q) => q.month === t.month); if (!p) return '-'; return p.off === null ? 'none' : `${p.off >= 0 ? '+' : ''}${p.off}${p.matched ? '' : '*'}`; });
    console.log(`  ${(t.month + t.kind[0]).padEnd(10)}${cells.map((c) => c.padStart(9)).join('')}`);
  }
  console.log('\nPer arm: matched, false turns to 2023-12 (labels), turns after it, F1:');
  for (const [k, a] of cols) console.log(`  ${k.padEnd(7)} ${a.matched} of ${a.per.length}, false ${a.falses} (${a.falseLabels.join(' ') || '-'}), after ${a.after.join(' ') || '-'}, F1 ${r3(a.F)}${a.R ? `, random ${r3(a.R.mean)} p ${a.R.p.toFixed(4)}` : ''}`);
  console.log('\nBars:');
  console.log(`  J1 A3 matched ${o.A3.matched}/14 (>= 12) and false ${o.A3.falses} (<= 2): ${o.J1 ? 'PASS' : 'FAIL'}`);
  console.log(`  J2 A3 - A6: matched ${o.A3.matched - o.A6.matched >= 0 ? '+' : ''}${o.A3.matched - o.A6.matched} (>= +1), false ${o.A3.falses - o.A6.falses >= 0 ? '+' : ''}${o.A3.falses - o.A6.falses} (<= +1), F1 ${r3(o.A3.F)} vs ${r3(o.A6.F)} (no lower): ${o.J2 ? 'PASS' : 'FAIL'}`);
  console.log(`  J3 A3 F1 ${r3(o.A3.F)} vs random ${r3(o.A3.R.mean)} (${sg(o.A3.F - o.A3.R.mean)}, >= +0.15), p ${o.A3.R.p.toFixed(4)} (<= 0.05): ${o.J3 ? 'PASS' : 'FAIL'}`);
  console.log(`  J4 A3's matched turns on the 2024-07 copy, moving <= 3: ${o.j4rows.map((r) => `${r.month} ${r.inVintage ? 'yes' : 'NO'} ${r.spread}`).join('; ')}: ${o.J4 ? 'PASS' : 'FAIL'}`);
  console.log(`\nDecision: ${o.decision}`);
  console.log('\nPrinted, no bar (main file):');
  for (const [k, a] of Object.entries(o.side)) console.log(`  ${k}: matched ${a.matched}/${a.per.length}, false ${a.falses} (${a.falseLabels.join(' ') || '-'}), after ${a.after.join(' ') || '-'}, F1 ${r3(a.F)}; dated ${dated(a)}`);
}

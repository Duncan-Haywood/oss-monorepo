// A second make: the shipped one-column `--turns` default on the Philadelphia Fed's US coincident index (USPHCI),
// against NBER's monthly peaks and troughs, 1979-2026, with four older copies of the index as vintages.
//
// Open item from README "A tolerant call rule on real vintages" (and "Composite weights set in real time"): "a
// second make (a state coincident index against its state's dated recessions)". What this session could reach
// decided the shape: raw.githubusercontent.com answers and stlouisfed.org and philadelphiafed.org do not, and no
// public file of dated state recessions was found (GitHub code search for Owyang-Piger-Wall or Hamilton-Owyang
// dates, "state recession dates", FRED-SD; 2026-11-24). Five public copies of USPHCI were found, downloaded on
// different dates, and one of California's (CAPHCI). So the scored make is the national index of the same maker
// and method as the state indexes (Crone and Clayton-Matthews' dynamic factor model of payroll employment, the
// unemployment rate, manufacturing hours and real wage and salary disbursements, re-estimated each month, so
// history revises): a composite we did not build, with NBER's dates as the labels. The state index is printed
// with no bar, because no dated state recessions are in reach to score it against.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: each copy's
// first and last rows and that every copy is a contiguous monthly run from 1979-01 (data/SOURCE.md, "USPHCI").
// BBQ has not been run on any copy. Not seen: any turn, any phase.
//
// Labels: NBER's monthly turns read off USREC (eval/turns-payems.mjs usrecTurns), only those at indices 1..n-2 of
// the main file: peaks 1980-01, 1981-07, 1990-07, 2001-03, 2007-12, 2020-02; troughs 1980-07, 1982-11, 1991-03,
// 2001-11, 2009-06, 2020-04 (12 turns).
//
// Arm S, the shipped path exactly: turnsResult({ csv, column: 'usphci' }) from turns-cli.mjs (one column, monthly,
// window 5, phases 6, cycles 15, bigMove 0.05, logged). Scoring as eval/turns-payems.mjs: matched when a dated
// turn of the same kind is within 3 months; false when no NBER turn of its kind is within 6; F1 kind-blind at
// margin 6; random = k uniform cuts at the arm's count, 5,000 draws, seed 20261124.
//
// Expectation written down beforehand: the index leans on payrolls and the unemployment rate, so the troughs
// after jobless recoveries (1991-03, 2001-11) may be dated late, as payrolls as published dated 2001's trough in
// 2003 ("A tolerant call rule on real vintages"); the 1980 and 1981-82 recessions and 2020 should be found.
//
// Bars:
//   U1 matched share of the 12 >= 0.80 (10 of 12) and at most 2 false turns (the P1 bar of the payroll round);
//   U2 F1 - random mean F1 >= +0.15 with p <= 0.05;
//   U3 vintages: every NBER turn U1 matches on the main file (ending 2026-07) is matched on each of the four older
//      copies (ending 2021-12, 2023-05, 2023-10, 2024-10), and no dated month of a matched turn moves by more than
//      3 months between any two of the five.
// What it decides: if U1-U3 pass, the `--turns` trust note (turns-cli.mjs, and the page's static note in
// index.html, and llms.txt) adds that on the Philadelphia Fed's US coincident index, another maker's composite,
// the one-column default dated N of NBER's 12 turns since 1979 within 3 months, on five copies. If any bar fails,
// nothing in the CLI or page changes and the README says which turns it missed and by how much.
// Printed, no bar: every dated turn beside NBER's, per copy; how far each missed turn's nearest same-kind turn
// is; the same rule with bigMove off and with 3-month phases; California's index (CAPHCI, copy to 2023-10) dated
// beside NBER's national turns, with how many months it leads or lags each (no state dating to score it with).
//
// usage: node eval/turns-usphci.mjs > eval/turns-usphci.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { turnsResult } from '../turns-cli.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance } from './turns-iran.mjs';
import { match } from './turns-bbq.mjs';
import { usrecTurns } from './turns-payems.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DRAWS = 5000, SEED = 20261124, NEAR = 3, FAR = 6, MARGIN = 6;
export const MAIN = 'us-usphci.csv';
export const VINTAGES = ['us-usphci-vintage-2021-12.csv', 'us-usphci-vintage-2023-05.csv', 'us-usphci-vintage-2023-10.csv', 'us-usphci-vintage-2024-10.csv'];
export const STATE = { file: 'ca-caphci-vintage-2023-10.csv', column: 'caphci' };

const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;

export function load(file, column = 'usphci') {
  const csv = readFileSync(join(ROOT, 'data', file), 'utf8');
  const label = csv.trim().split('\n').slice(1).map((l) => l.split(',')[0]);
  const n = label.length;
  const turns = usrecTurns().map((t) => ({ kind: t.kind, month: t.month, i: label.indexOf(t.month) })).filter((t) => t.i >= 1 && t.i <= n - 2);
  return { csv, column, label, n, turns };
}

// nearest dated turn of the kind, as months from NBER's (negative = early)
function nearest(found, t) {
  const d = found.filter((f) => f.kind === t.kind).map((f) => f.i - t.i).sort((a, b) => Math.abs(a) - Math.abs(b));
  return d.length ? d[0] : null;
}

export function score(s, opts = {}, draws = DRAWS) {
  const r = turnsResult({ csv: s.csv, column: s.column, ...opts });
  const found = r.turns.map((t) => ({ kind: t.kind, i: t.index, label: t.label }));
  const ann = { nber: [...new Set(s.turns.map((t) => t.i))].sort((a, b) => a - b) };
  const F = fMeasure(ann, found.map((f) => f.i), MARGIN).F;
  const R = draws ? chance(s.n, found.length, ann, MARGIN, F, draws, SEED) : null;
  const m = match(s.turns, found, NEAR, FAR);
  const per = s.turns.map((t) => { const d = nearest(found, t); return { month: t.month, kind: t.kind, off: d, matched: d !== null && Math.abs(d) <= NEAR }; });
  const falses = found.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= FAR)).map((f) => `${f.label}${f.kind[0]}`);
  const share = m.matched / s.turns.length;
  return { found, F, R, ...m, share, per, falseLabels: falses, U1: share >= 0.80 && m.falses <= 2, U2: R ? F - R.mean >= 0.15 && R.p <= 0.05 : null };
}

export function run({ draws = DRAWS } = {}) {
  const main = load(MAIN);
  const S = score(main, {}, draws);
  const vint = VINTAGES.map((f) => ({ file: f, ...score(load(f), {}, 0) }));
  const all = [{ file: MAIN, ...S }, ...vint];
  // U3: turns matched on the main file stay matched on every older copy, and their dated month moves <= 3
  const keep = S.per.filter((p) => p.matched).map((p) => p.month);
  const u3rows = keep.map((month) => {
    const offs = all.map((a) => a.per.find((p) => p.month === month));
    const inAll = offs.every((p) => p && p.matched);
    const vals = offs.filter((p) => p && p.off !== null).map((p) => p.off);
    return { month, inAll, spread: vals.length ? Math.max(...vals) - Math.min(...vals) : null };
  });
  const U3 = u3rows.every((r) => r.inAll && r.spread !== null && r.spread <= NEAR);
  const side = {
    bigMoveOff: score(main, { bigMove: 'off' }, 0),
    phase3: score(main, { minPhase: 3 }, 0),
  };
  const ca = load(STATE.file, STATE.column);
  const state = score(ca, {}, 0);
  const decision = S.U1 && S.U2 && U3 ? 'trust note adds the second make' : 'nothing changes';
  return { main, S, vint, all, u3rows, U3, side, ca, state, decision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const lab = o.main.label;
  console.log("A second make: shipped one-column `--turns` default on the Philadelphia Fed's US coincident index (USPHCI) vs NBER");
  console.log(`\nmain file ${MAIN}: n ${o.main.n} (${lab[0]} to ${lab[o.main.n - 1]}), NBER turns ${o.main.turns.length}: ${o.main.turns.map((t) => `${t.month}${t.kind[0]}`).join(' ')}`);
  const showRun = (a) => `${a.file}: dated ${a.found.map((f) => `${f.label}${f.kind[0]}`).join(' ')}`;
  console.log('\nDated turns per copy:');
  for (const a of o.all) console.log(`  ${showRun(a)}`);
  console.log('\nPer NBER turn, months from NBER to the nearest dated turn of its kind (+ late, - early; * outside 3):');
  console.log(`  ${'turn'.padEnd(10)}${o.all.map((a) => a.file.replace('us-usphci', '').replace('.csv', '').replace('-vintage-', '') || 'main').map((s) => s.padStart(10)).join('')}`);
  for (const t of o.main.turns) {
    const cells = o.all.map((a) => { const p = a.per.find((q) => q.month === t.month); if (!p) return '-'; return p.off === null ? 'none' : `${p.off >= 0 ? '+' : ''}${p.off}${p.matched ? '' : '*'}`; });
    console.log(`  ${(t.month + t.kind[0]).padEnd(10)}${cells.map((c) => c.padStart(10)).join('')}`);
  }
  console.log('\nPer copy: matched, false turns (labels), F1:');
  for (const a of o.all) console.log(`  ${a.file}: ${a.matched} of ${a.per.length}, false ${a.falses} (${a.falseLabels.join(' ') || '-'}), F1 ${r3(a.F)}`);
  const S = o.S;
  console.log('\nBars (main file):');
  console.log(`  U1 matched ${S.matched}/${o.main.turns.length} = ${r3(S.share)} (>= 0.80) and false ${S.falses} (<= 2): ${S.U1 ? 'PASS' : 'FAIL'}`);
  console.log(`  U2 F1 ${r3(S.F)} vs random ${r3(S.R.mean)} (${sg(S.F - S.R.mean)}, >= +0.15), p ${S.R.p.toFixed(4)} (<= 0.05): ${S.U2 ? 'PASS' : 'FAIL'}`);
  console.log(`  U3 turns matched on main, matched on every copy and moving <= 3 months: ${o.u3rows.map((r) => `${r.month} ${r.inAll ? 'all' : 'NOT all'} spread ${r.spread}`).join('; ')}: ${o.U3 ? 'PASS' : 'FAIL'}`);
  console.log(`\nDecision: ${o.decision}`);
  console.log('\nPrinted, no bar (main file):');
  for (const [k, a] of Object.entries(o.side)) console.log(`  ${k}: matched ${a.matched}/${a.per.length}, false ${a.falses} (${a.falseLabels.join(' ') || '-'}), F1 ${r3(a.F)}; dated ${a.found.map((f) => `${f.label}${f.kind[0]}`).join(' ')}`);
  const st = o.state;
  console.log(`\nCalifornia (${STATE.file}, n ${o.ca.n}, no state dating to score against; NBER's national turns beside it):`);
  console.log(`  dated ${st.found.map((f) => `${f.label}${f.kind[0]}`).join(' ')}`);
  console.log(`  nearest same-kind turn to each NBER turn (months): ${st.per.map((p) => `${p.month}${p.kind[0]} ${p.off === null ? 'none' : (p.off >= 0 ? '+' : '') + p.off}`).join(', ')}`);
  console.log(`  dated turns with no national turn of the kind within 6: ${st.falseLabels.join(' ') || '-'}`);
}

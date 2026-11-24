// A call rule that tolerates a dated month moving, judged on real FRED-MD vintages (README "Turns on real
// vintages", its next item: "a call rule that tolerates a dated month moving (e.g. a turn counts as called once a
// turn of its kind stays within 6 months), judged on these vintages").
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: everything
// printed by eval/turns-vintages.mjs (eval/turns-vintages.out.txt): under the strict rule (a turn of the kind within
// 3 months of NBER's month at every later cut-off) arm V called the 2001-03 peak after 156 months and the 2009-06
// trough after 132 because the vintages of 2002-2014 and 2010-2020 dated them at 2000-11/12 and 2009-10, four
// months off; the 2001-11 trough after 61 months, because on 2004-2006 vintages the 2002-03 soft patch took its
// place. Not seen: any count under a wider window, any placebo.
//
// Data, arms, cut-offs and the composite are exactly eval/turns-vintages.mjs's (replay('V'), replay('P'):
// PAYEMS, W875RX1, INDPRO from 1967-01, vintages 1999-08..2021-10, 2-month lag, sd weights over every month known,
// turningPoints monthly, bigMove 0.05, minPhase 3, the shipped `--turns --columns` monthly defaults).
//
// Rule T6 (candidate): NBER turn t is called at the first cut-off j (with data through t's month) from which every
// later cut-off has a turn of t's kind within WIDE = 6 months of t's month. Delay = cut-off month - t's month.
// Rule S3 (the old strict rule, for comparison): the same with 3 months.
// Six scored NBER turns: peaks 2001-03, 2007-12, 2020-02; troughs 2001-11, 2009-06, 2020-04.
//
// Placebo control, so that a wider window cannot pass by catching anything: the six turns shifted 12 months either
// way, same kind (12 targets), dropping any target later than 2020-08 (data end 2021-08 less 12 months, so a turn
// there could still be dated: drops 2021-02 peak and 2021-04 trough) and any within 6 months of an NBER turn of
// its kind (none): 10 targets. A placebo is "called" under a rule exactly as a real turn is.
//
// Expectation written down beforehand: T6 rescues the 2001 peak and the 2009 trough (their four-month shifts sit
// inside 6), so their delays fall to about P's; the 2001-11 trough may still be late, since the soft patch
// replaced it outright on 2004-2006 vintages rather than shifting it. The 2002-03 placebo peak sits 3 months from
// the 2002-06 false peak, so it is likely called under both rules.
//
// Bars:
//   T1 arm V calls all six under T6;
//   T2 arm V's median delay under T6 is at most 2 months over arm P's under T6, and no turn is called more than 6
//      months later in V than in P (both under T6);
//   T3 arm V under T6 is before NBER's announcement on at least (arm P's count under T6 - 1) of the six;
//   T4 placebos: at most 2 of the 10 called under T6 on arm V, and at most 1 more than under S3 on arm V.
// What it decides: if T1-T4 pass, the `--turns` trust note (CLI, turns-cli.mjs, and the page's static note in
// index.html) adds what the vintages showed: on data as first published, the dated month of a mild turn moved by
// up to the largest shift seen within T6, all six NBER turns since 1999 stayed within 6 months from the T6 call on,
// and so the dated month is to be read as plus or minus that. If any bar fails, nothing in the CLI or page changes
// and the README says by how much the tolerant rule still lags. Printed, no bar: T6 on today's four-component files
// (P4) and under MAD weights; per-turn delays under S3, T4 (a 4-month window), T6 and T9; how far the dated month
// sat from NBER's at the call cut-off and at every later cut-off (largest shift).
//
// usage: node eval/turns-vintages-tolerant.mjs > eval/turns-vintages-tolerant.out.txt
import { pathToFileURL } from 'node:url';
import { replay, NBER } from './turns-vintages.mjs';
import { usrecTurns } from './turns-payems.mjs';
import { ANNOUNCED } from './turns-realtime.mjs';
import { monthIndex, monthLabel } from './fredmd-vintages.mjs';

export const WIDE = 6, STRICT = 3, SHIFT = 12, PLACEBO_LAST = '2020-08';

// call of target {kind, k} under a window: first cut-off from which every later one has a turn of the kind within win
export function call(cuts, t, win) {
  const near = (c) => c.turns.filter((x) => x.kind === t.kind).map((x) => x.k - t.k).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  let j0 = null;
  for (let j = cuts.length - 1; j >= 0 && monthIndex(cuts[j].E) >= t.k; j--) {
    const d = near(cuts[j]);
    if (d !== undefined && Math.abs(d) <= win) j0 = j; else break;
  }
  if (j0 === null) return { callMonth: null, delay: null, offsets: [] };
  const offsets = cuts.slice(j0).map(near);
  return { callMonth: cuts[j0].pub, delay: monthIndex(cuts[j0].pub) - t.k, atCall: offsets[0], maxShift: Math.max(...offsets.map(Math.abs)) };
}

const median = (xs) => { const s = xs.filter((x) => x !== null).sort((a, b) => a - b); if (!s.length) return null; return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function scoreRule(cuts, win) {
  const calls = NBER().map((t) => {
    const c = call(cuts, t, win), ann = ANNOUNCED[t.month] ?? null;
    return { month: t.month, kind: t.kind, ...c, ann, before: ann && c.callMonth ? c.callMonth < ann : null };
  });
  return { calls, called: calls.filter((c) => c.delay !== null).length, median: median(calls.map((c) => c.delay)), before: calls.filter((c) => c.before).length };
}

export function placebos() {
  const all = usrecTurns().map((t) => ({ kind: t.kind, k: monthIndex(t.month) }));
  const out = [];
  for (const t of NBER()) for (const s of [-SHIFT, SHIFT]) {
    const k = t.k + s;
    if (k > monthIndex(PLACEBO_LAST)) continue;
    if (all.some((a) => a.kind === t.kind && Math.abs(a.k - k) <= WIDE)) continue;
    out.push({ kind: t.kind, k, month: monthLabel(k), from: t.month });
  }
  return out;
}

export function run() {
  const rv = replay('V'), rp = replay('P');
  const V = scoreRule(rv, WIDE), P = scoreRule(rp, WIDE);
  const worse = V.calls.map((c, i) => (c.delay ?? Infinity) - (P.calls[i].delay ?? Infinity));
  const pl = placebos().map((t) => ({ ...t, T6: call(rv, t, WIDE).callMonth, S3: call(rv, t, STRICT).callMonth }));
  const plT6 = pl.filter((p) => p.T6).length, plS3 = pl.filter((p) => p.S3).length;
  const T1 = V.called === 6;
  const T2 = V.median !== null && P.median !== null && V.median - P.median <= 2 && worse.every((d) => d <= 6);
  const T3 = V.before >= P.before - 1;
  const T4 = pl.length === 10 && plT6 <= 2 && plT6 - plS3 <= 1;
  return { rv, rp, V, P, worse, pl, plT6, plS3, T1, T2, T3, T4, pass: T1 && T2 && T3 && T4 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run();
  const show = (name, a) => {
    console.log(`\n${name}: ${a.called} of 6 called, median delay ${a.median}, before NBER's announcement on ${a.before} of 6`);
    console.log('  NBER turn  kind    call month  delay  off at call  largest shift after  NBER announced  first?');
    for (const c of a.calls) console.log(`  ${c.month}    ${c.kind.padEnd(6)}  ${String(c.callMonth).padEnd(10)}  ${String(c.delay).padStart(5)}  ${String(c.atCall ?? '-').padStart(11)}  ${String(c.maxShift ?? '-').padStart(19)}  ${String(c.ann ?? '-').padEnd(14)}  ${c.before === null ? '-' : c.before ? 'yes' : 'no'}`);
  };
  console.log('Tolerant call rule T6 (a turn of the kind within 6 months of NBER\'s at every later cut-off) on real FRED-MD');
  console.log('vintages (V) and today\'s files (P): PAYEMS, W875RX1, INDPRO; the shipped monthly composite defaults');
  show('V real vintages, T6', r.V);
  show('P today\'s files, T6', r.P);
  console.log(`\nper-turn delay under T6, V minus P: ${r.V.calls.map((c, i) => `${c.month} ${r.worse[i] >= 0 ? '+' : ''}${r.worse[i]}`).join(', ')}`);
  console.log(`placebos (NBER turns shifted 12 months, same kind), called on V: T6 ${r.plT6}, S3 ${r.plS3} of ${r.pl.length}`);
  for (const p of r.pl) console.log(`  ${p.kind.padEnd(6)} ${p.month} (from ${p.from}): T6 ${p.T6 ?? '-'}, S3 ${p.S3 ?? '-'}`);
  console.log(`T1 all six called on vintages under T6: ${r.T1 ? 'passes' : 'fails'} (${r.V.called})`);
  console.log(`T2 median at most 2 over P's, no turn over 6 later: ${r.T2 ? 'passes' : 'fails'} (${r.V.median} vs ${r.P.median}; worst ${Math.max(...r.worse)})`);
  console.log(`T3 before NBER on at least P's - 1: ${r.T3 ? 'passes' : 'fails'} (${r.V.before} vs ${r.P.before})`);
  console.log(`T4 placebos at most 2 of 10 under T6 and at most S3's + 1: ${r.T4 ? 'passes' : 'fails'} (${r.plT6} vs ${r.plS3})`);
  console.log(`decision: ${r.pass ? 'T1-T4 pass: the --turns trust note adds the revision band' : 'a bar fails: nothing in the CLI or page changes'}`);

  console.log('\n=== printed, no bar ===');
  for (const win of [STRICT, 4, WIDE, 9]) {
    const v = scoreRule(r.rv, win), p = scoreRule(r.rp, win);
    console.log(`window ${win}: V delays ${v.calls.map((c) => c.delay).join(' ')} (median ${v.median}, before ${v.before}) | P delays ${p.calls.map((c) => c.delay).join(' ')} (median ${p.median}, before ${p.before})`);
  }
  const vm = scoreRule(replay('V', { scale: 'mad' }), WIDE), pm = scoreRule(replay('P', { scale: 'mad' }), WIDE);
  console.log(`T6, MAD weights: V delays ${vm.calls.map((c) => c.delay).join(' ')} (median ${vm.median}, before ${vm.before}) | P delays ${pm.calls.map((c) => c.delay).join(' ')} (median ${pm.median})`);
  const p4 = scoreRule(replay('P4'), WIDE);
  console.log(`T6, shipped four-component composite on today's files: delays ${p4.calls.map((c) => c.delay).join(' ')} (median ${p4.median}, before ${p4.before})`);
}

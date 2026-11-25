// Setting the composite's weights in real time: a robust volatility scale instead of a hand-picked `--sd-until`.
//
// Open item from README "Turns called in pseudo-real time under P3": "the open question this leaves is the weights,
// not the phase rule: a pre-registered round on setting `--sd-until` in real time (a fixed calm window, or
// volatility that leaves out the largest moves), judged on this replay under both minimums". The two replays showed
// that 2020's swings, once they enter the standard deviations, reshape the composite's 2000-2003 history (the 2001
// peak slides to 2000-09; under P3 the 2002-11/2003-04 pair vanishes at the 2020-03 cut-off). Fixing the window to
// 2019-12 fixes the 2001 peak, but no user at a cut-off can know where the next calm window ends. A scale a few wild
// months barely move can be computed at any cut-off with no choice made.
//
// Pre-registered 2026-11-24, written and committed (with the `scale` option of composite-index.mjs, which no
// script had used) before this script was first run. Seen beforehand: both replays with every-month sds and with
// sds fixed to 2019-12 (eval/turns-realtime.out.txt, eval/turns-realtime-p3.out.txt). The MAD and trimmed scales
// have not been run on this composite, full sample or replay.
//
// Arms (every one uses only months known at the cut-off; same data, cut-offs, 2-month release lag, call rule,
// retracted-alarm rule and survival rule as eval/turns-realtime.mjs):
//   M (candidate) scale 'mad': 1.4826 x the median absolute deviation of each component's monthly change over
//     every month to the cut-off;
//   S (shipped)   scale 'sd' over every month (the replays above, for comparison);
//   printed, no bar: T scale 'trim' (sd after leaving out changes more than 5 MADs from the median), and the
//     hindsight arm F (sd fixed to 2019-12).
// Each arm run under minPhase 3 (the monthly composite default) and minPhase 6.
//
// Expectation written down beforehand: M should behave like F, since 2020 is a handful of months among 600: the
// 2001 peak called, 8 of 12 before NBER. But under F, P3 keeps the 2002-11/2003-04 pair at every cut-off and so
// counted 7 retracted-or-standing episodes; if M keeps it too, M3 below fails under P3. MAD weights also differ from
// sd weights before 2020 (MAD ignores the tails of every component), so the pre-2020 calls could move either way.
//
// Bars, all on arm M (judged under both minimums, as the item asked):
//   M1 under P3 and under P6: at least 15 of the 16 NBER turns called and median delay at most 7 months;
//   M2 under P3 and under P6: called before NBER's announcement in at least 8 of the 12 announced turns (the bar
//      both replays with every-month sds failed at 7);
//   M3 under P3 and under P6: at most 6 retracted-or-standing false episodes, 1970-2026;
//   M4 under P3 and under P6: survival non-decreasing across the five age groups and age 12+ held in >= 90%;
//   M5 full sample (data to 2026-07, weights over every month) under P3: all 16 NBER turns within 3 months with at
//      most 2 false turns (the bar the composite's own round used, C1's false limit).
// Ships if M1-M5 pass: `--sd-scale mad|sd|trim` on `--turns --columns` (CLI, page and engine), default unchanged
// ('sd', the handbook's), with the README recommending mad when the user cannot name a calm window. A default
// change would want a second make (another composite with dated turns) and is not decided here. If any bar fails,
// nothing ships beyond the module option (no CLI flag); the table stays in the README.
//
// usage: node eval/turns-realtime-weights.mjs > eval/turns-realtime-weights.out.txt
import { pathToFileURL } from 'node:url';
import { replay, analyse, START, LAG, FAR } from './turns-realtime.mjs';
import { load, ARMS } from './turns-composite.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { turningPoints } from '../turning-points.mjs';
import { match } from './turns-bbq.mjs';

export const PHASES = [3, 6];

function arm(scale, minPhase, sdFixed = false) {
  const a = analyse(replay({ scale, minPhase, sdFixed }));
  const called = a.calls.filter((c) => c.delay !== null).length;
  return { ...a, called, b1: called >= 15 && a.median <= 7, b2: a.before >= 8, b3: a.episodes.length <= 6, b4: a.R4 };
}

export function fullSample(scale, minPhase = 3) {
  const s = load();
  const c = compositeIndex(ARMS[0].parts.map((p) => s.values[p]), { scale });
  const tp = turningPoints(c.index, { frequency: 'monthly', bigMove: 0.05, minPhase });
  const m = match(s.turns, tp.turns, 3, FAR);
  return { weights: c.weights, turns: tp.turns.map((t) => ({ kind: t.kind, month: s.label[t.i] })), matched: m.matched, falses: m.falses, of: s.turns.length };
}

export function run() {
  const M = Object.fromEntries(PHASES.map((p) => [p, arm('mad', p)]));
  const full = fullSample('mad', 3);
  const both = (k) => PHASES.every((p) => M[p][k]);
  const M1 = both('b1'), M2 = both('b2'), M3 = both('b3'), M4 = both('b4');
  const M5 = full.matched === full.of && full.falses <= 2;
  return { M, full, M1, M2, M3, M4, M5, ships: M1 && M2 && M3 && M4 && M5 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (v) => v === null ? '-' : `${(100 * v).toFixed(1)}%`;
  const r = run();
  const rows = [['M mad', 'mad', false], ['S sd (shipped)', 'sd', false], ['T trim (no bar)', 'trim', false], ['F sd to 2019-12 (hindsight, no bar)', 'sd', true]];
  console.log(`Composite weights set in real time: pseudo-real-time replay of \`--turns --columns\` (arm A, bigMove 0.05), cut-offs ${START} on, release lag ${LAG}`);
  for (const p of PHASES) {
    console.log(`\n=== minPhase ${p} ===`);
    const arms = rows.map(([name, scale, fixed]) => [name, scale === 'mad' && !fixed ? r.M[p] : arm(scale, p, fixed)]);
    console.log('NBER turn  kind    ' + arms.map(([n]) => n.split(' ')[0].padStart(6)).join(' ') + '   (delay in months; - = never held)   announced');
    arms[0][1].calls.forEach((c, k) => console.log(`  ${c.month}  ${c.kind.padEnd(6)}  ${arms.map(([, a]) => String(a.calls[k].delay ?? '-').padStart(6)).join(' ')}   ${c.ann ?? '-'}`));
    for (const [name, a] of arms) {
      const L = a.label;
      console.log(`\n${name}: called ${a.called} of 16, median ${a.median}, before NBER ${a.before} of ${a.announced}, false episodes ${a.episodes.length}; survival ${a.groups.map((g) => pct(g.share)).join(', ')}; 12+ ${pct(a.oldShare)}`);
      for (const e of a.episodes) console.log(`    ${e.kind.padEnd(6)} ${e.months.map((i) => L[i]).join(',')}  shown on data to ${L[e.first]}..${L[e.last]} (${e.cuts} turn-cut-offs)`);
    }
  }
  console.log('\n=== full sample, data to 2026-07, weights over every month, minPhase 3 ===');
  for (const scale of ['mad', 'sd', 'trim']) {
    const f = scale === 'mad' ? r.full : fullSample(scale, 3);
    console.log(`${scale.padEnd(5)} weights ${f.weights.map((w) => w.toFixed(3)).join('/')}  NBER matched ${f.matched} of ${f.of}, false ${f.falses}`);
  }
  console.log(`  mad turns: ${r.full.turns.map((t) => `${t.kind[0]}${t.month}`).join(' ')}`);
  const pf = (k) => PHASES.map((p) => `P${p} ${r.M[p][k] ? 'pass' : 'fail'}`).join(', ');
  console.log(`\nM1 >= 15 of 16 called, median <= 7: ${r.M1 ? 'passes' : 'fails'} (${PHASES.map((p) => `P${p} ${r.M[p].called}/${r.M[p].median}`).join(', ')}; ${pf('b1')})`);
  console.log(`M2 before NBER in >= 8 of 12: ${r.M2 ? 'passes' : 'fails'} (${PHASES.map((p) => `P${p} ${r.M[p].before}`).join(', ')})`);
  console.log(`M3 false episodes <= 6: ${r.M3 ? 'passes' : 'fails'} (${PHASES.map((p) => `P${p} ${r.M[p].episodes.length}`).join(', ')})`);
  console.log(`M4 survival non-decreasing, 12+ >= 90%: ${r.M4 ? 'passes' : 'fails'} (${PHASES.map((p) => `P${p} ${pct(r.M[p].oldShare)}`).join(', ')}; ${pf('b4')})`);
  console.log(`M5 full sample 16 of 16, <= 2 false: ${r.M5 ? 'passes' : 'fails'} (${r.full.matched} of ${r.full.of}, ${r.full.falses} false)`);
  console.log(`decision: ${r.ships ? 'M1-M5 pass; --sd-scale ships on --turns --columns (default sd)' : 'a bar fails; nothing ships beyond the module option'}`);
}

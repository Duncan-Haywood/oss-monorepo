// The "ar1 + floor 2" joint fit on fresh multi-column labelled data: the honeybee dance sequences
// (flagship item a, 2026-11-16).
//
// Why: on TCPD's three multi-column series the joint level fit with an AR(1) sd and a floor of 2 on
// every column scored best (mean F1 0.564, README "A joint fit that survives smooth columns"), but it
// was not the primary there and three series is a panel, so it was recorded as a lead to be tested
// on fresh multi-column labelled data. Sequences 1 to 5 of the bee dance set (Oh et al. 2008) are
// that: three columns (x, y, heading), 602 to 1124 frames, 16 to 28 labelled switches between the
// dance's left-turn, right-turn and waggle phases each. None of 1-5 has been run through any
// detector in this repository. Sequence 6 is the same dance as TCPD's bee_waggle_6 (seen data, and
// TCPD's annotators marked only 2 changes where this set's labels mark 15), so it is printed apart
// and never enters the rule.
//
// Written and fixed before any setting was scored on sequences 1-5:
//   - the six joint settings of eval/tcpd-multi-floor.mjs, unchanged, plus the column-by-column
//     consensus (the page's primary reading) and "zero" (no changes) as references;
//   - F1 at margin 5 and segmentation cover, TCPDBench definitions (eval/tcpd-metrics.mjs), one
//     annotator (the set's own labels), mean over sequences 1-5;
//   - primary: "joint level, ar1 + floor 2";
//   - decision rule: the lead CONFIRMS if (1) its mean F1 over 1-5 is the highest of the six joint
//     settings, (2) it beats the column consensus's mean F1, and (3) it beats "floor auto" (the joint
//     default) on at least 4 of the 5 sequences. Then the page and CLI describe it as the setting
//     that held up on fresh labelled data. Otherwise the lead FAILS and is written up as failed.
//   - Either way the joint default stays "floor auto": in eval/multi-floor-sim.mjs a floor on every
//     column cuts the power on a 0.5-sd shared step over 4 white-noise columns from 76% to 3%, and
//     no labelled set can buy that back.
//
// Known in advance and not corrected: the set's columns are min-max scaled to [0, 1] as distributed
// (KL-CPD's preprocessing), and the heading is an angle scaled the same way, so it jumps when the bee
// turns through the wrap point. The joint fits take each column's sd separately, so the scaling does
// not matter; the wrap does, and it is left in for every setting alike.
//
// usage: node eval/beedance-multi.mjs > eval/beedance-multi.out.txt
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { multiPelt, columnConsensus, columnSigmas } from '../multivariate.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';
import { SETTINGS } from './tcpd-multi-floor-settings.mjs';

const MARGIN = 5;
const PRIMARY = 'joint level, ar1 + floor 2';
const DEFAULT = 'joint level, floor auto (primary)';
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => (v == null ? '  -  ' : v.toFixed(3));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function loadBee(i) {
  const lines = readFileSync(new URL(`../data/beedance-${i}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1);
  const cols = [[], [], []], labels = [];
  lines.forEach((ln, t) => {
    const p = ln.split(',');
    for (let k = 0; k < 3; k++) cols[k].push(Number(p[k + 1]));
    if (p[4] === '1') labels.push(t);
  });
  return { name: `bee ${i}`, cols, names: ['x', 'y', 'heading'], n: lines.length, ann: { set: labels } };
}

export function scoreBee(s) {
  const out = {};
  for (const [nm, o] of Object.entries(SETTINGS)) {
    const cps = clean(multiPelt(s.cols, o).changepoints, s.n);
    out[nm] = { cps, f1: fMeasure(s.ann, cps, MARGIN).F, cover: covering(s.ann, cps, s.n) };
  }
  const cc = clean(columnConsensus(s.cols, { names: s.names }).changes.map((c) => c.index), s.n);
  out['columns: every setting (consensus)'] = { cps: cc, f1: fMeasure(s.ann, cc, MARGIN).F, cover: covering(s.ann, cc, s.n) };
  out['zero (no changes)'] = { cps: [], f1: fMeasure(s.ann, [], MARGIN).F, cover: covering(s.ann, [], s.n) };
  return out;
}

export function decide(fresh, res) {
  const joint = Object.keys(SETTINGS);
  const m = (nm) => mean(fresh.map((s) => res[s.name][nm].f1));
  const best = joint.reduce((a, b) => (m(b) > m(a) ? b : a));
  const c1 = best === PRIMARY;
  const c2 = m(PRIMARY) > m('columns: every setting (consensus)');
  const wins = fresh.filter((s) => res[s.name][PRIMARY].f1 > res[s.name][DEFAULT].f1).length;
  const c3 = wins >= 4;
  return { best, c1, c2, wins, c3, confirms: c1 && c2 && c3 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fresh = [1, 2, 3, 4, 5].map(loadBee);
  const seen = loadBee(6);
  const res = {};
  for (const s of [...fresh, seen]) res[s.name] = scoreBee(s);
  const rows = Object.keys(res['bee 1']);

  console.log('Bee dance sequences 1-5 (fresh), three columns, joint fits as in eval/tcpd-multi-floor.mjs. Settings, primary and rule fixed before scoring.');
  console.log('F1 at margin 5 and segmentation cover (TCPDBench definitions), the set\'s own labels; cuts = changes reported.');
  console.log('');
  const W = 40;
  console.log(`${'setting'.padEnd(W)}${fresh.map((s) => s.name.padStart(8)).join('')}${'mean F1'.padStart(10)}${'cover'.padStart(8)}${'cuts'.padStart(20)}${'bee 6 (seen)'.padStart(14)}`);
  for (const nm of rows) {
    const f = fresh.map((s) => res[s.name][nm].f1);
    const c = fresh.map((s) => res[s.name][nm].cover);
    console.log(`${nm.padEnd(W)}${f.map((x) => r3(x).padStart(8)).join('')}${r3(mean(f)).padStart(10)}${r3(mean(c)).padStart(8)}${fresh.map((s) => res[s.name][nm].cps.length).join('/').padStart(20)}${r3(res['bee 6'][nm].f1).padStart(14)}`);
  }
  console.log(`${'labelled changes'.padEnd(W)}${fresh.map((s) => String(s.ann.set.length).padStart(8)).join('')}${''.padStart(18)}${fresh.map((s) => s.ann.set.length).join('/').padStart(20)}${String(seen.ann.set.length).padStart(14)}`);
  console.log('');
  const d = decide(fresh, res);
  console.log('Decision rule (pre-registered):');
  console.log(`  (1) best mean F1 of the six joint settings: ${d.best} -> ${d.c1 ? 'met' : 'not met'}`);
  console.log(`  (2) primary beats the column consensus on mean F1: ${d.c2 ? 'met' : 'not met'}`);
  console.log(`  (3) primary beats floor auto on >= 4 of 5 sequences: ${d.wins} of 5 -> ${d.c3 ? 'met' : 'not met'}`);
  console.log(`  Lead: ${d.confirms ? 'CONFIRMS' : 'FAILS'}`);
  console.log('');
  console.log('Column sd under the primary (plain -> AR(1) long-run, floored at 2x the local-line scatter):');
  for (const s of [...fresh, seen]) {
    const cs = columnSigmas(s.cols, { floor: 2, ar1: true });
    console.log(`  ${s.name}: ${cs.map((c, i) => `${s.names[i]} ${c.base.toPrecision(3)} -> ${c.sigma.toPrecision(3)}`).join('; ')}`);
  }
  console.log('');
  console.log('Changes reported:');
  for (const s of [...fresh, seen]) {
    console.log(`  ${s.name}: labels ${s.ann.set.join(' ')}`);
    for (const nm of rows) {
      const c = res[s.name][nm].cps;
      console.log(`    ${nm}: ${c.length} ${c.length > 30 ? `${c.slice(0, 30).join(' ')} ...` : c.join(' ')}`);
    }
  }
}

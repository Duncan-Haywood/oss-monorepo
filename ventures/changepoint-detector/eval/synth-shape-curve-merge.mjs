// Summarise eval/synth-shape-curve-sim.mjs output (JSON lines on stdin) for eval/synth-shape-curve-prereg-2026-11-18.md.
// The slope flag ('straight'): a unit whose plain word is 'grew' and whose gap's bend (gapBend) lies in the band
// [LO, HI], a gap that grew along a line from the date rather than bending. Rates by family and by whether the panel rule switched on:
//   clean grew / slope grew       plain word 'grew' (the plain word's own slope flag)
//   clean flag / slope flag       the slope flag; lift = slope flag - clean flag
//   big slope flag                slope donors at twice the effect
//   pulse flag / step flag        the flag on the other shapes (a pulse is 'faded', so rarely flagged)
//   precision                     share of flagged units that are the shocked slope donor, slope cells only
// "above" variants restrict to units listed at or above the treated one (what the CLI's note words).
//   cat part*.json | SC_BAND=-0.15:0.1 node eval/synth-shape-curve-merge.mjs   (several bands: comma-separated)
import { readFileSync } from 'node:fs';
import { family } from './synth-shape-switch-sim.mjs';

const bands = (process.env.SC_BAND ?? '-0.15:0.1').split(',').map((b) => b.split(':').map(Number));
const rows = readFileSync(0, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
export const summary = {};
for (const [lo, hi] of bands) {
  const tau = `${lo}:${hi}`;
  const flag = (u) => u[0] === 'g' && u[2] !== null && u[2] >= lo && u[2] <= hi;
  const groups = {};
  const g = (key) => (groups[key] ??= { panels: 0, switched: 0, n: {}, k: {} });
  const add = (G, name, ok, n) => { G.k[name] = (G.k[name] ?? 0) + ok; G.n[name] = (G.n[name] ?? 0) + n; };
  for (const r of rows) {
    const fam = family(r.cell);
    for (const key of [`${fam} | all panels`, `${fam} | switched`, ...(fam.startsWith('growing') ? ['growing-all | all panels', 'growing-all | switched'] : [])]) {
      if (key.endsWith('switched') && !r.relative) continue;
      const G = g(key);
      G.panels += 1; if (r.relative) G.switched += 1;
      for (const [list, tag] of [[r.clean, 'clean'], [r.clean.filter((u) => u[3]), 'clean above']]) {
        add(G, `${tag} grew`, list.filter((u) => u[0] === 'g').length, list.length);
        add(G, `${tag} flag`, list.filter(flag).length, list.length);
      }
      const s = r.shocked;
      if (s) {
        for (const sel of s[3] ? ['', ' above'] : ['']) {
          const sh = r.shape === 'slope' ? (r.shock === 2 ? ['slope', 'big slope'] : ['slope']) : [r.shape];
          for (const name of sh) {
            add(G, `${name}${sel} grew`, s[0] === 'g' ? 1 : 0, 1);
            add(G, `${name}${sel} flag`, flag(s) ? 1 : 0, 1);
          }
        }
        if (r.shape === 'slope') {
          const flagged = r.clean.filter(flag).length + (flag(s) ? 1 : 0);
          add(G, 'precision flag', flag(s) ? 1 : 0, flagged);
          add(G, 'precision grew', s[0] === 'g' ? 1 : 0, r.clean.filter((u) => u[0] === 'g').length + (s[0] === 'g' ? 1 : 0));
        }
      }
    }
  }
  const rate = (G, name) => (G.n[name] ? G.k[name] / G.n[name] : null);
  const fmt = (v) => (v === null ? '-' : `${(100 * v).toFixed(1)}%`);
  console.log(`\n==== BAND ${tau}`);
  const T = (summary[tau] = {});
  for (const [key, G] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n${key}: ${G.panels} panels, ${G.switched} switched (${pc(G.switched, G.panels)})`);
    const S = (T[key] = { panels: G.panels, switched: G.switched });
    for (const line of ['clean', 'clean above', 'slope', 'slope above', 'big slope', 'big slope above', 'pulse', 'step', 'precision']) {
      const p = rate(G, `${line} grew`), q = rate(G, `${line} flag`);
      if (p === null && q === null) continue;
      S[line] = { grew: p, flag: q, n: G.n[`${line} grew`] };
      console.log(`  ${line.padEnd(16)} grew ${fmt(p).padStart(6)}  flag ${fmt(q).padStart(6)}  (n ${G.n[`${line} grew`]}${line === 'precision' ? ` / ${G.n['precision flag']}` : ''})`);
    }
    if (S.slope && S.clean) {
      S.lift = { grew: S.slope.grew - S.clean.grew, flag: S.slope.flag - S.clean.flag };
      const odds = (a, b) => (a / (1 - a)) / (b / (1 - b));
      S.odds = { grew: odds(S.slope.grew, S.clean.grew), flag: odds(S.slope.flag, S.clean.flag) };
      console.log(`  ${'slope lift'.padEnd(16)} grew ${(100 * S.lift.grew).toFixed(1).padStart(6)} pts  flag ${(100 * S.lift.flag).toFixed(1).padStart(6)} pts`);
      console.log(`  ${'odds ratio'.padEnd(16)} grew ${S.odds.grew.toFixed(2).padStart(6)}      flag ${S.odds.flag.toFixed(2).padStart(6)}`);
    }
  }
}
if (process.env.SC_JSON) console.log(`\nJSON ${JSON.stringify(summary)}`);

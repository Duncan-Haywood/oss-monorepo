// Summarise eval/synth-shape-switch-sim.mjs output (JSON lines on stdin) for the bars of
// eval/synth-shape-switch-prereg-2026-11-18.md. Every line is split by family and by whether the panel-relative rule
// switched on in that panel; the two words are identical on panels where it did not, so the switched panels are where
// the choice of default is decided.
// Rates, each plain then panel:
//   clean worded      share of clean units (no shock of their own) given any word other than 'held'
//   clean grew        share of clean units called 'grew' (the baseline a slope donor's 'grew' is read against)
//   clean faded       share of clean units called 'faded' (the baseline for a pulse donor's 'faded')
//   slope grew        share of slope donors (shock 1 and 2) called 'grew'; lift = slope grew - clean grew
//   pulse faded       share of pulse donors called 'faded'; lift = pulse faded - clean faded
//   step held         share of step donors called 'held'
// "above" variants restrict to units listed at or above the treated one (what the CLI's note words).
//   cat part*.json | node eval/synth-shape-switch-merge.mjs
import { readFileSync } from 'node:fs';
import { family } from './synth-shape-switch-sim.mjs';

const rows = readFileSync(0, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
const groups = {};
const g = (key) => (groups[key] ??= { panels: 0, switched: 0, n: {}, k: {} });
const add = (G, name, ok, n) => { G.k[name] = (G.k[name] ?? 0) + ok; G.n[name] = (G.n[name] ?? 0) + n; };
for (const r of rows) {
  const fam = family(r.cell);
  for (const key of [`${fam} | all panels`, `${fam} | switched`, ...(fam.startsWith('growing') ? ['growing-all | all panels', 'growing-all | switched'] : [])]) {
    if (key.endsWith('switched') && !r.relative) continue;
    const G = g(key);
    G.panels += 1; if (r.relative) G.switched += 1;
    for (const w of ['plain', 'panel']) {
      for (const [set, tag] of [[r.clean, 'clean'], [r.cleanAbove, 'clean above']]) {
        const c = set[w], n = c.held + c.grew + c.faded;
        add(G, `${tag} worded ${w}`, c.grew + c.faded, n);
        add(G, `${tag} grew ${w}`, c.grew, n);
        add(G, `${tag} faded ${w}`, c.faded, n);
      }
      if (r.shocked) {
        const word = r.shocked[w];
        for (const sel of r.shocked.above ? ['', ' above'] : ['']) {
          if (r.shape === 'slope') add(G, `slope${sel} grew ${w}`, word === 'grew' ? 1 : 0, 1);
          if (r.shape === 'slope') add(G, `slope${sel} worded ${w}`, word !== 'held' ? 1 : 0, 1);
          if (r.shape === 'slope' && r.shock === 2) add(G, `big slope${sel} held ${w}`, word === 'held' ? 1 : 0, 1);
          if (r.shape === 'slope' && r.shock === 2) add(G, `big slope${sel} grew ${w}`, word === 'grew' ? 1 : 0, 1);
          if (r.shape === 'pulse') add(G, `pulse${sel} faded ${w}`, word === 'faded' ? 1 : 0, 1);
          if (r.shape === 'step') add(G, `step${sel} held ${w}`, word === 'held' ? 1 : 0, 1);
        }
      }
    }
  }
}
const rate = (G, name) => (G.n[name] ? G.k[name] / G.n[name] : null);
const fmt = (v) => (v === null ? '-' : `${(100 * v).toFixed(1)}%`);
const pts = (v) => (v === null ? '-' : `${(100 * v).toFixed(1)} pts`);
export const summary = {};
for (const [key, G] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${key}: ${G.panels} panels, ${G.switched} switched (${pc(G.switched, G.panels)})`);
  const S = (summary[key] = { panels: G.panels, switched: G.switched });
  for (const line of ['clean worded', 'clean above worded', 'clean grew', 'clean faded', 'slope grew', 'big slope grew', 'big slope held', 'slope above grew', 'slope worded', 'pulse faded', 'pulse above faded', 'step held', 'step above held']) {
    const p = rate(G, `${line} plain`), q = rate(G, `${line} panel`);
    if (p === null && q === null) continue;
    S[line] = { plain: p, panel: q, n: G.n[`${line} plain`] };
    console.log(`  ${line.padEnd(19)} plain ${fmt(p).padStart(6)}  panel ${fmt(q).padStart(6)}  (n ${G.n[`${line} plain`]})`);
  }
  for (const [line, base, label] of [['slope grew', 'clean grew', 'slope lift'], ['pulse faded', 'clean faded', 'pulse lift'], ['slope worded', 'clean worded', 'slope flag lift']]) {
    const lp = rate(G, `${line} plain`), lq = rate(G, `${line} panel`);
    if (lp === null) continue;
    const p = lp - rate(G, `${base} plain`), q = lq - rate(G, `${base} panel`);
    S[label] = { plain: p, panel: q };
    console.log(`  ${label.padEnd(19)} plain ${pts(p).padStart(9)}  panel ${pts(q).padStart(9)}`);
  }
}
if (process.env.SC_JSON) console.log(`\nJSON ${JSON.stringify(summary)}`);

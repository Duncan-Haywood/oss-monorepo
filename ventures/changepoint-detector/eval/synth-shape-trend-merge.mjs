// Summarise eval/synth-shape-trend-sim.mjs output (JSON lines on stdin): per cell, the treated rank-1 share, the
// panel's median late/early ratio, the shocked donor's plain and panel-relative words when listed at or above the
// treated unit, the clean units listed above that get a word each way, and every placebo's words; then the pooled
// lines the pre-registration's bars read.
//   cat part*.json | node eval/synth-shape-trend-merge.mjs
import { readFileSync } from 'node:fs';
const rows = readFileSync(0, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const by = {};
for (const r of rows) (by[r.cell] ??= []).push(r);
const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '-');
const med = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
console.log('cell    n  rank1 | centre, relative share | shocked above: n, plain held/grew/faded, rel held/grew/faded | clean above: n, plain shaped, rel shaped | all placebos: plain grew/faded, rel grew/faded');
const pool = {};
const add = (key, ok, n) => { pool[key] ??= [0, 0]; pool[key][0] += ok; pool[key][1] += n; };
for (const [cell, rs] of Object.entries(by)) {
  const sa = rs.filter((r) => r.shocked && r.shockedAbove);
  const w = (key, v) => sa.filter((r) => r[key] === v).length;
  const ca = rs.reduce((s, r) => s + r.cleanAbove, 0), cp = rs.reduce((s, r) => s + r.cleanAboveShaped, 0), cr = rs.reduce((s, r) => s + r.cleanAboveRel, 0);
  const all = (k, v) => rs.reduce((s, r) => s + r[k][v], 0); for (const v of ['grew', 'faded']) { add(`${cell.startsWith('W') ? 'wander' : cell.startsWith('G') ? 'growing' : 'trendless'} all placebos ${v} plain`, all('allPlain', v), rs.reduce((s, r) => s + r.allPlain.held + r.allPlain.grew + r.allPlain.faded, 0)); add(`${cell.startsWith('W') ? 'wander' : cell.startsWith('G') ? 'growing' : 'trendless'} all placebos ${v} hybrid`, all('allRel', v), rs.reduce((s, r) => s + r.allPlain.held + r.allPlain.grew + r.allPlain.faded, 0)); }
  const tot = rs.reduce((s, r) => s + r.allPlain.held + r.allPlain.grew + r.allPlain.faded, 0);
  console.log(`${cell.padEnd(7)} ${rs.length} ${pc(rs.filter((r) => r.rank === 1).length, rs.length).padStart(6)} | ${med(rs.map((r) => r.centre)).toFixed(2).padStart(6)}, ${pc(rs.filter((r) => r.relative).length, rs.length)} | ${sa.length}, ${pc(w('shockedShape', 'held'), sa.length)}/${pc(w('shockedShape', 'grew'), sa.length)}/${pc(w('shockedShape', 'faded'), sa.length)}, ${pc(w('shockedRel', 'held'), sa.length)}/${pc(w('shockedRel', 'grew'), sa.length)}/${pc(w('shockedRel', 'faded'), sa.length)} | ${ca}, ${pc(cp, ca)}, ${pc(cr, ca)} | ${pc(all('allPlain', 'grew'), tot)}/${pc(all('allPlain', 'faded'), tot)}, ${pc(all('allRel', 'grew'), tot)}/${pc(all('allRel', 'faded'), tot)}`);
  const fam = cell.startsWith('W') ? 'wander' : cell.startsWith('G') ? 'growing' : 'trendless', kind = cell.replace(/\d+$/, '').replace(/^W[ab]/, 'W').replace(/^G/, 'W');
  for (const [nameKey, k] of [['plain', 'shockedShape'], ['hybrid', 'shockedRel']]) {
    if (/^(PP|NP|PBP|PPE|WP|WPE)$/.test(kind)) add(`${fam} pulse faded ${nameKey}`, w(k, 'faded'), sa.length);
    if (/^(PD|PB|WD)$/.test(kind)) add(`${fam} step held ${nameKey}`, w(k, 'held'), sa.length);
    if (/^(PSE|WSE)$/.test(kind)) add(`${fam} big slope grew ${nameKey}`, w(k, 'grew'), sa.length);
    if (/^(PS|NS|WS)$/.test(kind)) add(`${fam} slope 1.0 grew ${nameKey}`, w(k, 'grew'), sa.length);
  }
  add(`${fam} clean above shaped plain`, cp, ca);
  add(`${fam} clean above shaped hybrid`, cr, ca);
  if (fam === 'growing') for (const rel of [true, false]) {
    const sub = rs.filter((r) => r.relative === rel), a = sub.reduce((x, r) => x + r.cleanAbove, 0);
    add(`growing, ${rel ? 'relative' : 'plain'} panels: clean above shaped plain`, sub.reduce((x, r) => x + r.cleanAboveShaped, 0), a);
    add(`growing, ${rel ? 'relative' : 'plain'} panels: clean above shaped hybrid`, sub.reduce((x, r) => x + r.cleanAboveRel, 0), a);
  }
  if (fam === 'wander') add(`${cell.slice(0, 2)} clean above shaped hybrid`, cr, ca), add(`${cell.slice(0, 2)} clean above shaped plain`, cp, ca);
}
console.log('\npooled:');
for (const [k, [a, b]] of Object.entries(pool).sort(([x], [y]) => x.localeCompare(y))) console.log(`  ${k}: ${a} of ${b}, ${pc(a, b)}`);

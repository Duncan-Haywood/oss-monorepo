// How often the muted-column description (multivariate.mjs mutedColumns, 2026-11-16) fires on simulated columns,
// under the default joint fit and under AR(1) + floor 2. Fixed seeds; 100 series of 3 columns per cell, 300 points.
// usage: node eval/muted-sim.mjs > eval/muted-sim.out.txt
import { multiPelt, mutedColumns } from '../multivariate.mjs';
// The joint fit alone (multiPelt), not analyzeMulti, which also runs every column's six-setting panel.
const analyzeMulti = ({ cols, names = cols.map((_, i) => `c${i}`), ar1 = false, floor = 'auto' }) => {
  const m = mutedColumns(cols, names, multiPelt(cols, { ar1, floor }).sigmas);
  return m.length ? { mutedColumns: m } : {};
};
import { loadBee } from './beedance-multi.mjs';

let s = 12345;
const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
const KINDS = {
  'white noise, no change': () => Array.from({ length: 300 }, () => g()),
  'white noise, 1 sd step at 150': () => Array.from({ length: 300 }, (_, i) => g() + (i >= 150 ? 1 : 0)),
  'AR(1) rho 0.5, no change': () => { let x = 0; return Array.from({ length: 300 }, () => (x = 0.5 * x + g())); },
  'AR(1) rho 0.9, 3 sd step at 150': () => { let x = 0; return Array.from({ length: 300 }, (_, i) => (x = 0.9 * x + g()) + (i >= 150 ? 3 : 0)); },
  'random walk, no change': () => { let x = 0; return Array.from({ length: 300 }, () => (x += g())); },
  'smooth path (sine, period 120, sd 0.05 noise)': () => { const ph = r() * 6.28; return Array.from({ length: 300 }, (_, i) => Math.sin(ph + i * 6.283 / 120) + 0.05 * g()); },
};
const SET = { 'default (floor auto)': {}, 'ar1 + floor 2': { ar1: true, floor: 2 } };
console.log('Columns flagged as muted, of 300 (100 series x 3 columns, 300 points each).');
console.log(`${'columns'.padEnd(48)}${Object.keys(SET).map((k) => k.padStart(22)).join('')}`);
for (const [kind, f] of Object.entries(KINDS)) {
  const counts = [];
  for (const o of Object.values(SET)) {
    s = 12345;
    let c = 0;
    for (let k = 0; k < 100; k++) { const a = analyzeMulti({ cols: [f(), f(), f()], ...o }); c += a.mutedColumns ? a.mutedColumns.length : 0; }
    counts.push(c);
  }
  console.log(`${kind.padEnd(48)}${counts.map((c) => String(c).padStart(22)).join('')}`);
}
console.log('');
console.log('Bee dance sequences (x, y, heading), muted columns:');
for (const i of [1, 2, 3, 4, 5, 6]) {
  const b = loadBee(i);
  const row = Object.entries(SET).map(([k, o]) => `${k}: ${(analyzeMulti({ cols: b.cols, names: b.names, ...o }).mutedColumns || []).map((m) => m.column).join(', ') || 'none'}`);
  console.log(`  bee ${i}${i === 6 ? ' (seen)' : ''}: ${row.join('; ')}`);
}

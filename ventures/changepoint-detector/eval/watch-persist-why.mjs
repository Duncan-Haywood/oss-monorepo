// Why persist 2 lost the one majority-marked TCPD change in round 5 (README "Round 5": "why was not traced").
// Diagnostic, deciding nothing. Replays children_per_woman as eval/watch-flicker.mjs does (from 20% of its length,
// one check per point, the shipped detector, hold off) with persist 1 and 2, and prints the detections at every check.
//
//   node eval/watch-persist-why.mjs tcpd-data > eval/watch-persist-why.out.txt
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectChanges, advance, emptyState } from '../watch-core.mjs';

const dir = process.argv[2] || 'tcpd-data', name = 'children_per_woman', TOL = 5;
const j = JSON.parse(readFileSync(join(dir, 'ds', `${name}.json`), 'utf8'));
const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'))[name];
const v = j.series[0].raw.map(Number), lab = v.map((_, i) => String(i + 1)), n0 = Math.max(20, Math.floor(0.2 * v.length));
const year = (i) => j.time?.raw?.[i] ?? i;
// Majority-marked changes exactly as eval/watch-flicker.mjs counts them (sorted, one per TOL-wide cluster).
const K = Object.keys(ann).length, majority = [];
for (const l of [...new Set(Object.values(ann).flat())].sort((x, y) => x - y)) {
  if (l < n0 || Object.values(ann).filter((a) => a.some((m) => Math.abs(m - l) <= TOL)).length * 2 <= K || majority.some((p) => Math.abs(p - l) <= TOL)) continue;
  majority.push(l);
}
console.log(`${name}: ${v.length} points (${year(0)} to ${year(v.length - 1)}), watched from point ${n0}. Annotations (row indexes): ${JSON.stringify(ann)}; majority-marked from the start: ${majority.join(', ')}.\n`);
const steps = [];
for (let n = n0; n <= v.length; n++) steps.push({ n, ch: detectChanges(v.slice(0, n), lab.slice(0, n), {}).map((c) => c.index) });
for (const p of [1, 2]) {
  let st = emptyState(); const al = [], end = [];
  for (const s of steps) {
    const r = advance(st, s.ch.map((i) => ({ index: i, label: lab[i] })), s.n, lab.slice(0, s.n), { holdHistory: false, persist: p });
    for (const a of r.alerts) al.push(`row ${a.index} (${year(a.index)}) sent at point ${s.n}`);
    if (s.n === v.length) end.push(...r.pending.map((x) => `row ${x.index}${x.unconfirmed ? ' (waiting for a second check)' : ''}`));
    st = r.state;
  }
  console.log(`persist ${p}: ${al.length} alerts: ${al.join('; ')}.${end.length ? ` Pending at the last point: ${end.join(', ')}.` : ''}`);
}
console.log('\nDetections at each check where they changed (point: rows):');
let last = null;
for (const s of steps) { const k = s.ch.join(','); if (k !== last) console.log(`  ${s.n}: ${k || '-'}`); last = k; }

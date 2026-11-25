// POST-HOC, not pre-registered: written after eval/turns-business-lines.mjs ran, on the same draws (seed 20261124),
// to find why the composite fell 0.042 short of the hindsight-best line (S3) while a mislabelled rescaled arm did
// not. Nothing ships from it; a fresh pre-registered round is the next item (README "Several business lines").
// Arms: the shipped composite with bigMove 0.05 and off; the plain mean of log levels; the composite's log index
// stretched x10 (so bigMove 0.05 keeps nearly every short phase), with bigMove 0.05 and off.
// usage: node eval/turns-business-lines-posthoc.mjs > eval/turns-business-lines-posthoc.out.txt
import { draw, score, LINES } from './turns-business-lines.mjs';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const u = rng(20261124); const acc = {};
const add = (k, v) => { (acc[k] ||= []).push(v); };
for (let k = 0; k < 500; k++) {
  const { truth, lines } = draw(u, 144, 1);
  const c = compositeIndex(lines);
  for (const [name, x, rule] of [
    ['cb', c.index, { bigMove: 0.05 }], ['cb-nobig', c.index, { bigMove: Infinity }],
    ['cb-eqw', (() => { const xs = lines.map((l) => l.map((v) => Math.log(v))); return xs[0].map((_, t) => Math.exp(xs.reduce((a, x) => a + x[t], 0) / 4)); })(), { bigMove: 0.05 }],
    ['cb-x10', c.index.map((v) => Math.exp(10 * Math.log(v / 100))), { bigMove: 0.05 }],
    ['cb-x10-nobig', c.index.map((v) => Math.exp(10 * Math.log(v / 100))), { bigMove: Infinity }],
  ]) { const t = turningPoints(x, { frequency: 'monthly', ...rule }).turns; const s = score(truth, t); add(name, s.F); add(name + ':false', s.falses); add(name + ':miss', truth.length - s.matched); }
  for (let i = 0; i < 4; i++) { const s = score(truth, turningPoints(lines[i], { frequency: 'monthly', bigMove: 0.05 }).turns); add(LINES[i].name + ':false', s.falses); add(LINES[i].name + ':miss', truth.length - s.matched); }
}
for (const [k, v] of Object.entries(acc)) console.log(k.padEnd(18), (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3));

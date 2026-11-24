// Post-hoc look at the agency-lines round (eval/turns-agency-lines.mjs), written after its first run: why both
// composites trail the single billable-hours line. Same draws (seed 20261126, 500, n 144, noise x1). Not a result and
// not a bar; it names what a next pre-registered round could test.
//   - each line's mean composite weight (Conference Board: one over the volatility of monthly percent changes);
//   - the composite's median timing against the truth, turns matched within 6 months;
//   - the composite (P3) rebuilt without headcount, and with equal weights.
// usage: node eval/turns-agency-lines-posthoc.mjs > eval/turns-agency-lines-posthoc.out.txt
import { compositeIndex } from '../composite-index.mjs';
import { score } from './turns-business-lines.mjs';
import { RULES } from './turns-saas-lines.mjs';
import { draw, LINES } from './turns-agency-lines.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v) => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const lag = (truth, found) => truth.flatMap((t) => { let b = null; for (const f of found) if (f.kind === t.kind && Math.abs(f.i - t.i) <= 6 && (b === null || Math.abs(f.i - t.i) < Math.abs(b))) b = f.i - t.i; return b === null ? [] : [b]; });

export function posthoc({ seed = 20261126, draws = 500, n = 144 } = {}) {
  const u = rng(seed), w = [], tim = [], F = { full: [], noHead: [], equal: [] };
  for (let k = 0; k < draws; k++) {
    const { truth, lines } = draw(u, n, 1);
    const c = compositeIndex(lines);
    w.push(c.weights);
    const t = RULES.P3(c.index).turns;
    tim.push(...lag(truth, t));
    F.full.push(score(truth, t).F);
    F.noHead.push(score(truth, RULES.P3(compositeIndex(lines.slice(0, 3)).index).turns).F);
    // equal weights: the geometric mean of the lines, normalised to their first value
    const eq = lines[0].map((_, i) => Math.exp(mean(lines.map((x) => Math.log(x[i] / x[0])))));
    F.equal.push(score(truth, RULES.P3(eq).turns).F);
  }
  return { weights: LINES.map((_, i) => mean(w.map((x) => x[i]))), timingMedian: median(tim), F: Object.fromEntries(Object.entries(F).map(([k, v]) => [k, mean(v)])) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const p = posthoc();
  console.log(`Mean composite weights: ${LINES.map((l, i) => `${l.name} ${p.weights[i].toFixed(3)}`).join(', ')}`);
  console.log(`Composite (P3) median timing vs truth, matched within 6: ${p.timingMedian > 0 ? '+' : ''}${p.timingMedian} months`);
  console.log(`P3 F1: composite of all four ${p.F.full.toFixed(3)}; without headcount ${p.F.noHead.toFixed(3)}; equal weights ${p.F.equal.toFixed(3)}`);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slopeBreakPValue } from './slope-breaks.mjs';
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const walk = (n, seed, gTo) => { const r = rng(seed); const x = [0]; for (let i = 0; i < n - 1; i++) x.push(x[i] + (gTo !== undefined && i >= n / 2 ? gTo : 1) + Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())); return x; };
test('slopeBreakPValue: a clear break gets a small p, a plain drift a large one, and it is deterministic', () => {
  const brk = slopeBreakPValue(walk(200, 3, -1), { reps: 199 });
  assert.ok(brk.p <= 0.01, `p ${brk.p}`);
  const nul = slopeBreakPValue(walk(200, 4), { reps: 199 });
  assert.ok(nul.p > 0.05, `p ${nul.p}`);
  assert.deepEqual(slopeBreakPValue(walk(200, 4), { reps: 199 }), nul);
  assert.ok(nul.bar95 > 5 && nul.bar95 < 20);
});
test('saved size and power table: n-and-rho bar holds ~5% at n=200 and US productivity is not significant', () => {
  const out = require_saved();
  assert.match(out, /US productivity quarterly n=317: W 5\.8.*p 0\.171/);
  assert.match(out, /US productivity annual means n=78:.*p 0\.154/);
});
import { readFileSync } from 'node:fs';
function require_saved() { return readFileSync(new URL('./eval/slope-pvalue.out.txt', import.meta.url), 'utf8'); }

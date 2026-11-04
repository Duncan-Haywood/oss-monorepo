import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';
import { main } from './cli.mjs';

function series(n, brk, s1, s2) {
  let seed = 7, x = 0; const v = [];
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < n; i++) { x += (i < brk ? s1 : s2) + (rnd() + rnd() + rnd() - 1.5) * 0.4; v.push(x); }
  return v;
}

test('slopeBreaks option dates a large slope change near the planted one', () => {
  const r = analyze({ values: series(200, 100, 1, 0.1), slopeBreaks: true });
  assert.ok(r.slopeBreaks.breaks.length >= 1);
  assert.ok(Math.abs(r.slopeBreaks.breaks[0].index - 100) <= 6, JSON.stringify(r.slopeBreaks));
  assert.ok(r.slopeBreaks.breaks[0].slopeBefore > r.slopeBreaks.breaks[0].slopeAfter);
});

test('a straight drift has no slope break; option absent adds no field', () => {
  const v = series(200, 1000, 0.5, 0.5);
  assert.equal(analyze({ values: v, slopeBreaks: true }).slopeBreaks.breaks.length, 0);
  assert.equal(analyze({ values: v }).slopeBreaks, undefined);
});

test('short series is refused, and the CLI prints the section', async () => {
  assert.throws(() => analyze({ values: series(30, 15, 1, 0), slopeBreaks: true }), /at least 40/);
  const csv = 'i,v\n' + series(200, 100, 1, 0.1).map((v, i) => `${i + 1},${v}`).join('\n');
  const { writeFileSync } = await import('node:fs');
  const f = new URL('./.tmp-slope.csv', import.meta.url).pathname;
  writeFileSync(f, csv);
  let out = '';
  try { await main([f, '--slope-breaks'], { out: (s) => { out += s; } }); } finally { (await import('node:fs')).unlinkSync(f); }
  assert.match(out, /Slope-break test on the differences \(bar 11\)/);
  assert.match(out, /slope .* -> .* per step, Wald/);
});

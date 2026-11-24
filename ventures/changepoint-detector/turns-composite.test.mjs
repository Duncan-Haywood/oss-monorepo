import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-composite.mjs';
import { compositeIndex, symChange } from './composite-index.mjs';
import { turnsResult } from './turns-cli.mjs';
import { main } from './cli.mjs';

// README "A composite of NBER's monthly indicators dates every turn" (2026-11-24, pre-registered; arm A passes C1-C3).
test('composite of four coincident indicators 1967-2026: A 16 of 16, no false turn; ships', () => {
  const o = run({ draws: 500 });
  assert.equal(o.n, 715);
  assert.equal(o.turns.length, 16);
  const [a, b] = o.arms;
  assert.equal(a.matched, 16); assert.equal(a.falses, 0);
  assert.ok(a.C1 && a.C2 && a.C3);
  assert.equal(b.matched, 15); assert.equal(b.falses, 0);
  assert.equal(o.decision, 'A');
  assert.deepEqual(o.comps.map((c) => [c.name, c.matched]), [['PAYEMS', 11], ['W875RX1', 10], ['INDPRO', 14], ['CMRMTSPL', 12], ['CE16OV', 9]]);
  assert.equal(a.plain.matched, 14); // without bigMove, 2020 is thrown out as too short
});

test('compositeIndex: symmetric changes, inverse-sd weights summing to 1, index inverts the change', () => {
  assert.ok(Math.abs(symChange([100, 110])[0] - (200 * 10) / 210) < 1e-12);
  const a = [100, 101, 103, 102, 104, 107], b = [50, 52, 51, 55, 54, 58];
  const c = compositeIndex([a, b]);
  assert.ok(Math.abs(c.weights[0] + c.weights[1] - 1) < 1e-12);
  assert.ok(c.weights[0] > c.weights[1]); // a moves less, so it weighs more
  // one series: the index follows its percent path exactly
  const one = compositeIndex([a]).index;
  for (let t = 0; t < a.length; t++) assert.ok(Math.abs(one[t] - (100 * a[t]) / a[0]) < 1e-9);
  assert.throws(() => compositeIndex([a, [1, 2]]), /equal length/);
  assert.throws(() => compositeIndex([[1, 0, 2]]), /positive/);
});

test('--turns on the CLI: one column and a composite, with phases', async () => {
  const rows = ['month,x,y'];
  for (let i = 0; i < 120; i++) {
    const cyc = Math.sin((2 * Math.PI * i) / 48);
    rows.push(`2000-${String(i).padStart(3, '0')},${(100 * Math.exp(0.002 * i + 0.05 * cyc)).toFixed(4)},${(80 * Math.exp(0.001 * i + 0.04 * cyc)).toFixed(4)}`);
  }
  const csv = rows.join('\n');
  const r = turnsResult({ csv, column: 'x' });
  assert.ok(r.turns.length >= 3);
  for (let j = 1; j < r.turns.length; j++) assert.notEqual(r.turns[j].kind, r.turns[j - 1].kind); // alternates
  const c = turnsResult({ csv, columns: ['x', 'y'] });
  assert.deepEqual(c.composite.columns, ['x', 'y']);
  assert.equal(c.phases.length, c.turns.length - 1);
  let text = '';
  const code = await main(['--turns', '--columns', 'x,y'], { stdin: [csv], out: (s) => { text += s; } });
  assert.equal(code, 0);
  assert.match(text, /composite index of x, y/);
  assert.match(text, /Phases:/);
  await assert.rejects(main(['--big-move', '0.1'], { stdin: [csv], out: () => {} }), /go with --turns/);
  assert.throws(() => turnsResult({ csv, column: 'x', sdUntil: '2000-010' }), /goes with --turns --columns/);
});

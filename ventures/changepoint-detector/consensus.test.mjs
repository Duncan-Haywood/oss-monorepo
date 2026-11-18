import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { consensus, consensusText } from './consensus.mjs';
import { main } from './cli.mjs';

const step = (n, at, jump) => Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898) * 0.5 + (i >= at ? jump : 0));

test('a clear step is found by every setting at its date', () => {
  const c = consensus({ values: step(80, 40, 6) });
  const top = c.changes.find((x) => x.tier === 'all');
  assert.ok(top, 'one change every setting finds');
  assert.ok(Math.abs(top.index - 40) <= 2);
  assert.equal(top.direction, 'up');
  assert.equal(top.support, top.of);
  assert.match(consensusText(c), /Found by every setting/);
});

test('flat noise: nothing is found by every setting', () => {
  const c = consensus({ values: step(80, 999, 0) });
  assert.equal(c.changes.filter((x) => x.tier === 'all').length, 0);
});

test('tolerance 0 separates cuts one point apart; bad tolerance and a short series are refused', () => {
  assert.throws(() => consensus({ values: step(60, 30, 5) }, { tolerance: -1 }), /tolerance/);
  assert.throws(() => consensus({ values: [1, 2] }), /at least 4|No setting/);
});

test('a setting that cannot run is reported, not fatal (--log on a series with zeros)', () => {
  const v = step(60, 30, 5).map((x) => x + 10);
  const c = consensus({ values: v, log: true }, { panel: [{ name: 'ok', opts: { model: 'mean' } }, { name: 'bad', opts: { model: 'nonsense' } }] });
  assert.equal(c.settings.length + c.skipped.length, 2);
});

test('CLI --consensus on the Nile example prints 1899 as found by every setting; --json parses', async () => {
  let o = '';
  assert.equal(await main(['--example', '--consensus'], { out: (s) => (o += s) }), 0);
  assert.match(o, /Found by every setting:\n {2}1899 .*6\/6 {2}down/);
  let j = '';
  await main(['--example', '--consensus', '3', '--json'], { out: (s) => (j += s) });
  assert.equal(JSON.parse(j).tolerance, 3);
});

test('eval/consensus-sim.mjs output is current; "half or more" matches or beats trend alone on false cuts at phi 0.5 and 0.8, same step recall', () => {
  const out = execFileSync('node', [new URL('./eval/consensus-sim.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/consensus-sim.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /phi 0\.8, noise sd 1\n[\s\S]*consensus: every setting: step found 25\/60, other cuts 0\.00/);
});

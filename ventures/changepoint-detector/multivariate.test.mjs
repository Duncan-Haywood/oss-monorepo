import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { multiPelt, multiPenalty, columnConsensus, parseColumns, analyzeMulti, multiText } from './multivariate.mjs';
import { pelt, penaltyValue } from './engine.mjs';
import { main } from './cli.mjs';

const nile = readFileSync(new URL('./data/nile.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => Number(l.split(',').pop()));

test('one column: the joint fit is exactly pelt()', () => {
  for (const model of ['mean', 'meanvar']) {
    const minSegment = model === 'meanvar' ? 10 : 2;
    assert.deepEqual(multiPelt([nile], { model }).changepoints, pelt(nile, { model, minSegment }).changepoints);
    assert.equal(multiPenalty('bic', 100, model, 1), penaltyValue('bic', 100, model));
  }
});

test('penalty counts a location plus one or two parameters per column', () => {
  assert.ok(Math.abs(multiPenalty('bic', 200, 'mean', 4) - 5 * Math.log(200)) < 1e-9);
  assert.ok(Math.abs(multiPenalty('bic', 200, 'meanvar', 4) - 9 * Math.log(200)) < 1e-9);
  assert.equal(multiPenalty(12, 200, 'mean', 4), 12);
});

test('a step shared by four columns, too small for any column alone, is found jointly', () => {
  let a = 7;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
  const cols = Array.from({ length: 4 }, () => Array.from({ length: 200 }, (_, i) => g() + (i >= 100 ? 0.75 : 0)));
  const j = multiPelt(cols).changepoints;
  assert.ok(j.some((c) => Math.abs(c - 100) <= 5), `joint: ${j}`);
});

test('parseColumns aligns rows and carries a missing cell forward', () => {
  const p = parseColumns('date,a,b\n2020,1,10\n2021,,11\n2022,3,\n');
  assert.deepEqual(p.names, ['a', 'b']);
  assert.deepEqual(p.labels, ['2020', '2021', '2022']);
  assert.deepEqual(p.cols, [[1, 1, 3], [10, 11, 11]]);
  assert.equal(p.filled, 2);
  assert.deepEqual(parseColumns('date,a,b\n2020,1,10\n2021,2,11\n', ['b']).cols, [[10, 11]]);
  assert.throws(() => parseColumns('a,b\n,1\n2,3\n'), /first row/);
  assert.throws(() => parseColumns('a,b\n1,2\n', ['c']), /No column named "c"/);
});

test('columnConsensus merges columns and names which found each change', () => {
  const base = Array.from({ length: 120 }, (_, i) => (i >= 60 ? 10 : 0) + (i % 3) * 0.1);
  const c = columnConsensus([base, base.map((v) => -v)], { names: ['up', 'down'] });
  const at = c.changes.find((x) => Math.abs(x.index - 60) <= 2);
  assert.ok(at, JSON.stringify(c.changes));
  assert.deepEqual(at.columns, ['up', 'down']);
  assert.equal(at.support, 2);
});

test('analyzeMulti and the CLI --columns report both ways', async () => {
  const rows = ['t,temp,co2'];
  for (let i = 0; i < 100; i++) rows.push(`${i},${(i >= 50 ? 3 : 0) + (i % 4) * 0.2},${(i >= 50 ? 50 : 0) + (i % 5) * 2}`);
  const csv = rows.join('\n');
  const r = analyzeMulti({ csv });
  assert.deepEqual(r.columns, ['temp', 'co2']);
  assert.ok(r.joint.some((c) => Math.abs(c.index - 50) <= 1));
  assert.match(multiText(r), /One segmentation for all columns/);
  let s = '';
  const stdin = (async function* () { yield csv; })();
  assert.equal(await main(['--columns', 'temp,co2'], { stdin, out: (x) => { s += x; } }), 0);
  assert.match(s, /2 columns, 100 points: temp, co2/);
  assert.match(s, /Changes every setting agrees on, column by column/);
});

test('the TCPD multi-dimensional reading on file', () => {
  const t = readFileSync(new URL('./eval/tcpd-multi.out.txt', import.meta.url), 'utf8');
  assert.match(t, /columns: every setting \(primary\)\s+0\.741\s+0\.124\s+0\.696\s+0\.521/);
  assert.match(t, /published bocpd\s+0\.513\s+0\.121\s+0\.807\s+0\.480/);
  assert.match(t, /published zero\s+0\.594\s+0\.929\s+0\.341\s+0\.621/);
  const sim = readFileSync(new URL('./eval/multi-sim.out.txt', import.meta.url), 'utf8');
  assert.match(sim, /^4\s+0\.5\s+76% \/ 0\.23\s+0% \/ 0\.00$/m);
});

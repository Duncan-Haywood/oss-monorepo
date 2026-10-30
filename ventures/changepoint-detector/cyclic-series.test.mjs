import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';
import { readFileSync } from 'node:fs';
import { count, SETUPS } from './eval/cyclic-series.mjs';

// Real cyclic series with no documented step: every changepoint is a false alarm (README "Two cyclic real series").
const load = (f) => {
  const rows = readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
const want = {
  lynx: { n: 114, counts: [23, 3, 0, 0, 0] },
  'sunspot-year': { n: 289, counts: [46, 7, 0, 1, 0] },
};
for (const [f, w] of Object.entries(want)) {
  test(`${f}: cycles read as steps by default; --ar1 and the meanvar bootstrap leave none (--ar1 joint one on sunspots)`, () => {
    const d = load(f);
    assert.equal(d.values.length, w.n);
    assert.deepEqual(Object.values(SETUPS).map((o) => count(d, o)), w.counts);
  });
}

test('a cycle with many steps gets the false-alarm hint with the range warning', () => {
  const d = load('lynx');
  const w = analyze(d).rangeWarning;
  assert.match(w, /use --ar1/);
  assert.match(w, /With 23 steps at this rho, many may be false alarms/);
  assert.doesNotMatch(analyze({ ...d, ar1: true }).rangeWarning ?? '', /false alarms/);
});

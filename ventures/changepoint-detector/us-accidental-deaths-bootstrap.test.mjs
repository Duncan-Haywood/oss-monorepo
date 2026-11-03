import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (R's USAccDeaths). Numbers match eval/us-accidental-deaths-bootstrap.out.txt.
const rows = readFileSync(new URL('./data/us-accidental-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints.map((c) => c.label);

test('meanvar --bootstrap with the 12-month season keeps the 1973-12 fall and drops the later steps', () => {
  assert.deepEqual(labs({ model: 'meanvar', period: 12 }), ['1973-12', '1975-07', '1978-03']);
  assert.deepEqual(labs({ model: 'meanvar', period: 12, bootstrap: true }), ['1973-12']);
});

test('meanvar --bootstrap with no season loses it, because the winter peaks are not steps', () => {
  assert.deepEqual(labs({ model: 'meanvar', bootstrap: true }), []);
});

test('mean --bootstrap with the season changes nothing', () => {
  assert.deepEqual(labs({ model: 'mean', period: 12, bootstrap: true }), labs({ model: 'mean', period: 12 }));
});

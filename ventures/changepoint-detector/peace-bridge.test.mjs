import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real monthly series (data/peace-bridge.csv): Peace Bridge traffic in thousands, 2003-01 to 2015-12.
// The US passport rule (WHTI) took effect 2009-06-01, during a recession. Numbers match eval/peace-bridge.out.txt.
const rows = readFileSync(new URL('./data/peace-bridge.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const WHTI = labels.indexOf('2009-06');

test('real bridge traffic: the seasonal mean model puts a downward step on the passport month and holds it in range95', () => {
  assert.equal(labels.length, 156);
  const cps = analyze({ values, labels, model: 'mean', period: 12 }).pelt.changepoints;
  const c = cps.find((x) => x.label === '2009-06');
  assert.ok(c && c.meanAfter < c.meanBefore, cps.map((x) => x.label).join(' '));
  assert.ok(c.range95.fromIndex <= WHTI && WHTI <= c.range95.toIndex);
});

test('real bridge traffic: without a season the model chases the summer peak (the honest cost)', () => {
  const cps = analyze({ values, labels, model: 'mean' }).pelt.changepoints;
  assert.ok(cps.length >= 20, `${cps.length} changes`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, MODE_VALUES } from './share.mjs';

const sample = {
  mode: 'STAT',
  revenue: 300,
  stops: 6,
  miles: 35,
  routeHours: 2.5,
  waitMinutes: 45,
  graceMinutes: 15,
  deadheadMiles: 40,
  deadheadMinutes: 70,
  loadedLaborRate: 28,
  vehicleCostPerMile: 0.72,
  consumablePerStop: 1.5,
  overheadRate: 10,
  targetMarginRate: 20,
};

test('round-trips every field the form reads', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('field list matches the ids array index.html actually wires into the render loop', () => {
  // A field present here but missing from the page's `ids` array silently
  // drops out of the on-page render loop; a field present there but missing
  // here silently drops off a shared link -- the same drift class a select
  // field left off an allowlist caused on the paver-patio/roofing
  // calculators (#2962). Kept in sync by assertion rather than by hand.
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const match = html.match(/const ids=\[([^\]]+)\]/);
  assert.ok(match, 'expected to find the ids array in index.html');
  const pageIds = match[1].split(',').map((s) => s.replace(/'/g, ''));
  assert.deepEqual([...NUMBER_FIELD_IDS].sort(), [...pageIds].sort());
});

test('the mode select on the page only ever offers the values this module accepts', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const match = html.match(/<select id="mode">(.*?)<\/select>/);
  assert.ok(match, 'expected to find the mode select in index.html');
  const options = [...match[1].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(options, MODE_VALUES);
});

test('drops unknown fields, a negative number, and an invalid mode rather than guessing', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', revenue: -1, mode: 'sideways' });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('revenue' in decoded, false);
  assert.equal('mode' in decoded, false);
  assert.equal(decoded.stops, 6);
});

test('accepts a hash or query prefix', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
});

test('non-string or empty input decodes to an empty object rather than throwing', () => {
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(''), {});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, METHOD_VALUES, STAIN_VALUES,
} from './share.mjs';

const sample = {
  floorSqFt: 800,
  treads: 12,
  closets: 2,
  hoursPer100: 8,
  hoursPerTread: 0.4,
  hoursPerCloset: 1,
  methodLaborFactor: 1,
  stainHoursPer100: 1.8,
  extraCoats: 1,
  extraCoatHoursPer100: 1.2,
  furnitureHours: 3,
  repairHours: 1.5,
  baseCoats: 3,
  finishCoverage: 450,
  stainCoverage: 500,
  finishCost: 85,
  stainCost: 45,
  suppliesPer100: 18,
  hourlyWage: 42,
  burdenRate: 30,
  travelAndEquipment: 185,
  overheadRate: 15,
  targetMargin: 25,
  proposedPrice: 6400,
  methodId: 'full_sand',
  stainId: 'color_change',
  staining: true,
};

test('round-trips every field the form reads', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('round-trips a job with no optional price and staining off', () => {
  const { proposedPrice, ...rest } = sample;
  const noStain = { ...rest, staining: false, stainId: 'poly_only' };
  assert.deepEqual(decodeInputs(encodeInputs(noStain)), noStain);
});

test('field list matches the FIELD_IDS array index.html actually wires into the form', () => {
  // A field present here but missing from the page's FIELD_IDS array silently
  // drops out of the render/read loop; a field present there but missing here
  // silently drops off a shared link -- the same drift class a select field
  // left off an allowlist caused on the paver-patio/roofing calculators
  // (#2962). Kept in sync by assertion rather than by hand.
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const match = html.match(/const FIELD_IDS = \[([^\]]+)\]/);
  assert.ok(match, 'expected to find the FIELD_IDS array in index.html');
  const pageIds = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  assert.deepEqual([...NUMBER_FIELD_IDS].sort(), [...pageIds].sort());
});

test('the staining checkbox this module encodes is the one the page reads', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="staining" type="checkbox"/);
  assert.deepEqual(BOOLEAN_FIELD_IDS, ['staining']);
});

test('the methodId and stainId selects on the page only ever offer the values this module accepts', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const methodMatch = html.match(/<select id="methodId">([\s\S]*?)<\/select>/);
  const stainMatch = html.match(/<select id="stainId">([\s\S]*?)<\/select>/);
  assert.ok(methodMatch, 'expected to find the methodId select in index.html');
  assert.ok(stainMatch, 'expected to find the stainId select in index.html');
  const methodOptions = [...methodMatch[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  const stainOptions = [...stainMatch[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(methodOptions, METHOD_VALUES);
  assert.deepEqual(stainOptions, STAIN_VALUES);
});

test('drops unknown fields, a negative number, and an invalid enum rather than guessing', () => {
  const encoded = encodeInputs({
    ...sample, secret: 'nope', floorSqFt: -1, methodId: 'sideways', stainId: 'invisible',
  });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('floorSqFt' in decoded, false);
  assert.equal('methodId' in decoded, false);
  assert.equal('stainId' in decoded, false);
  assert.equal(decoded.treads, 12);
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

test('a zero value round-trips (the form itself, not this module, enforces per-field minimums)', () => {
  const encoded = encodeInputs({ ...sample, extraCoats: 0, treads: 0 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.extraCoats, 0);
  assert.equal(decoded.treads, 0);
});

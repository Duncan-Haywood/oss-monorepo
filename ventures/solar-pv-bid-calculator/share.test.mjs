// What a solar PV bid link carries, and what it refuses to carry.
//
// These are pure -- no DOM -- because `share.mjs` is. The tie to the page
// itself (that the button exists, that the terms ride along, that a preset
// change cannot overwrite restored figures) is asserted in `page.test.mjs`
// against the page source, and the tie between the terms named here and the
// ones the proposal panel offers is `platform/proposal/term-ids.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, ENUM_FIELDS } from './share.mjs';
import { ROOF_PRESETS, ELECTRICAL_PRESETS, SYSTEM_PRESETS } from './calc.mjs';

const FULL_BID = {
  moduleCount: 26,
  wattsPerModule: 390,
  moduleCostEach: 178,
  inverterCost: 2400,
  rackingPerModule: 62,
  bosPerWatt: 0.21,
  roofFactor: 1.45,
  laborHoursPerKw: 5.5,
  electricalHours: 8,
  electricalMaterial: 1800,
  batteryHours: 6,
  batteryMaterial: 9200,
  hourlyWage: 46,
  burdenRate: 34,
  permitAndInterconnection: 1250,
  designEngineering: 900,
  travelDumpsterLift: 780,
  overheadRate: 19,
  targetMargin: 28,
  proposedPrice: 31500,
  roofPreset: 'tile',
  electricalPreset: 'upgrade-200',
  systemPreset: '2',
};

test('a round trip keeps every rate and every select, not just the headline fields', () => {
  const restored = decodeInputs(encodeInputs(FULL_BID));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(restored[id], FULL_BID[id], `${id} did not survive the round trip`);
  }
  for (const id of Object.keys(ENUM_FIELDS)) {
    assert.equal(restored[id], FULL_BID[id], `${id} did not survive the round trip`);
  }
  assert.equal(Object.keys(restored).length, NUMBER_FIELD_IDS.length + Object.keys(ENUM_FIELDS).length);
});

test('the field list matches the ids index.html actually collects', async () => {
  const page = await readFile(new URL('index.html', import.meta.url), 'utf8');
  const declared = page.match(/const FIELD_IDS = \[([\s\S]*?)\];/);
  assert.ok(declared, 'index.html no longer declares FIELD_IDS; this test needs rewriting, not deleting');
  const pageIds = declared[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual([...NUMBER_FIELD_IDS].sort(), [...pageIds].sort(),
    'share.mjs and index.html disagree about which numbers the form collects, '
    + 'so a shared link drops or invents a field');
});

test('the enum values come from calc.mjs, so they cannot drift from the form options', () => {
  assert.deepEqual(ENUM_FIELDS.roofPreset, ROOF_PRESETS.map((preset) => preset.id));
  assert.deepEqual(ENUM_FIELDS.electricalPreset, ELECTRICAL_PRESETS.map((preset) => preset.id));
  // `systemPreset` is keyed by array index because `fillSelect` gives it
  // `String(index)` -- an id-based allowlist here would reject every value.
  assert.deepEqual(ENUM_FIELDS.systemPreset, SYSTEM_PRESETS.map((_, index) => String(index)));
});

test('a crafted link cannot set a select to anything the form could not produce', () => {
  assert.deepEqual(decodeInputs('roofPreset=../../etc/passwd'), {});
  assert.deepEqual(decodeInputs('electricalPreset=<script>'), {});
  // One past the end of the preset array, which is the off-by-one a stale
  // link produces after a preset is removed.
  assert.deepEqual(decodeInputs(`systemPreset=${SYSTEM_PRESETS.length}`), {});
  assert.deepEqual(decodeInputs('systemPreset=-1'), {});
});

test('unknown fields are ignored rather than written back into the form', () => {
  assert.deepEqual(decodeInputs('moduleCount=26&usageOptOut=1&companyName=Acme&__proto__=x'),
    { moduleCount: 26 });
});

test('the recipient privacy setting is not shareable', () => {
  // A link that carried `usageOptOut` would let a sender silently re-enable
  // counting in someone else's browser.
  assert.ok(!NUMBER_FIELD_IDS.includes('usageOptOut'));
  assert.ok(!Object.keys(ENUM_FIELDS).includes('usageOptOut'));
  assert.equal(encodeInputs({ ...FULL_BID, usageOptOut: true }).includes('usageOptOut'), false);
});

test('negative and non-numeric values are refused in both directions', () => {
  assert.deepEqual(decodeInputs('moduleCount=-4'), {});
  assert.deepEqual(decodeInputs('moduleCount=NaN'), {});
  assert.deepEqual(decodeInputs('moduleCount=Infinity'), {});
  assert.deepEqual(decodeInputs('hourlyWage=forty'), {});
  assert.equal(encodeInputs({ moduleCount: -4, hourlyWage: 'forty' }), '');
});

test('a zero is carried rather than treated as absent', () => {
  // `electricalHours: 0` is the "no electrical work" case and is a real answer,
  // not a missing one -- dropping it would reopen the bid at the default.
  assert.equal(decodeInputs(encodeInputs({ electricalHours: 0 })).electricalHours, 0);
});

test('a hash or query prefix is accepted, and junk yields an empty bid', () => {
  const encoded = encodeInputs({ moduleCount: 26 });
  assert.deepEqual(decodeInputs(`#${encoded}`), { moduleCount: 26 });
  assert.deepEqual(decodeInputs(`?${encoded}`), { moduleCount: 26 });
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('not a query string'), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

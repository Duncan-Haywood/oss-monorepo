import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DENSITY_FIELD_ID,
  FIELD_IDS,
  PROPOSAL_TERM_NUMBERS,
  PROPOSAL_TERM_TEXT,
  decodeInputs,
  encodeInputs,
  shareUrl,
} from './share.mjs';
import { DENSITY_CLASSES, priceJob } from './calc.mjs';

/** The page's own shipped defaults (medium-brush), as strings from the form. */
const DEFAULTS = {
  acres: '3', largestStemInches: '8', terrainFactorPct: '85', headWidthFt: '6',
  headRatedStemInches: '8', advanceFtPerMin: '42', passes: '1', cuttingEfficiencyPct: '80',
  workHoursPerDay: '8', operatorWagePerHour: '45', fuelGallonsPerHour: '5',
  fuelPricePerGallon: '3.9', toothSetCost: '1800', toothSetLifeHours: '250',
  maintenancePerHour: '12', machinePaymentMonthly: '2400', insuranceAnnual: '4800',
  billableHoursPerMonth: '70', mobilizationTrips: '1', mobilizationHoursEach: '2.5',
  mobilizationMilesEach: '70', truckCostPerMile: '1.35', otherCosts: '0',
  targetMarginPct: '35', quotedPerAcre: '1000', density: 'medium-brush',
};

function roundTrip(inputs) {
  return decodeInputs(`#${encodeInputs(inputs)}`);
}

// ---------------------------------------------------------------------------
// The field list is the contract with the page
// ---------------------------------------------------------------------------

test('the field list has one entry per numeric input the form collects', () => {
  assert.equal(FIELD_IDS.length, 25);
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length, 'no duplicate field id');
});

test('every recognised density preset round-trips, and an unknown one is dropped', () => {
  for (const id of [...Object.keys(DENSITY_CLASSES), 'custom']) {
    assert.equal(roundTrip({ [DENSITY_FIELD_ID]: id })[DENSITY_FIELD_ID], id);
  }
  assert.equal(DENSITY_FIELD_ID in roundTrip({ [DENSITY_FIELD_ID]: 'old-growth' }), false);
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

test('the shipped defaults survive a round trip', () => {
  const decoded = roundTrip(DEFAULTS);
  for (const id of FIELD_IDS) assert.equal(decoded[id], Number(DEFAULTS[id]), id);
  assert.equal(decoded.density, 'medium-brush');
});

test('the recipient prices the same job the sender did', () => {
  const decoded = roundTrip(DEFAULTS);
  const { density: _density, ...jobInputs } = decoded;
  assert.deepEqual(priceJob(jobInputs), priceJob({
    ...Object.fromEntries(FIELD_IDS.map((id) => [id, Number(DEFAULTS[id])])),
  }));
});

test('a job with every field pushed to its edge still round-trips', () => {
  const edge = {
    acres: '0.05', largestStemInches: '0', terrainFactorPct: '10', headWidthFt: '20',
    headRatedStemInches: '40', advanceFtPerMin: '400', passes: '6', cuttingEfficiencyPct: '100',
    workHoursPerDay: '24', operatorWagePerHour: '500', fuelGallonsPerHour: '60',
    fuelPricePerGallon: '30', toothSetCost: '20000', toothSetLifeHours: '5000',
    maintenancePerHour: '500', machinePaymentMonthly: '100000', insuranceAnnual: '200000',
    billableHoursPerMonth: '730', mobilizationTrips: '40', mobilizationHoursEach: '48',
    mobilizationMilesEach: '3000', truckCostPerMile: '30', otherCosts: '1000000',
    targetMarginPct: '95', quotedPerAcre: '1000000', density: 'heavy-timber',
  };
  const decoded = roundTrip(edge);
  for (const id of FIELD_IDS) assert.equal(decoded[id], Number(edge[id]), id);
  assert.doesNotThrow(() => priceJob(decoded));
});

test('zero round-trips as zero rather than vanishing', () => {
  // Number('') is 0, so "not entered" and "entered as zero" collapse to the
  // same value downstream -- but "no other job costs" is a real answer this
  // link must be able to carry, not an absence to fall back past.
  const decoded = roundTrip({ ...DEFAULTS, otherCosts: '0', largestStemInches: '0' });
  assert.equal(decoded.otherCosts, 0);
  assert.equal(decoded.largestStemInches, 0);
});

// ---------------------------------------------------------------------------
// Damaged, hostile, and hand-edited links
// ---------------------------------------------------------------------------

test('a link that lost its fragment marker still opens', () => {
  const payload = encodeInputs(DEFAULTS);
  assert.deepEqual(decodeInputs(`?${payload}`), decodeInputs(`#${payload}`));
  assert.deepEqual(decodeInputs(payload), decodeInputs(`#${payload}`));
});

test('junk in a link is dropped rather than thrown', () => {
  for (const source of ['', '#', '?', '#acres=abc', '#acres=-4', '#unknown=1', '#acres=NaN', '#quotedPerAcre=Infinity']) {
    const decoded = decodeInputs(source);
    assert.equal(typeof decoded, 'object');
    for (const [id, value] of Object.entries(decoded)) {
      if (id === DENSITY_FIELD_ID) continue;
      assert.ok(Number.isFinite(value), id);
    }
  }
  assert.deepEqual(decodeInputs('#unknown=1&acres=abc'), {});
});

test('a non-string source decodes to nothing', () => {
  for (const source of [undefined, null, 42, {}, []]) {
    assert.deepEqual(decodeInputs(source), {});
  }
});

test('one bad field is dropped without taking a good sibling down with it', () => {
  const decoded = decodeInputs('#acres=4&headWidthFt=oops&passes=2');
  assert.deepEqual(decoded, { acres: 4, passes: 2 });
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

test('shareUrl keeps the page address and replaces only the fragment', () => {
  const url = shareUrl(
    { origin: 'https://marisstella.dev', pathname: '/tools/forestry-mulching-bid-calculator/', search: '', hash: '#stale=1' },
    DEFAULTS,
  );
  assert.ok(url.startsWith('https://marisstella.dev/tools/forestry-mulching-bid-calculator/#'));
  assert.ok(!url.includes('stale=1'), 'a link copied from a shared page must not carry the old payload');
  assert.deepEqual(decodeInputs(new URL(url).hash), roundTrip(DEFAULTS));
});

test('shareUrl preserves an existing query string', () => {
  const url = shareUrl(
    { origin: 'https://marisstella.dev', pathname: '/tools/forestry-mulching-bid-calculator/', search: '?ref=email' },
    DEFAULTS,
  );
  assert.ok(url.includes('?ref=email#'), url);
});

test('shareUrl tolerates a location object with nothing on it', () => {
  assert.equal(typeof shareUrl({}, DEFAULTS), 'string');
  assert.equal(typeof shareUrl(undefined, DEFAULTS), 'string');
});

test('the payload carries only the fields the page declares, even if handed extras', () => {
  const params = new URLSearchParams(encodeInputs({ ...DEFAULTS, companyName: 'Ridgeline Land Clearing LLC' }));
  assert.deepEqual([...params.keys()].sort(), [...FIELD_IDS, DENSITY_FIELD_ID].sort());
});

// ---------------------------------------------------------------------------
// The proposal panel's terms -- platform/proposal/term-ids.test.mjs guards
// this repo-wide: a venture with a proposal panel must not drop its deposit
// and terms from the link, or the recipient prices the sender's job under
// their own default deposit and price-hold window.
// ---------------------------------------------------------------------------

const TERMS = {
  depositPercent: '50',
  validDays: '15',
  paymentTerms: 'Half on acceptance, half on completion.',
  proposalNotes: 'Gate code changes weekly; call before the truck arrives.',
  proposalExclusions: 'Stump grinding\nHauling the mulch mat',
};

test('the proposal panel field lists are exactly what adopt.mjs offers', () => {
  // platform/proposal/term-ids.test.mjs checks this module's source text for
  // all five ids; this checks the module's actual exported behaviour agrees.
  assert.deepEqual([...PROPOSAL_TERM_NUMBERS], ['depositPercent', 'validDays']);
  assert.deepEqual([...PROPOSAL_TERM_TEXT], ['paymentTerms', 'proposalNotes', 'proposalExclusions']);
});

test('a sender\'s deposit, price-hold, and terms all survive the round trip', () => {
  const decoded = roundTrip({ ...DEFAULTS, ...TERMS });
  assert.equal(decoded.depositPercent, 50);
  assert.equal(decoded.validDays, 15);
  assert.equal(decoded.paymentTerms, TERMS.paymentTerms);
  assert.equal(decoded.proposalNotes, TERMS.proposalNotes);
  assert.equal(decoded.proposalExclusions, TERMS.proposalExclusions);
});

test('a deposit or price-hold outside its own bounds is dropped, not clamped', () => {
  for (const bad of [{ depositPercent: '140' }, { depositPercent: '-5' }, { validDays: '400' }, { validDays: '-1' }]) {
    const decoded = roundTrip({ ...DEFAULTS, ...bad });
    for (const id of Object.keys(bad)) assert.equal(id in decoded, false, id);
  }
});

test('an untouched proposal panel sends no terms at all', () => {
  const params = new URLSearchParams(encodeInputs(DEFAULTS));
  for (const id of [...PROPOSAL_TERM_NUMBERS, ...PROPOSAL_TERM_TEXT]) {
    assert.equal(params.has(id), false, `${id} should be absent when the sender never opened the proposal panel`);
  }
});

test('multi-line exclusions survive intact, including the line breaks', () => {
  const decoded = roundTrip({ ...DEFAULTS, proposalExclusions: 'Line one\nLine two\nLine three' });
  assert.equal(decoded.proposalExclusions, 'Line one\nLine two\nLine three');
});

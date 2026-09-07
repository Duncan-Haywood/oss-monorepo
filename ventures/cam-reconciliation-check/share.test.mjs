import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_IDS,
  GROSS_UP_DEFAULTS,
  GROSS_UP_FIELD_IDS,
  STATEMENT_FIELD_IDS,
  decodeInputs,
  encodeInputs,
  hasGrossUp,
  shareUrl,
} from './share.mjs';
import { parseInputs, reconcile } from './calc.mjs';

/** The page's own defaults, as `index.html` ships them. */
const DEFAULTS = {
  annualExpenses: '120000',
  rentableArea: '10000',
  tenantArea: '1000',
  billedAmount: '10000',
  credits: '500',
  variablePercent: '',
  actualOccupancyPercent: '',
  targetOccupancyPercent: '',
};

/** A statement with a real gross-up clause engaged. */
const GROSSED_UP = {
  annualExpenses: '312500',
  rentableArea: '48000',
  tenantArea: '3200',
  billedAmount: '19800',
  credits: '1200',
  variablePercent: '45',
  actualOccupancyPercent: '78',
  targetOccupancyPercent: '95',
};

function roundTrip(inputs) {
  return decodeInputs(`#${encodeInputs(inputs)}`);
}

// ---------------------------------------------------------------------------
// The field list is the contract with the page
// ---------------------------------------------------------------------------

test('every field the calculation reads rides in the link', () => {
  // `parseInputs` is the authority on what the calculation consumes. If a
  // field is added there and not here, a share link silently drops it -- the
  // exact failure this venture cannot afford, because a dropped input changes
  // the variance with nothing on screen to say so.
  const required = ['annualExpenses', 'rentableArea', 'tenantArea', 'billedAmount', 'credits'];
  const optional = ['variablePercent', 'actualOccupancyPercent', 'targetOccupancyPercent'];
  assert.deepEqual([...STATEMENT_FIELD_IDS], required);
  assert.deepEqual([...GROSS_UP_FIELD_IDS], optional);
  assert.deepEqual([...FIELD_IDS], [...required, ...optional]);
});

test('the usage preference never travels in a link', () => {
  const encoded = encodeInputs({ ...DEFAULTS, usage: 'false' });
  assert.ok(!encoded.includes('usage'), 'a sender must not set the recipient\'s counting preference');
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

test('the page defaults survive a round trip', () => {
  assert.deepEqual(roundTrip(DEFAULTS), {
    annualExpenses: 120000,
    rentableArea: 10000,
    tenantArea: 1000,
    billedAmount: 10000,
    credits: 500,
  });
});

test('a grossed-up statement survives a round trip', () => {
  assert.deepEqual(roundTrip(GROSSED_UP), {
    annualExpenses: 312500,
    rentableArea: 48000,
    tenantArea: 3200,
    billedAmount: 19800,
    credits: 1200,
    variablePercent: 45,
    actualOccupancyPercent: 78,
    targetOccupancyPercent: 95,
  });
});

test('the recipient computes the same variance the sender saw', () => {
  const sender = parseInputs(GROSSED_UP);
  assert.ok(sender.ok, sender.errors?.join('\n'));
  const recipient = parseInputs(roundTrip(GROSSED_UP));
  assert.ok(recipient.ok, recipient.errors?.join('\n'));
  assert.deepEqual(reconcile(recipient.values), reconcile(sender.values));
});

test('a decoded link is always something parseInputs accepts', () => {
  // A link can only ever open the page on figures its own validator would
  // allow; otherwise the recipient lands on an error they did not cause and
  // cannot fix without knowing what the sender typed.
  for (const inputs of [DEFAULTS, GROSSED_UP]) {
    assert.equal(parseInputs(roundTrip(inputs)).ok, true);
  }
});

test('zero credits round-trip as zero rather than vanishing', () => {
  // Number('') is 0, so "not entered" and "entered as zero" are the same value
  // downstream -- but they are different statements about the landlord's bill,
  // and a link that drops an explicit 0 hands the recipient the page default
  // of $500 in credits instead.
  const decoded = roundTrip({ ...DEFAULTS, credits: '0' });
  assert.equal(decoded.credits, 0);
});

// ---------------------------------------------------------------------------
// The gross-up trio is atomic
// ---------------------------------------------------------------------------

test('touching any gross-up field sends all three explicitly', () => {
  const params = new URLSearchParams(encodeInputs({ ...DEFAULTS, variablePercent: '40' }));
  assert.equal(params.get('variablePercent'), '40');
  assert.equal(params.get('actualOccupancyPercent'), String(GROSS_UP_DEFAULTS.actualOccupancyPercent));
  assert.equal(params.get('targetOccupancyPercent'), String(GROSS_UP_DEFAULTS.targetOccupancyPercent));
});

test('an untouched gross-up section sends nothing', () => {
  const params = new URLSearchParams(encodeInputs(DEFAULTS));
  for (const id of GROSS_UP_FIELD_IDS) {
    assert.equal(params.has(id), false, `${id} should be absent when the sender never opened the section`);
  }
});

test('hasGrossUp reports engagement, not effect', () => {
  assert.equal(hasGrossUp(DEFAULTS), false);
  assert.equal(hasGrossUp(GROSSED_UP), true);
  // A 40% variable share with occupancy left alone changes no figure, but the
  // sender said something about the lease and the recipient should see it.
  assert.equal(hasGrossUp({ ...DEFAULTS, variablePercent: '40' }), true);
});

test('a truncated gross-up never grosses up harder than the sender did', () => {
  // The failure this grouping exists for. Drop `targetOccupancyPercent` from a
  // 45%/78%/95% link and a naive decoder leaves the other two in place; the
  // blank target then falls back to 100%, grossing the variable pool to a
  // target the lease never allowed and overstating the tenant's share.
  const full = new URLSearchParams(encodeInputs(GROSSED_UP));
  full.delete('targetOccupancyPercent');
  const decoded = decodeInputs(`#${full.toString()}`);

  for (const id of GROSS_UP_FIELD_IDS) {
    assert.equal(id in decoded, false, `${id} survived a broken trio`);
  }

  const damaged = reconcile(parseInputs(decoded).values);
  const intended = reconcile(parseInputs(GROSSED_UP).values);
  assert.equal(damaged.grossUpApplied, false);
  assert.ok(
    damaged.modeledShare < intended.modeledShare,
    'a damaged link must understate the adjustment, never overstate it',
  );
});

test('an out-of-range occupancy drops the whole trio', () => {
  for (const bad of [{ actualOccupancyPercent: '0' }, { targetOccupancyPercent: '140' }, { variablePercent: '-5' }]) {
    const params = new URLSearchParams(encodeInputs(GROSSED_UP));
    for (const [id, value] of Object.entries(bad)) params.set(id, value);
    const decoded = decodeInputs(`#${params.toString()}`);
    for (const id of GROSS_UP_FIELD_IDS) {
      assert.equal(id in decoded, false, `${id} survived alongside ${JSON.stringify(bad)}`);
    }
    assert.equal(parseInputs(decoded).ok, true);
  }
});

// ---------------------------------------------------------------------------
// Damaged, hostile, and hand-edited links
// ---------------------------------------------------------------------------

test('a link that lost its fragment marker still opens', () => {
  // Messaging apps and email clients rewrite URLs. Accepting a query string
  // as well as a fragment costs one line and saves a paste that would
  // otherwise open the page on its own defaults with no sign of a problem.
  const payload = encodeInputs(GROSSED_UP);
  assert.deepEqual(decodeInputs(`?${payload}`), decodeInputs(`#${payload}`));
  assert.deepEqual(decodeInputs(payload), decodeInputs(`#${payload}`));
});

test('junk in a link is dropped rather than thrown', () => {
  for (const source of ['', '#', '?', '#annualExpenses=abc', '#tenantArea=-40', '#unknown=1', '#annualExpenses=NaN', '#credits=Infinity']) {
    const decoded = decodeInputs(source);
    assert.equal(typeof decoded, 'object');
    for (const value of Object.values(decoded)) assert.ok(Number.isFinite(value));
  }
  assert.deepEqual(decodeInputs('#unknown=1&annualExpenses=abc'), {});
});

test('a non-string source decodes to nothing', () => {
  for (const source of [undefined, null, 42, {}, []]) {
    assert.deepEqual(decodeInputs(source), {});
  }
});

test('a surviving statement figure is kept when a sibling is damaged', () => {
  // Statement figures are independent: each has its own visible box, so an
  // empty one asks the recipient a question rather than hiding a bias.
  const decoded = decodeInputs('#annualExpenses=250000&rentableArea=oops&tenantArea=2500');
  assert.deepEqual(decoded, { annualExpenses: 250000, tenantArea: 2500 });
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

test('shareUrl keeps the page address and replaces only the fragment', () => {
  const url = shareUrl(
    { origin: 'https://marisstella.dev', pathname: '/tools/cam-reconciliation-check/', search: '', hash: '#stale=1' },
    DEFAULTS,
  );
  assert.ok(url.startsWith('https://marisstella.dev/tools/cam-reconciliation-check/#'));
  assert.ok(!url.includes('stale=1'), 'a link copied from a shared page must not carry the old payload');
  assert.deepEqual(decodeInputs(new URL(url).hash), roundTrip(DEFAULTS));
});

test('shareUrl preserves an existing query string', () => {
  const url = shareUrl(
    { origin: 'https://marisstella.dev', pathname: '/tools/cam-reconciliation-check/', search: '?ref=email' },
    DEFAULTS,
  );
  assert.ok(url.includes('?ref=email#'), url);
});

test('shareUrl tolerates a location object with nothing on it', () => {
  assert.equal(typeof shareUrl({}, DEFAULTS), 'string');
  assert.equal(typeof shareUrl(undefined, DEFAULTS), 'string');
});

test('the payload carries no lease identity, only figures', () => {
  // The venture's promise is that nothing identifying leaves the browser. The
  // page collects no address, tenant name, or suite number, and the link must
  // not become the place one arrives.
  const params = new URLSearchParams(encodeInputs({ ...GROSSED_UP, tenantName: 'Ridgeline Dental', suite: '204' }));
  assert.deepEqual([...params.keys()].sort(), [...FIELD_IDS].sort());
});

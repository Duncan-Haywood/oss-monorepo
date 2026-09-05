import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeBid,
  decodeBid,
  saveBid,
  loadBid,
  clearBid,
  restoreBid,
  withProposalTerms,
  readProposalTerms,
  overlongTerms,
  overlongTermsNote,
  MAX_TERM_TEXT,
  PROPOSAL_TERM_NUMBERS,
  PROPOSAL_TERM_TEXT,
} from './share.mjs';
import { UNIT_PRESETS } from './calc.mjs';

// These exercise the transform, so the spec below is a stand-in rather than
// this venture's real field list. That split is deliberate: a unit test that
// restated the form's fields would be a second copy of them to keep in sync —
// exactly the drift this module exists to avoid. The tie between the real
// form and what a link carries is asserted in `page.test.mjs`, against the
// page source itself.
const SPEC = {
  key: 'saved-bid',
  numbers: ['area', 'wage', 'margin'],
  flags: ['extraA', 'extraB'],
  choices: { scope: ['basic', 'standard', 'full'], grade: ['plain', 'fancy'] },
};

// A fake storage that behaves like localStorage, including the throwing kind a
// browser with site data blocked hands back.
function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: key => { if (throws) throw new Error('blocked'); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { if (throws) throw new Error('blocked'); map.set(key, String(value)); },
    removeItem: key => { if (throws) throw new Error('blocked'); map.delete(key); },
    size: () => map.size,
  };
}

test('a full bid round-trips through a link unchanged', () => {
  const values = {
    scope: 'full',
    grade: 'fancy',
    area: '48',
    wage: '62.5',
    margin: '22',
    extraA: true,
    extraB: false,
  };
  assert.deepEqual(decodeBid(SPEC, encodeBid(SPEC, values)), {
    scope: 'full',
    grade: 'fancy',
    area: '48',
    wage: '62.5',
    margin: '22',
    extraA: true,
    extraB: false,
  });
});

test('encoding is stable, so a copied link does not churn between visits', () => {
  const values = { area: '48', scope: 'basic', extraA: true };
  assert.equal(encodeBid(SPEC, values), encodeBid(SPEC, { ...values }));
});

test('a false flag survives rather than being dropped as falsy', () => {
  const encoded = encodeBid(SPEC, { extraA: false, extraB: true });
  assert.equal(decodeBid(SPEC, encoded).extraA, false);
  assert.equal(decodeBid(SPEC, encoded).extraB, true);
});

test('a blank field is left out instead of encoding an empty string', () => {
  const encoded = encodeBid(SPEC, { area: '', wage: '55' });
  assert.equal(encoded.includes('area'), false);
  assert.deepEqual(decodeBid(SPEC, encoded), { wage: '55' });
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeBid(SPEC, '?area=30'), { area: '30' });
  assert.deepEqual(decodeBid(SPEC, '#area=30'), { area: '30' });
});

test('a crafted link cannot set a select to an option the form does not offer', () => {
  assert.deepEqual(decodeBid(SPEC, 'scope=free-labour&grade=plain'), { grade: 'plain' });
});

test('a crafted link cannot inject an unknown field or a bad number', () => {
  assert.deepEqual(
    decodeBid(SPEC, 'area=-40&wage=abc&margin=18&sneakyRate=999'),
    { margin: '18' },
  );
});

test('non-string input decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeBid(SPEC, null), {});
  assert.deepEqual(decodeBid(SPEC, undefined), {});
  assert.deepEqual(decodeBid(SPEC, 42), {});
});

test('a saved bid comes back on the next visit', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '48', scope: 'standard', extraA: true });
  assert.deepEqual(loadBid(storage, SPEC), { scope: 'standard', area: '48', extraA: true });
});

test('clearing removes the saved bid', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '48' });
  clearBid(storage, SPEC);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(storage.size(), 0);
});

test('storage that throws never takes the page down with it', () => {
  const storage = fakeStorage({ throws: true });
  assert.equal(saveBid(storage, SPEC, { area: '48' }), false);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(clearBid(storage, SPEC), false);
});

test('a stored blob from another version, or hand-edited, is ignored', () => {
  const storage = fakeStorage();
  storage.setItem(SPEC.key, JSON.stringify({ v: 99, values: { area: '48' } }));
  assert.deepEqual(loadBid(storage, SPEC), {});
  storage.setItem(SPEC.key, 'not json at all');
  assert.deepEqual(loadBid(storage, SPEC), {});
});

test('a link beats a saved bid, because an opened link is what the visitor meant to see', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '10' });
  const restored = restoreBid(SPEC, { search: '?area=48', storage });
  assert.deepEqual(restored.values, { area: '48' });
  assert.equal(restored.source, 'link');
});

test('a plain visit falls back to the saved bid', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '10' });
  const restored = restoreBid(SPEC, { search: '', storage });
  assert.deepEqual(restored.values, { area: '10' });
  assert.equal(restored.source, 'storage');
});

test('a first visit restores nothing and says so', () => {
  const restored = restoreBid(SPEC, { search: '', storage: fakeStorage() });
  assert.deepEqual(restored.values, {});
  assert.equal(restored.source, 'none');
});

// A form whose shape the visitor sets — a portable-restroom event fleet is a
// list of unit-type rows, and there is no fixed count of them — has no fixed
// field list to name, so `rows` carries it. This is the shape this venture's
// real `BID_SPEC` actually uses, below.
const ROW_SPEC = {
  key: 'saved-bid',
  numbers: ['wage'],
  flags: [],
  choices: {},
  rows: {
    param: 'units',
    fields: [
      { key: 'type', kind: 'choice', options: ['standard', 'ada', 'other'] },
      { key: 'quantity', kind: 'number' },
      { key: 'rentPerDay', kind: 'number' },
    ],
  },
};

test('a fleet of unit-type rows round-trips', () => {
  const values = {
    wage: '19',
    units: [
      { type: 'standard', quantity: '4', rentPerDay: '18' },
      { type: 'ada', quantity: '1', rentPerDay: '40' },
    ],
  };
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, values)), values);
});

test('rows keep their order, because a quote read back shuffled is a different quote', () => {
  const units = [
    { type: 'standard', quantity: '1', rentPerDay: '10' },
    { type: 'ada', quantity: '2', rentPerDay: '20' },
    { type: 'other', quantity: '3', rentPerDay: '30' },
  ];
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, { units })).units, units);
});

test('a bad cell drops out without taking the rest of its row with it', () => {
  const decoded = decodeBid(ROW_SPEC, 'units=standard:-5:18');
  assert.deepEqual(decoded.units, [{ type: 'standard', rentPerDay: '18' }]);
});

test('a crafted row cannot set a unit type the form does not offer', () => {
  const decoded = decodeBid(ROW_SPEC, 'units=trailer:4:280');
  assert.deepEqual(decoded.units, [{ quantity: '4', rentPerDay: '280' }]);
});

test('an entirely empty row is dropped rather than added to the form', () => {
  assert.equal(decodeBid(ROW_SPEC, 'units=::').units, undefined);
  assert.equal(encodeBid(ROW_SPEC, { units: [{}, {}] }).includes('units'), false);
});

test('a link cannot grow the form without limit', () => {
  const huge = Array.from({ length: 5000 }, () => 'standard:1:18').join(',');
  assert.equal(decodeBid(ROW_SPEC, `units=${huge}`).units.length, 200);
});

test('rows survive a save and reload', () => {
  const storage = fakeStorage();
  const units = [{ type: 'ada', quantity: '1', rentPerDay: '40' }];
  saveBid(storage, ROW_SPEC, { wage: '19', units });
  assert.deepEqual(loadBid(storage, ROW_SPEC), { wage: '19', units });
});

// ---- This venture's actual field list --------------------------------------
//
// A portable-restroom event quote is priced as a fixed cost block (days on
// site, service visits, haul fees, mileage, overhead, target margin, plus the
// optional attendance/duration/alcohol/food-service fields the fleet
// suggestion reads) plus a visitor-grown list of unit-type rows, one per
// fleet line. That is exactly what `rows` exists for: `EVENT_QUOTE_SPEC`
// mirrors `BID_SPEC` in `index.html`, with the unit-type choice validated
// against `calc.mjs`'s own `UNIT_PRESETS` rather than a hand-copied list of
// option strings.
const COST_IDS = [
  'daysOnSite', 'serviceVisits', 'deliveryFee', 'pickupFee', 'milesOneWay', 'ratePerMile',
  'weekendPremiumPct', 'consumablesPerUnit', 'otherCost', 'overheadRate', 'targetMargin', 'proposedPrice',
];
const EVENT_IDS = ['attendees', 'eventHours'];
const EVENT_QUOTE_SPEC = {
  key: 'portable-restroom-event-quote-bid',
  numbers: [...COST_IDS, ...EVENT_IDS],
  flags: ['alcohol', 'foodService'],
  choices: {},
  rows: {
    param: 'units',
    fields: [
      { key: 'type', kind: 'choice', options: UNIT_PRESETS.map((_, index) => String(index)).concat('other') },
      { key: 'quantity', kind: 'number' },
      { key: 'rentPerDay', kind: 'number' },
      { key: 'serviceEach', kind: 'number' },
    ],
  },
};

test('the real quote round-trips: every cost, every event field, every unit row', () => {
  const values = {
    daysOnSite: '3',
    serviceVisits: '1',
    deliveryFee: '85',
    pickupFee: '85',
    milesOneWay: '18',
    ratePerMile: '3.5',
    weekendPremiumPct: '0',
    consumablesPerUnit: '8',
    otherCost: '0',
    overheadRate: '12',
    targetMargin: '25',
    proposedPrice: '625',
    attendees: '200',
    eventHours: '6',
    alcohol: true,
    foodService: false,
    units: [
      { type: '0', quantity: '4', rentPerDay: '18', serviceEach: '28' },
      { type: '1', quantity: '1', rentPerDay: '40', serviceEach: '38' },
      { type: 'other', quantity: '2', rentPerDay: '22', serviceEach: '22' },
    ],
  };
  assert.deepEqual(decodeBid(EVENT_QUOTE_SPEC, encodeBid(EVENT_QUOTE_SPEC, values)), values);
});

test('a crafted link cannot set a unit type the calculator has no rates for', () => {
  // The row keeps every cell it can still validate; only the unoffered unit
  // type is dropped, exactly as an unoffered top-level choice would be.
  const decoded = decodeBid(EVENT_QUOTE_SPEC, 'units=99:4:18:28&daysOnSite=3');
  assert.deepEqual(decoded, {
    daysOnSite: '3',
    units: [{ quantity: '4', rentPerDay: '18', serviceEach: '28' }],
  });
});

test('a stale link from before a preset was added still decodes the fields it recognises', () => {
  // Simulates a link built against a longer UNIT_PRESETS array than this
  // build offers: the row keeps its numbers and drops only the option this
  // build no longer has, and a sibling row with a valid type is untouched.
  const decoded = decodeBid(EVENT_QUOTE_SPEC, 'units=12:4:18:28,0:1:18:28');
  assert.deepEqual(decoded.units, [
    { quantity: '4', rentPerDay: '18', serviceEach: '28' },
    { type: '0', quantity: '1', rentPerDay: '18', serviceEach: '28' },
  ]);
});

test('a negative or non-numeric field is rejected rather than pricing a nonsense quote', () => {
  const decoded = decodeBid(EVENT_QUOTE_SPEC, 'daysOnSite=-5&ratePerMile=abc&otherCost=0');
  assert.deepEqual(decoded, { otherCost: '0' });
});

test('the real spec round-trips through save and reload too', () => {
  const storage = fakeStorage();
  const values = {
    daysOnSite: '3',
    units: [{ type: '0', quantity: '4', rentPerDay: '18', serviceEach: '28' }],
  };
  saveBid(storage, EVENT_QUOTE_SPEC, values);
  assert.deepEqual(loadBid(storage, EVENT_QUOTE_SPEC), values);
});

// ---- Proposal terms -------------------------------------------------------
//
// The defect these cover, recorded 2026-08-29: 48 bid calculators carried the
// pricing form into a shared link and left the proposal terms behind, so a
// bid sent at a 50% deposit held for 15 days reopened at the venture's
// defaults — 30% and 30 days — under a headline figure that matched the
// sender's to the cent. The same terms were missing from the setter's own
// saved bid.

test('the proposal terms ride in a link and come back as sent', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const values = {
    daysOnSite: '3', otherCost: '0',
    units: [{ type: '0', quantity: '4', rentPerDay: '18', serviceEach: '28' }],
    depositPercent: '50',
    validDays: '15',
    paymentTerms: 'Half on acceptance, balance on completion.',
    proposalNotes: 'Need level ground and clear truck access within 25 feet.',
    proposalExclusions: 'Overnight security\nExtra service visits beyond those listed',
  };
  assert.deepEqual(decodeBid(spec, encodeBid(spec, values)), values);
});

test('newlines survive, because an exclusions list is a list', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const values = { daysOnSite: '3', proposalExclusions: 'Security\nFencing\nDamage waiver' };
  assert.equal(
    decodeBid(spec, encodeBid(spec, values)).proposalExclusions,
    'Security\nFencing\nDamage waiver',
  );
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const decoded = decodeBid(spec, encodeBid(spec, { daysOnSite: '3', paymentTerms: essay }));
  assert.equal(decoded.paymentTerms, undefined);
  assert.equal(decoded.daysOnSite, '3');
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
  assert.deepEqual(overlongTerms(null), []);
});

test('a term at the ceiling still travels', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.equal(decodeBid(spec, encodeBid(spec, { paymentTerms: exact })).paymentTerms, exact);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const crafted = new URLSearchParams({ daysOnSite: '3', paymentTerms: 'Net [2J 30' }).toString();
  assert.equal(decodeBid(spec, crafted).paymentTerms, 'Net [2J 30');
});

test('a term holding only whitespace is not carried as terms the sender wrote', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const encoded = encodeBid(spec, { daysOnSite: '3', paymentTerms: '  \n  ' });
  assert.equal(new URLSearchParams(encoded).has('paymentTerms'), false);
});

test('the terms are saved with the quote, so they are typed once', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  saveBid(storage, spec, { daysOnSite: '3', depositPercent: '50', paymentTerms: 'Net 15.' });
  const loaded = loadBid(storage, spec);
  assert.equal(loaded.depositPercent, '50');
  assert.equal(loaded.paymentTerms, 'Net 15.');
});

test('a link wins over stored terms, as it does over stored figures', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  saveBid(storage, spec, { daysOnSite: '3', depositPercent: '30', paymentTerms: 'Net 30.' });
  const restored = restoreBid(spec, {
    search: encodeBid(spec, { daysOnSite: '3', depositPercent: '50', paymentTerms: 'Net 15.' }),
    storage,
  });
  assert.equal(restored.source, 'link');
  assert.equal(restored.values.depositPercent, '50');
  assert.equal(restored.values.paymentTerms, 'Net 15.');
});

test('folding the terms in twice leaves one copy of each', () => {
  const once = withProposalTerms(EVENT_QUOTE_SPEC);
  const twice = withProposalTerms(once);
  assert.deepEqual(twice.numbers, once.numbers);
  assert.deepEqual(twice.text, once.text);
  assert.equal(new Set(twice.numbers).size, twice.numbers.length);
});

test('every named term is one kind or the other, and no id is both', () => {
  const overlap = PROPOSAL_TERM_NUMBERS.filter(id => PROPOSAL_TERM_TEXT.includes(id));
  assert.deepEqual(overlap, []);
});

test('withProposalTerms leaves a non-spec alone rather than inventing one', () => {
  assert.equal(withProposalTerms(null), null);
  assert.equal(withProposalTerms('nope'), 'nope');
});

test('readProposalTerms takes the terms off the page and leaves the rest', () => {
  const page = {
    depositPercent: { value: '50' },
    validDays: { value: '15' },
    paymentTerms: { value: 'Net 15.' },
    proposalNotes: { value: '' },
    proposalExclusions: { value: 'Overnight security' },
  };
  const values = readProposalTerms({ daysOnSite: '3' }, id => page[id] ?? null);
  assert.equal(values.daysOnSite, '3');
  assert.equal(values.depositPercent, '50');
  assert.equal(values.paymentTerms, 'Net 15.');
  assert.equal(values.proposalNotes, '');
});

test('a page without the proposal panel is unchanged, and a throwing lookup is survivable', () => {
  assert.deepEqual(readProposalTerms({ daysOnSite: '3' }, () => null), { daysOnSite: '3' });
  assert.deepEqual(
    readProposalTerms({ daysOnSite: '3' }, () => { throw new Error('no such id'); }),
    { daysOnSite: '3' },
  );
  assert.deepEqual(readProposalTerms({ daysOnSite: '3' }, undefined), { daysOnSite: '3' });
  assert.deepEqual(readProposalTerms(null, () => null), {});
});

test('the note names the box on screen, not the id in the markup', () => {
  const long = 'x'.repeat(MAX_TERM_TEXT + 1);
  assert.equal(overlongTermsNote({ paymentTerms: 'Net 30.' }), '');
  assert.match(overlongTermsNote({ paymentTerms: long }), /^your payment terms is too long/);
  assert.match(
    overlongTermsNote({ paymentTerms: long, proposalNotes: long }),
    /^your payment terms and notes are too long/,
  );
});

// Company/customer contact fields and `usageOptOut` are deliberately absent
// from every SPEC above: no business rides in a URL, and a link must never
// silently flip the recipient's own privacy choice.
test('company, customer, and usageOptOut never ride in a portable-restroom quote link', () => {
  const spec = withProposalTerms(EVENT_QUOTE_SPEC);
  const all = [
    ...spec.numbers, ...(spec.flags ?? []), ...Object.keys(spec.choices ?? {}), ...spec.text,
    ...(spec.rows?.fields ?? []).map(field => field.key),
  ];
  for (const excluded of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'usageOptOut',
  ]) {
    assert.equal(all.includes(excluded), false, `${excluded} must not be part of the bid spec`);
  }
});

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
import { PANE_PRESETS } from './calc.mjs';

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

// A form whose shape the visitor sets — window cleaning is priced as a list of
// glass-type rows, and there is no fixed count of them — has no fixed field
// list to name, so `rows` carries it. This is the shape this venture's real
// `BID_SPEC` actually uses, below.
const ROW_SPEC = {
  key: 'saved-bid',
  numbers: ['wage'],
  flags: [],
  choices: {},
  rows: {
    param: 'groups',
    fields: [
      { key: 'type', kind: 'choice', options: ['ground', 'french', 'other'] },
      { key: 'panes', kind: 'number' },
      { key: 'minutesPerPane', kind: 'number' },
    ],
  },
};

test('a job of glass-type rows round-trips', () => {
  const values = {
    wage: '19',
    groups: [
      { type: 'ground', panes: '30', minutesPerPane: '1.5' },
      { type: 'french', panes: '10', minutesPerPane: '4' },
    ],
  };
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, values)), values);
});

test('rows keep their order, because a bid read back shuffled is a different bid', () => {
  const groups = [
    { type: 'ground', panes: '1', minutesPerPane: '10' },
    { type: 'french', panes: '2', minutesPerPane: '20' },
    { type: 'other', panes: '3', minutesPerPane: '30' },
  ];
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, { groups })).groups, groups);
});

test('a bad cell drops out without taking the rest of its row with it', () => {
  const decoded = decodeBid(ROW_SPEC, 'groups=ground:-5:4');
  assert.deepEqual(decoded.groups, [{ type: 'ground', minutesPerPane: '4' }]);
});

test('a crafted row cannot set a glass type the form does not offer', () => {
  const decoded = decodeBid(ROW_SPEC, 'groups=skylight:30:8');
  assert.deepEqual(decoded.groups, [{ panes: '30', minutesPerPane: '8' }]);
});

test('an entirely empty row is dropped rather than added to the form', () => {
  assert.equal(decodeBid(ROW_SPEC, 'groups=::').groups, undefined);
  assert.equal(encodeBid(ROW_SPEC, { groups: [{}, {}] }).includes('groups'), false);
});

test('a link cannot grow the form without limit', () => {
  const huge = Array.from({ length: 5000 }, () => 'ground:10:2').join(',');
  assert.equal(decodeBid(ROW_SPEC, `groups=${huge}`).groups.length, 200);
});

test('rows survive a save and reload', () => {
  const storage = fakeStorage();
  const groups = [{ type: 'french', panes: '10', minutesPerPane: '4' }];
  saveBid(storage, ROW_SPEC, { wage: '19', groups });
  assert.deepEqual(loadBid(storage, ROW_SPEC), { wage: '19', groups });
});

// ---- This venture's actual field list --------------------------------------
//
// A window-cleaning visit is priced as a fixed cost block (wage, burden,
// travel, overhead, margin, minimum charge, visits per month) plus a
// visitor-grown list of glass-type rows, one per pane group. That is exactly
// what `rows` exists for: `WINDOW_CLEANING_SPEC` mirrors `BID_SPEC` in
// `index.html`, with the glass-type choice validated against `calc.mjs`'s own
// `PANE_PRESETS` rather than a hand-copied list of option strings.
const COST_IDS = [
  'hourlyWage', 'burdenRate', 'travelSetupMinutes', 'suppliesPerVisit', 'otherPerVisit',
  'overheadRate', 'targetMargin', 'minimumCharge', 'visitsPerMonth', 'proposedPrice',
];
const WINDOW_CLEANING_SPEC = {
  key: 'window-cleaning-bid',
  numbers: COST_IDS,
  flags: [],
  choices: {},
  rows: {
    param: 'groups',
    fields: [
      { key: 'type', kind: 'choice', options: PANE_PRESETS.map((_, index) => String(index)).concat('other') },
      { key: 'panes', kind: 'number' },
      { key: 'minutesPerPane', kind: 'number' },
      { key: 'sides', kind: 'number' },
    ],
  },
};

test('the real bid round-trips: every rate and every glass-type row', () => {
  const values = {
    hourlyWage: '22',
    burdenRate: '28',
    travelSetupMinutes: '30',
    suppliesPerVisit: '10',
    otherPerVisit: '15',
    overheadRate: '18',
    targetMargin: '25',
    minimumCharge: '150',
    visitsPerMonth: '4.3333',
    proposedPrice: '210',
    groups: [
      { type: '0', panes: '30', minutesPerPane: '1.5', sides: '1' },
      { type: '2', panes: '10', minutesPerPane: '4', sides: '2' },
      { type: 'other', panes: '6', minutesPerPane: '9', sides: '1' },
    ],
  };
  assert.deepEqual(decodeBid(WINDOW_CLEANING_SPEC, encodeBid(WINDOW_CLEANING_SPEC, values)), values);
});

test('a crafted link cannot set a glass type the calculator has no minutes for', () => {
  // The row keeps every cell it can still validate; only the unoffered glass
  // type is dropped, exactly as an unoffered top-level choice would be.
  const decoded = decodeBid(WINDOW_CLEANING_SPEC, 'groups=99:30:2:1&hourlyWage=22');
  assert.deepEqual(decoded, {
    hourlyWage: '22',
    groups: [{ panes: '30', minutesPerPane: '2', sides: '1' }],
  });
});

test('a stale link from before a preset was added still decodes the fields it recognises', () => {
  // Simulates a link built against a longer PANE_PRESETS array than this
  // build offers: the row keeps its numbers and drops only the option this
  // build no longer has, and a sibling row with a valid type is untouched.
  const decoded = decodeBid(WINDOW_CLEANING_SPEC, 'groups=12:30:2:1,0:6:1.5:1');
  assert.deepEqual(decoded.groups, [
    { panes: '30', minutesPerPane: '2', sides: '1' },
    { type: '0', panes: '6', minutesPerPane: '1.5', sides: '1' },
  ]);
});

test('a negative or non-numeric field is rejected rather than pricing a nonsense job', () => {
  const decoded = decodeBid(WINDOW_CLEANING_SPEC, 'hourlyWage=-5&burdenRate=abc&minimumCharge=150');
  assert.deepEqual(decoded, { minimumCharge: '150' });
});

test('a sides value outside 1 or 2 in a row is still carried by the module', () => {
  // share.mjs only knows "non-negative number", not this venture's own 1-or-2
  // rule -- `calculateBid` is what rejects an out-of-range value, and this
  // spec test would give a false sense of safety if it asserted otherwise.
  // What matters here is that the *choice* validation (the glass type) still
  // holds even when a sibling numeric cell is out of the venture's range.
  const decoded = decodeBid(WINDOW_CLEANING_SPEC, 'groups=0:10:2:5');
  assert.deepEqual(decoded.groups, [{ type: '0', panes: '10', minutesPerPane: '2', sides: '5' }]);
});

test('the real spec round-trips through save and reload too', () => {
  const storage = fakeStorage();
  const values = {
    hourlyWage: '20',
    groups: [{ type: '0', panes: '30', minutesPerPane: '1.5', sides: '1' }],
  };
  saveBid(storage, WINDOW_CLEANING_SPEC, values);
  assert.deepEqual(loadBid(storage, WINDOW_CLEANING_SPEC), values);
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
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const values = {
    hourlyWage: '22', minimumCharge: '150',
    groups: [{ type: '0', panes: '30', minutesPerPane: '1.5', sides: '1' }],
    depositPercent: '50',
    validDays: '15',
    paymentTerms: 'Half on acceptance, balance on completion.',
    proposalNotes: 'Keep the display area clear on service day.',
    proposalExclusions: 'Hard-water stain removal\nScreen or track repair',
  };
  assert.deepEqual(decodeBid(spec, encodeBid(spec, values)), values);
});

test('newlines survive, because an exclusions list is a list', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const values = { hourlyWage: '20', proposalExclusions: 'Screens\nSkylights\nStain removal' };
  assert.equal(
    decodeBid(spec, encodeBid(spec, values)).proposalExclusions,
    'Screens\nSkylights\nStain removal',
  );
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const decoded = decodeBid(spec, encodeBid(spec, { hourlyWage: '20', paymentTerms: essay }));
  assert.equal(decoded.paymentTerms, undefined);
  assert.equal(decoded.hourlyWage, '20');
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
  assert.deepEqual(overlongTerms(null), []);
});

test('a term at the ceiling still travels', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.equal(decodeBid(spec, encodeBid(spec, { paymentTerms: exact })).paymentTerms, exact);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const crafted = new URLSearchParams({ hourlyWage: '20', paymentTerms: 'Net [2J 30' }).toString();
  assert.equal(decodeBid(spec, crafted).paymentTerms, 'Net [2J 30');
});

test('a term holding only whitespace is not carried as terms the sender wrote', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  const encoded = encodeBid(spec, { hourlyWage: '20', paymentTerms: '  \n  ' });
  assert.equal(new URLSearchParams(encoded).has('paymentTerms'), false);
});

test('the terms are saved with the bid, so they are typed once', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  saveBid(storage, spec, { hourlyWage: '22', depositPercent: '50', paymentTerms: 'Net 15.' });
  const loaded = loadBid(storage, spec);
  assert.equal(loaded.depositPercent, '50');
  assert.equal(loaded.paymentTerms, 'Net 15.');
});

test('a link wins over stored terms, as it does over stored figures', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
  saveBid(storage, spec, { hourlyWage: '22', depositPercent: '30', paymentTerms: 'Net 30.' });
  const restored = restoreBid(spec, {
    search: encodeBid(spec, { hourlyWage: '22', depositPercent: '50', paymentTerms: 'Net 15.' }),
    storage,
  });
  assert.equal(restored.source, 'link');
  assert.equal(restored.values.depositPercent, '50');
  assert.equal(restored.values.paymentTerms, 'Net 15.');
});

test('folding the terms in twice leaves one copy of each', () => {
  const once = withProposalTerms(WINDOW_CLEANING_SPEC);
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
    proposalExclusions: { value: 'Hard-water stain removal' },
  };
  const values = readProposalTerms({ hourlyWage: '22' }, id => page[id] ?? null);
  assert.equal(values.hourlyWage, '22');
  assert.equal(values.depositPercent, '50');
  assert.equal(values.paymentTerms, 'Net 15.');
  assert.equal(values.proposalNotes, '');
});

test('a page without the proposal panel is unchanged, and a throwing lookup is survivable', () => {
  assert.deepEqual(readProposalTerms({ hourlyWage: '22' }, () => null), { hourlyWage: '22' });
  assert.deepEqual(
    readProposalTerms({ hourlyWage: '22' }, () => { throw new Error('no such id'); }),
    { hourlyWage: '22' },
  );
  assert.deepEqual(readProposalTerms({ hourlyWage: '22' }, undefined), { hourlyWage: '22' });
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
test('company, customer, and usageOptOut never ride in a window-cleaning bid link', () => {
  const spec = withProposalTerms(WINDOW_CLEANING_SPEC);
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

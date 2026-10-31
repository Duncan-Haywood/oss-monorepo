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

// These exercise the transform, so the spec below is a stand-in rather than
// this venture's real field list. That split is deliberate: a unit test that
// restated the form's fields would be a second copy of them to keep in sync —
// exactly the drift this module exists to avoid. The tie between the real form
// and what a link carries is asserted in `page.test.mjs`, against the page
// source itself.
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
  // The bug this guards: encoding only truthy values means a sender who
  // deliberately unticked "the optional extra" sends a link that re-ticks it, and the
  // recipient prices a different job than the one that was quoted.
  const encoded = encodeBid(SPEC, { extraA: false, extraB: true });
  assert.equal(decodeBid(SPEC, encoded).extraA, false);
  assert.equal(decodeBid(SPEC, encoded).extraB, true);
});

test('a blank field is left out instead of encoding an empty string', () => {
  const encoded = encodeBid(SPEC, { area: '', wage: '55' });
  assert.equal(encoded.includes('area'), false);
  assert.deepEqual(decodeBid(SPEC, encoded), { wage: '55' });
});

test('a leading ? or # is accepted so location.search needs no trimming', () => {
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

test('a stored bid is re-validated, so an edited blob cannot smuggle a field in', () => {
  const storage = fakeStorage();
  storage.setItem(SPEC.key, JSON.stringify({ v: 1, values: { area: '48', scope: 'free-labour', sneaky: '1' } }));
  assert.deepEqual(loadBid(storage, SPEC), { area: '48' });
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

test('restoring works with no storage at all', () => {
  assert.deepEqual(restoreBid(SPEC, { search: '?area=48' }).values, { area: '48' });
  assert.equal(restoreBid(SPEC, {}).source, 'none');
});

// A form whose shape the visitor sets — the janitorial bid is a list of spaces
// in a building — has no fixed field list to name, so `rows` carries it. This
// is the case worth keeping most: re-measuring a building to re-price it costs
// an hour, where a retyped wage costs a moment.
const ROW_SPEC = {
  key: 'saved-bid',
  numbers: ['wage'],
  flags: [],
  choices: {},
  rows: {
    param: 'areas',
    fields: [
      { key: 'type', kind: 'choice', options: ['office', 'restroom', 'other'] },
      { key: 'squareFeet', kind: 'number' },
      { key: 'rate', kind: 'number' },
    ],
  },
};

test('a building of spaces round-trips', () => {
  const values = {
    wage: '19',
    areas: [
      { type: 'office', squareFeet: '2500', rate: '3000' },
      { type: 'restroom', squareFeet: '400', rate: '900' },
    ],
  };
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, values)), values);
});

test('rows keep their order, because a bid read back shuffled is a different bid', () => {
  const areas = [
    { type: 'office', squareFeet: '1', rate: '10' },
    { type: 'restroom', squareFeet: '2', rate: '20' },
    { type: 'other', squareFeet: '3', rate: '30' },
  ];
  assert.deepEqual(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, { areas })).areas, areas);
});

test('a bad cell drops out without taking the rest of its row with it', () => {
  const decoded = decodeBid(ROW_SPEC, 'areas=office:-5:3000');
  assert.deepEqual(decoded.areas, [{ type: 'office', rate: '3000' }]);
});

test('a crafted row cannot set a space type the form does not offer', () => {
  const decoded = decodeBid(ROW_SPEC, 'areas=warehouse:2500:3000');
  assert.deepEqual(decoded.areas, [{ squareFeet: '2500', rate: '3000' }]);
});

test('an entirely empty row is dropped rather than added to the form', () => {
  assert.equal(decodeBid(ROW_SPEC, 'areas=::').areas, undefined);
  assert.equal(encodeBid(ROW_SPEC, { areas: [{}, {}] }).includes('areas'), false);
});

test('a link cannot grow the form without limit', () => {
  const huge = Array.from({ length: 5000 }, () => 'office:10:100').join(',');
  assert.equal(decodeBid(ROW_SPEC, `areas=${huge}`).areas.length, 200);
  const many = Array.from({ length: 5000 }, () => ({ type: 'office', squareFeet: '10', rate: '100' }));
  assert.equal(decodeBid(ROW_SPEC, encodeBid(ROW_SPEC, { areas: many })).areas.length, 200);
});

test('rows survive a save and reload', () => {
  const storage = fakeStorage();
  const areas = [{ type: 'restroom', squareFeet: '400', rate: '900' }];
  saveBid(storage, ROW_SPEC, { wage: '19', areas });
  assert.deepEqual(loadBid(storage, ROW_SPEC), { wage: '19', areas });
});

test('a spec with no rows is unaffected by any of this', () => {
  assert.equal(encodeBid(SPEC, { area: '48', areas: [{ type: 'office' }] }).includes('areas'), false);
  assert.equal(decodeBid(SPEC, 'area=48&areas=office:1:2').areas, undefined);
});

// A select whose options are numbers is the case that broke. The DOM hands
// back a string, but a page is free to coerce before calling in here, and
// `sewer-line-replace-bid-calculator` does exactly that in `readInput()` so its
// own arithmetic gets a number. Encoding used to require `typeof === 'string'`,
// so the field vanished from the link and from the save without a word: a bid
// priced for a 6-inch lateral reopened as the default 4-inch one, at a
// different price, for the recipient and for the setter's own next visit.
const NUMERIC_CHOICE_SPEC = {
  key: 'saved-bid',
  numbers: ['runFeet'],
  flags: [],
  choices: { diameterIn: ['4', '6'], grade: ['plain', 'fancy'] },
};

test('a select the page coerced to a number still reaches the link', () => {
  const encoded = encodeBid(NUMERIC_CHOICE_SPEC, { diameterIn: 6, runFeet: '80' });
  assert.equal(new URLSearchParams(encoded).get('diameterIn'), '6');
  assert.deepEqual(
    decodeBid(NUMERIC_CHOICE_SPEC, encoded),
    { diameterIn: '6', runFeet: '80' },
  );
});

test('a coerced select survives a save and reload', () => {
  const storage = fakeStorage();
  saveBid(storage, NUMERIC_CHOICE_SPEC, { diameterIn: 6, runFeet: '80' });
  assert.deepEqual(loadBid(storage, NUMERIC_CHOICE_SPEC), { diameterIn: '6', runFeet: '80' });
});

test('coercion tolerance does not widen what a select will accept', () => {
  // The allowed list still decides. A number the select does not offer is
  // rejected exactly as an unoffered string is, and a value that is neither a
  // string nor a finite number never gets as far as being compared — `true`
  // must not arrive as the option `"true"`, nor an object as `"[object
  // Object]"`.
  for (const rejected of [8, -6, NaN, Infinity, true, false, null, undefined, {}, ['6'], () => '6']) {
    const encoded = encodeBid(NUMERIC_CHOICE_SPEC, { diameterIn: rejected, runFeet: '80' });
    assert.equal(
      new URLSearchParams(encoded).has('diameterIn'),
      false,
      `${String(rejected)} should not have been accepted as a diameter`,
    );
  }
});

test('a coerced row cell reaches the link too', () => {
  const NUMERIC_ROW_SPEC = {
    ...ROW_SPEC,
    rows: {
      param: 'areas',
      fields: [
        { key: 'coats', kind: 'choice', options: ['1', '2'] },
        { key: 'squareFeet', kind: 'number' },
      ],
    },
  };
  const encoded = encodeBid(NUMERIC_ROW_SPEC, { areas: [{ coats: 2, squareFeet: '400' }] });
  assert.deepEqual(
    decodeBid(NUMERIC_ROW_SPEC, encoded).areas,
    [{ coats: '2', squareFeet: '400' }],
  );
  // and an unoffered number is still refused
  assert.deepEqual(
    decodeBid(NUMERIC_ROW_SPEC, encodeBid(NUMERIC_ROW_SPEC, { areas: [{ coats: 9, squareFeet: '400' }] })).areas,
    [{ squareFeet: '400' }],
  );
});

// ---- Proposal terms -------------------------------------------------------
//
// The defect these cover, recorded 2026-08-29: 48 bid calculators carried the
// pricing form into a shared link and left the proposal terms behind, so a bid
// sent at a 50% deposit held for 15 days reopened at the venture's defaults —
// 30% and 30 days — under a headline figure that matched the sender's to the
// cent. The same terms were missing from the setter's own saved bid.

test('the proposal terms ride in a link and come back as sent', () => {
  const spec = withProposalTerms(SPEC);
  const values = {
    area: '900', wage: '38', margin: '18',
    extraA: true, extraB: false, scope: 'full', grade: 'fancy',
    depositPercent: '50',
    validDays: '15',
    paymentTerms: 'Half on acceptance, balance on completion.',
    proposalNotes: 'Crew starts 7am; driveway must be clear.',
    proposalExclusions: 'Permits\nSprinkler repair',
  };
  assert.deepEqual(decodeBid(spec, encodeBid(spec, values)), values);
});

test('newlines survive, because an exclusions list is a list', () => {
  const spec = withProposalTerms(SPEC);
  const values = { area: '1', proposalExclusions: 'Permits\nDisposal\nSprinkler repair' };
  assert.equal(
    decodeBid(spec, encodeBid(spec, values)).proposalExclusions,
    'Permits\nDisposal\nSprinkler repair',
  );
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const spec = withProposalTerms(SPEC);
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const decoded = decodeBid(spec, encodeBid(spec, { area: '1', paymentTerms: essay }));
  assert.equal(decoded.paymentTerms, undefined);
  assert.equal(decoded.area, '1');
  // and the sender is told which one stayed behind rather than the recipient
  // reading it as a field the sender left blank
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
  assert.deepEqual(overlongTerms(null), []);
});

test('a term at the ceiling still travels', () => {
  const spec = withProposalTerms(SPEC);
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.equal(decodeBid(spec, encodeBid(spec, { paymentTerms: exact })).paymentTerms, exact);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const spec = withProposalTerms(SPEC);
  const crafted = new URLSearchParams({ area: '1', paymentTerms: 'Net \u001b[2J\u0007 30' }).toString();
  assert.equal(decodeBid(spec, crafted).paymentTerms, 'Net [2J 30');
});

test('a crafted link cannot paste an essay past the ceiling', () => {
  const spec = withProposalTerms(SPEC);
  const crafted = new URLSearchParams({
    area: '1', proposalNotes: 'x'.repeat(MAX_TERM_TEXT + 1),
  }).toString();
  assert.equal(decodeBid(spec, crafted).proposalNotes, undefined);
});

test('a term holding only whitespace is not carried as terms the sender wrote', () => {
  const spec = withProposalTerms(SPEC);
  const encoded = encodeBid(spec, { area: '1', paymentTerms: '  \n  ' });
  assert.equal(new URLSearchParams(encoded).has('paymentTerms'), false);
});

test('the terms are saved with the bid, so they are typed once', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(SPEC);
  saveBid(storage, spec, { area: '900', depositPercent: '50', paymentTerms: 'Net 15.' });
  const loaded = loadBid(storage, spec);
  assert.equal(loaded.depositPercent, '50');
  assert.equal(loaded.paymentTerms, 'Net 15.');
});

test('a link wins over stored terms, as it does over stored figures', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(SPEC);
  saveBid(storage, spec, { area: '900', depositPercent: '30', paymentTerms: 'Net 30.' });
  const restored = restoreBid(spec, {
    search: encodeBid(spec, { area: '900', depositPercent: '50', paymentTerms: 'Net 15.' }),
    storage,
  });
  assert.equal(restored.source, 'link');
  assert.equal(restored.values.depositPercent, '50');
  assert.equal(restored.values.paymentTerms, 'Net 15.');
});

test('folding the terms in twice leaves one copy of each', () => {
  const once = withProposalTerms(SPEC);
  const twice = withProposalTerms(once);
  assert.deepEqual(twice.numbers, once.numbers);
  assert.deepEqual(twice.text, once.text);
  assert.equal(new Set(twice.numbers).size, twice.numbers.length);
  assert.equal(new Set(twice.text).size, twice.text.length);
});

test('a spec that already names a term keeps its own ordering', () => {
  const spec = withProposalTerms({ ...SPEC, numbers: ['depositPercent', 'area'] });
  assert.deepEqual(spec.numbers, ['depositPercent', 'area', 'validDays']);
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
    proposalExclusions: { value: 'Permits' },
  };
  const values = readProposalTerms({ area: '900' }, id => page[id] ?? null);
  assert.equal(values.area, '900');
  assert.equal(values.depositPercent, '50');
  assert.equal(values.paymentTerms, 'Net 15.');
  assert.equal(values.proposalNotes, '');
});

test('a page without the proposal panel is unchanged, and a throwing lookup is survivable', () => {
  assert.deepEqual(readProposalTerms({ area: '900' }, () => null), { area: '900' });
  assert.deepEqual(
    readProposalTerms({ area: '900' }, () => { throw new Error('no such id'); }),
    { area: '900' },
  );
  assert.deepEqual(readProposalTerms({ area: '900' }, undefined), { area: '900' });
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
  assert.match(
    overlongTermsNote({ proposalExclusions: long, paymentTerms: long, proposalNotes: long }),
    /^your not-included list, payment terms and notes are too long/,
  );
});

test('a term of exactly the limit still rides in the link; one over is named', () => {
  assert.deepEqual(overlongTerms({ paymentTerms: 'x'.repeat(MAX_TERM_TEXT) }), []);
  assert.deepEqual(overlongTerms({ paymentTerms: 'x'.repeat(MAX_TERM_TEXT + 1) }), ['paymentTerms']);
});

test('loadBid with no storage key reads nothing, even if a blob sits under "undefined"', () => {
  // Real Storage coerces its key to a string, so getItem(undefined) reads "undefined".
  const blob = JSON.stringify({ v: 1, values: { area: '48' } });
  const storage = { getItem: key => (String(key) === 'undefined' ? blob : null) };
  assert.deepEqual(loadBid(storage, { ...SPEC, key: undefined }), {});
  assert.deepEqual(loadBid(null, SPEC), {});
});

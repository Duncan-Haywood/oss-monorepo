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

// A stand-in spec rather than this venture's real field list -- a test that
// restated the form's fields would be a second copy of them to keep in sync,
// which is the drift this module exists to avoid. The tie between the real
// form and what a link carries is asserted in page.test.mjs, against the
// page source itself.
const SPEC = {
  key: 'locksmith-bid',
  numbers: ['laborMinutes', 'hourlyRate', 'minimumServiceCharge'],
  flags: ['emergencyCall'],
};

function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: key => { if (throws) throw new Error('blocked'); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { if (throws) throw new Error('blocked'); map.set(key, String(value)); },
    removeItem: key => { if (throws) throw new Error('blocked'); map.delete(key); },
    size: () => map.size,
  };
}

test('a full call round-trips through a link unchanged', () => {
  const values = { laborMinutes: '30', hourlyRate: '90', minimumServiceCharge: '89', emergencyCall: true };
  assert.deepEqual(decodeBid(SPEC, encodeBid(SPEC, values)), values);
});

test('a false flag survives rather than being dropped as falsy', () => {
  // The bug this guards: encoding only truthy values means a sender who
  // deliberately unticked "emergency call" sends a link that re-ticks it, and
  // the recipient prices a scheduled call as an after-hours one.
  const encoded = encodeBid(SPEC, { emergencyCall: false, laborMinutes: '30' });
  assert.equal(decodeBid(SPEC, encoded).emergencyCall, false);
});

test('a blank field is left out instead of encoding an empty string', () => {
  const encoded = encodeBid(SPEC, { laborMinutes: '', hourlyRate: '90' });
  assert.equal(encoded.includes('laborMinutes'), false);
  assert.deepEqual(decodeBid(SPEC, encoded), { hourlyRate: '90' });
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeBid(SPEC, '?hourlyRate=90'), { hourlyRate: '90' });
  assert.deepEqual(decodeBid(SPEC, '#hourlyRate=90'), { hourlyRate: '90' });
});

test('a crafted link cannot inject an unknown field or a negative number', () => {
  assert.deepEqual(
    decodeBid(SPEC, 'hourlyRate=-40&minimumServiceCharge=89&sneakyRate=999'),
    { minimumServiceCharge: '89' },
  );
});

test('non-string input decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeBid(SPEC, null), {});
  assert.deepEqual(decodeBid(SPEC, undefined), {});
  assert.deepEqual(decodeBid(SPEC, 42), {});
});

test('a saved call comes back on the next visit', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { laborMinutes: '30', emergencyCall: true });
  assert.deepEqual(loadBid(storage, SPEC), { laborMinutes: '30', emergencyCall: true });
});

test('clearing removes the saved call', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { laborMinutes: '30' });
  clearBid(storage, SPEC);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(storage.size(), 0);
});

test('storage that throws never takes the page down with it', () => {
  const storage = fakeStorage({ throws: true });
  assert.equal(saveBid(storage, SPEC, { laborMinutes: '30' }), false);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(clearBid(storage, SPEC), false);
});

test('a stored blob from another version, or hand-edited, is ignored', () => {
  const storage = fakeStorage();
  storage.setItem(SPEC.key, JSON.stringify({ v: 99, values: { laborMinutes: '30' } }));
  assert.deepEqual(loadBid(storage, SPEC), {});
  storage.setItem(SPEC.key, 'not json at all');
  assert.deepEqual(loadBid(storage, SPEC), {});
});

test('a link beats a saved call, because an opened link is what the visitor meant to see', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { laborMinutes: '10' });
  const restored = restoreBid(SPEC, { search: '?laborMinutes=30', storage });
  assert.deepEqual(restored.values, { laborMinutes: '30' });
  assert.equal(restored.source, 'link');
});

test('a plain visit falls back to the saved call', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { laborMinutes: '10' });
  const restored = restoreBid(SPEC, { search: '', storage });
  assert.deepEqual(restored.values, { laborMinutes: '10' });
  assert.equal(restored.source, 'storage');
});

test('a first visit restores nothing and says so', () => {
  const restored = restoreBid(SPEC, { search: '', storage: fakeStorage() });
  assert.deepEqual(restored.values, {});
  assert.equal(restored.source, 'none');
});

// The panel asks for five things this calculator does not compute with: the
// deposit, how long the price is held, and three blocks of prose. Regression
// coverage for the class of defect CLAUDE.md records for 48 other tools: a
// call priced at a 50% deposit held for 15 days reopening at this venture's
// defaults under a headline price that matched the sender's to the cent.

test('the proposal terms ride in a link and come back as sent', () => {
  const spec = withProposalTerms(SPEC);
  const values = {
    laborMinutes: '30', hourlyRate: '90', minimumServiceCharge: '89', emergencyCall: true,
    depositPercent: '50',
    validDays: '15',
    paymentTerms: 'Due in full on completion of the call.',
    proposalNotes: 'Photo ID matching the service address may be requested.',
    proposalExclusions: 'Safe opening\nAccess-control programming beyond one fob',
  };
  assert.deepEqual(decodeBid(spec, encodeBid(spec, values)), values);
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const spec = withProposalTerms(SPEC);
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const decoded = decodeBid(spec, encodeBid(spec, { laborMinutes: '30', paymentTerms: essay }));
  assert.equal(decoded.paymentTerms, undefined);
  assert.equal(decoded.laborMinutes, '30');
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const spec = withProposalTerms(SPEC);
  const crafted = new URLSearchParams({ laborMinutes: '30', paymentTerms: 'Due [2J now' }).toString();
  assert.equal(decodeBid(spec, crafted).paymentTerms, 'Due [2J now');
});

test('the terms are saved with the call, so they are typed once', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(SPEC);
  saveBid(storage, spec, { laborMinutes: '30', depositPercent: '50', paymentTerms: 'Net 15.' });
  const loaded = loadBid(storage, spec);
  assert.equal(loaded.depositPercent, '50');
  assert.equal(loaded.paymentTerms, 'Net 15.');
});

test('folding the terms in twice leaves one copy of each', () => {
  const once = withProposalTerms(SPEC);
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
  };
  const lookup = (id) => page[id] ?? null;
  const result = readProposalTerms({ laborMinutes: '30' }, lookup);
  assert.equal(result.laborMinutes, '30');
  assert.equal(result.depositPercent, '50');
  assert.equal(result.validDays, '15');
});

test('readProposalTerms is a no-op without a lookup function', () => {
  assert.deepEqual(readProposalTerms({ laborMinutes: '30' }), { laborMinutes: '30' });
});

test('overlongTermsNote names what stayed behind, or says nothing when everything fit', () => {
  assert.equal(overlongTermsNote({ paymentTerms: 'Net 30.' }), '');
  const note = overlongTermsNote({ paymentTerms: 'x'.repeat(MAX_TERM_TEXT + 1) });
  assert.match(note, /payment terms/);
  assert.match(note, /too long to fit in a link/);
});

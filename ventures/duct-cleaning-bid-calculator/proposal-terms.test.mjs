// The transform in `terms.mjs`: what a bid link carries beside the venture's
// own payload, and what it refuses to carry.
//
// These are pure — no DOM — because the module is. The tie between these rules
// and the twelve pages that use them is asserted in `term-ids.test.mjs`, against
// the page source itself; the tie to a real browser is
// `platform/pages/roundtrip.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TERM_TEXT,
  PROPOSAL_TERM_NUMBERS,
  PROPOSAL_TERM_TEXT,
  TERMS_PARAM,
  applyTerms,
  decodeTerms,
  encodeTerms,
  overlongTerms,
  overlongTermsNote,
  readTerms,
  splitTerms,
  withTerms,
} from './proposal-terms.mjs';

const SENT = {
  depositPercent: '50',
  validDays: '15',
  paymentTerms: 'Half on acceptance, balance on completion. Card payments add 3%.',
  proposalNotes: 'Crew starts 7am; driveway must be clear.',
  proposalExclusions: 'Permits\nSprinkler relocation\nTree removal',
};

/** A stand-in for a page's `el`: id to element, or null. */
function fakePage(values = {}) {
  const nodes = {};
  for (const [id, value] of Object.entries(values)) {
    nodes[id] = { value, events: [], dispatchEvent(event) { this.events.push(event.type); this.bubbled.push(event.bubbles); return true; }, bubbled: [] };
  }
  return { lookup: (id) => nodes[id] ?? null, nodes };
}

test('all five terms round-trip unchanged', () => {
  assert.deepEqual(decodeTerms(encodeTerms(SENT)), SENT);
});

test('newlines survive, because an exclusions list is a list', () => {
  const got = decodeTerms(encodeTerms({ proposalExclusions: 'Permits\nDisposal\nTrees' }));
  assert.equal(got.proposalExclusions, 'Permits\nDisposal\nTrees');
});

test('nothing typed encodes to nothing, so an untouched page links as before', () => {
  assert.equal(encodeTerms({}), '');
  assert.equal(encodeTerms({ paymentTerms: '   ' }), '');
  assert.equal(encodeTerms(null), '');
  assert.equal(withTerms('a=1', {}), 'a=1');
  assert.equal(withTerms('%7B%22walls%22%3A%5B%5D%7D', {}), '%7B%22walls%22%3A%5B%5D%7D');
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const got = decodeTerms(encodeTerms({ depositPercent: '50', paymentTerms: essay }));
  assert.equal(got.paymentTerms, undefined);
  assert.equal(got.depositPercent, '50');
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
  assert.deepEqual(overlongTerms(null), []);
});

test('a term of exactly the limit still travels', () => {
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.deepEqual(overlongTerms({ paymentTerms: exact }), []);
  assert.equal(decodeTerms(encodeTerms({ paymentTerms: exact })).paymentTerms, exact);
});

test('a term at the ceiling still travels', () => {
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.equal(decodeTerms(encodeTerms({ paymentTerms: exact })).paymentTerms, exact);
});

test('a deposit that is not a usable number never reaches the panel', () => {
  for (const bad of ['-5', 'abc', 'NaN', 'Infinity', '']) {
    const encoded = encodeTerms({ depositPercent: bad });
    assert.equal(new URLSearchParams(encoded).has('depositPercent'), false, `${bad} was accepted`);
  }
  // and a crafted link is refused on the way in too
  assert.equal(decodeTerms('depositPercent=-5').depositPercent, undefined);
  assert.equal(decodeTerms('depositPercent=abc').depositPercent, undefined);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const crafted = new URLSearchParams({ paymentTerms: 'Net \u001b[2J\u0007 30' }).toString();
  assert.equal(decodeTerms(crafted).paymentTerms, 'Net [2J 30');
});

test('a crafted link cannot paste an essay past the ceiling', () => {
  const crafted = new URLSearchParams({ proposalNotes: 'x'.repeat(MAX_TERM_TEXT + 1) }).toString();
  assert.equal(decodeTerms(crafted).proposalNotes, undefined);
});

test('an id the panel does not offer is not carried, in either direction', () => {
  assert.equal(new URLSearchParams(encodeTerms({ clientName: 'L. Bergstrom' })).has('clientName'), false);
  assert.equal(decodeTerms('clientName=L.+Bergstrom&companyName=Acme').clientName, undefined);
  assert.deepEqual(decodeTerms('clientName=L.+Bergstrom'), {});
});

test('every named term is one kind or the other, and no id is both', () => {
  assert.deepEqual(PROPOSAL_TERM_NUMBERS.filter(id => PROPOSAL_TERM_TEXT.includes(id)), []);
});

// ---- the hash the venture already writes ----------------------------------

test('a JSON payload comes back byte-for-byte, which is what lets it parse', () => {
  const payload = encodeURIComponent(JSON.stringify({ walls: [{ lengthFt: '20' }], tearOff: true }));
  const hash = withTerms(payload, SENT);
  const split = splitTerms(`#${hash}`);
  assert.equal(split.payload, payload);
  assert.deepEqual(JSON.parse(decodeURIComponent(split.payload)), { walls: [{ lengthFt: '20' }], tearOff: true });
  assert.deepEqual(decodeTerms(split.terms), SENT);
});

test('a query-string payload keeps every one of its own parameters', () => {
  const payload = 'heaterType=tankless&location=attic&gallons=50';
  const split = splitTerms(withTerms(payload, SENT));
  assert.equal(split.payload, payload);
  assert.deepEqual(decodeTerms(split.terms), SENT);
});

test('an ampersand or equals inside a payment-terms clause is not a boundary', () => {
  const tricky = { paymentTerms: 'Net 30 & 2% discount if paid < 10 days; rate = cost + 18%' };
  const split = splitTerms(withTerms('a=1&b=2', tricky));
  assert.equal(split.payload, 'a=1&b=2');
  assert.equal(decodeTerms(split.terms).paymentTerms, tricky.paymentTerms);
});

test('a link written before this shipped still opens, with no terms', () => {
  const payload = encodeURIComponent(JSON.stringify({ walls: [] }));
  assert.deepEqual(splitTerms(payload), { payload, terms: '' });
  assert.deepEqual(decodeTerms(''), {});
});

test('a mangled terms segment costs the terms, never the bid', () => {
  const payload = 'a=1';
  const split = splitTerms(`${payload}&${TERMS_PARAM}=%E0%A4%A`);
  assert.equal(split.payload, payload);
  assert.deepEqual(decodeTerms(split.terms), {});
});

test('a terms segment that arrives first still leaves a usable payload', () => {
  const split = splitTerms(`${TERMS_PARAM}=${encodeURIComponent('depositPercent=50')}&a=1`);
  assert.equal(split.payload, 'a=1');
  assert.equal(decodeTerms(split.terms).depositPercent, '50');
});

test('a terms segment alone leaves an empty payload rather than a broken one', () => {
  const split = splitTerms(`#${TERMS_PARAM}=${encodeURIComponent('validDays=15')}`);
  assert.equal(split.payload, '');
  assert.equal(decodeTerms(split.terms).validDays, '15');
});

// ---- the page half --------------------------------------------------------

test('readTerms takes the five off the panel and nothing else', () => {
  const page = fakePage({ ...SENT, clientName: 'L. Bergstrom', lawnSqFt: '900' });
  const values = readTerms(page.lookup);
  assert.deepEqual(values, SENT);
});

test('a page without the panel yields nothing, and a throwing lookup is survivable', () => {
  assert.deepEqual(readTerms(() => null), {});
  assert.deepEqual(readTerms(() => { throw new Error('no such id'); }), {});
  assert.deepEqual(readTerms(undefined), {});
  assert.equal(applyTerms(SENT, undefined), 0);
  assert.equal(applyTerms(SENT, () => { throw new Error('no such id'); }), 0);
});

test('applyTerms writes the fields and lets the page recompute', () => {
  const page = fakePage({ depositPercent: '30', validDays: '30', paymentTerms: '' });
  const written = applyTerms(
    { depositPercent: '50', validDays: '15', paymentTerms: 'Net 15.', proposalNotes: 'ignored' },
    page.lookup,
  );
  assert.equal(written, 3, 'a field this page does not have is not counted as written');
  assert.equal(page.nodes.depositPercent.value, '50');
  assert.equal(page.nodes.paymentTerms.value, 'Net 15.');
  assert.deepEqual(page.nodes.validDays.events, ['input', 'change']);
  assert.deepEqual(page.nodes.validDays.bubbled, [true, true], 'the proposal region listens on the document');
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

test('the ceiling matches the one in link.mjs and the shared bid spec', () => {
  assert.equal(MAX_TERM_TEXT, 512);
});

test('a terms parameter right after a leading ampersand leaves no stray separator', () => {
  const { payload, terms } = splitTerms('#&pfterms=a&k=v');
  assert.equal(payload, 'k=v');
  assert.equal(terms, 'a');
});

test('a key that merely ends in the terms name is left alone', () => {
  const { payload, terms } = splitTerms('#a=1&xpfterms=b&c=2');
  assert.equal(payload, 'a=1&xpfterms=b&c=2');
  assert.equal(terms, '');
  assert.equal(splitTerms('#xpfterms=b&pfterms=c').terms, 'c');
});

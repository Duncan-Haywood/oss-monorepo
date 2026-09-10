import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULTS,
  FORM_FIELD_IDS,
  NUMERIC_FIELD_IDS,
  SELECT_OPTIONS,
  compareExclusiveVsWide,
} from './calc.mjs';
import {
  FIELD_IDS,
  decodeInputs,
  encodeInputs,
  formValues,
  hasSharedInputs,
} from './share.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const markup = fs.readFileSync(path.join(here, 'index.html'), 'utf8');

/** A complete book, as the form holds it: every value a string. */
const book = Object.freeze({
  ebookList: '5.99',
  ebookPlan: '70',
  fileSizeMb: '3',
  deliveryPerMb: '0.15',
  ebookPaidSales: '120',
  kenpReads: '18000',
  kenpRate: '0.0044',
  paperbackList: '16.99',
  paperbackPages: '312',
  paperbackColor: 'false',
  paperbackPrintOverride: '',
  paperbackSales: '35',
  otherStoreSales: '55',
  otherStoreNet: '2.75',
  ingramSales: '14',
  ingramWholesale: '0.4',
  ingramPrintCost: '5.4',
});

test('the shared field list is calc.mjs\'s own, not a copy', () => {
  assert.deepEqual([...FIELD_IDS], [...FORM_FIELD_IDS]);
});

test('the page imports the field list rather than declaring its own', () => {
  // The list used to be restated inline in index.html. Two callers need it
  // now, and a copied rule is how this repository has twice shipped live
  // defects. If the inline array comes back, a field added to the form is
  // shareable in one file and not the other, and only a real visitor finds
  // out.
  assert.match(markup, /FORM_FIELD_IDS/);
  assert.doesNotMatch(
    markup,
    /const ids = \[\s*'ebookList'/,
    'index.html re-declared the field list instead of importing FORM_FIELD_IDS',
  );
});

test('the form field list is a strict subset of DEFAULTS', () => {
  // The five print-schedule constants are inputs to the arithmetic but not
  // controls on the page, so Object.keys(DEFAULTS) is not this list.
  for (const id of FORM_FIELD_IDS) {
    assert.ok(id in DEFAULTS, `${id} is on the form but absent from DEFAULTS`);
  }
  assert.ok(FORM_FIELD_IDS.length < Object.keys(DEFAULTS).length);
});

test('a whole book survives a round trip field by field', () => {
  const values = formValues(decodeInputs(encodeInputs(book)));
  for (const id of FORM_FIELD_IDS) {
    assert.equal(values[id], book[id], `${id} did not survive the round trip`);
  }
});

test('a round-tripped link reaches the identical verdict', () => {
  // The defect a share link ships is a recipient who sees a different answer
  // than the sender and never finds out. Assert on the verdict, not the
  // inputs.
  const sender = compareExclusiveVsWide(book);
  const recipient = compareExclusiveVsWide(formValues(decodeInputs(encodeInputs(book))));
  assert.deepEqual(recipient, sender);
});

test('an unrecognised select value is dropped, never left silently standing', () => {
  // Assigning an unknown value to a <select> does not throw and does not
  // clear it -- the previous option stays selected. A link saying
  // `ebookPlan=50` would therefore compute a 70%-plan royalty while claiming
  // to be something else.
  for (const [id, options] of Object.entries(SELECT_OPTIONS)) {
    const decoded = decodeInputs(`#${id}=not-an-option`);
    assert.ok(!(id in decoded), `${id} accepted a value its <select> cannot hold`);
    // And the form falls back to the option the page ships selected, which is
    // a state the control can actually be in.
    assert.equal(formValues(decoded)[id], options[0]);
  }
});

test('both select options round-trip in both directions', () => {
  for (const [id, options] of Object.entries(SELECT_OPTIONS)) {
    for (const option of options) {
      const decoded = decodeInputs(encodeInputs({ ...book, [id]: option }));
      assert.equal(decoded[id], option, `${id}=${option} did not survive`);
    }
  }
});

test('the 35% plan really changes the answer, so carrying it matters', () => {
  // Guards the point of the previous test: if the plan made no difference,
  // dropping it silently would be harmless and the validation pointless.
  const seventy = compareExclusiveVsWide({ ...book, ebookPlan: '70' });
  const thirtyFive = compareExclusiveVsWide({ ...book, ebookPlan: '35' });
  assert.notDeepEqual(seventy, thirtyFive);
});

test('a blank print override stays blank rather than becoming zero', () => {
  // Blank means "derive the print cost from the page count". Encoded as 0 the
  // recipient's paperback would appear to cost nothing to print.
  assert.ok(!new URLSearchParams(encodeInputs(book)).has('paperbackPrintOverride'));
  const values = formValues(decodeInputs(encodeInputs(book)));
  assert.equal(values.paperbackPrintOverride, '');
  assert.deepEqual(compareExclusiveVsWide(values), compareExclusiveVsWide(book));
});

test('formValues clears numeric fields the link did not carry', () => {
  // Otherwise a sender who left the override blank and a recipient whose form
  // still held their own would be comparing two different books.
  const values = formValues(decodeInputs('#ebookList=7.99'));
  assert.equal(values.ebookList, '7.99');
  for (const id of NUMERIC_FIELD_IDS) {
    if (id === 'ebookList') continue;
    assert.equal(values[id], '', `${id} was left for the recipient's own value to fill`);
  }
});

test('an empty string is dropped, not encoded as zero', () => {
  for (const id of NUMERIC_FIELD_IDS) {
    const params = new URLSearchParams(encodeInputs({ ...book, [id]: '' }));
    assert.ok(!params.has(id), `${id} was encoded despite being blank`);
  }
});

test('junk and negatives in the fragment are ignored rather than trusted', () => {
  assert.deepEqual(
    decodeInputs('#ebookList=abc&kenpReads=-5&paperbackPages=&ingramSales=14'),
    { ingramSales: '14' },
  );
});

test('unknown parameters in a link are not carried onto the form', () => {
  const decoded = decodeInputs(`#${encodeInputs(book)}&utm_source=email&__proto__=x`);
  const expected = FORM_FIELD_IDS.filter((id) => book[id] !== '');
  assert.deepEqual(Object.keys(decoded).sort(), [...expected].sort());
});

test('both fragment and query forms decode', () => {
  const query = encodeInputs(book);
  assert.deepEqual(decodeInputs(`#${query}`), decodeInputs(`?${query}`));
  assert.deepEqual(decodeInputs(query), decodeInputs(`#${query}`));
});

test('an empty or absent source decodes to nothing', () => {
  for (const source of ['', '#', '?', null, undefined]) {
    assert.deepEqual(decodeInputs(source), {});
    assert.equal(hasSharedInputs(decodeInputs(source)), false);
  }
});

test('hasSharedInputs decides whether the page opens on a link or its defaults', () => {
  assert.equal(hasSharedInputs(decodeInputs(encodeInputs(book))), true);
  assert.equal(hasSharedInputs(decodeInputs('#ebookList=4.99')), true);
  assert.equal(hasSharedInputs({}), false);
});

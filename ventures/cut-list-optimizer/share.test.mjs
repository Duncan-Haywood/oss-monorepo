import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  encodeInputs, decodeInputs, shareUrl, isSafeLength,
  SHARED_FIELD_IDS, BOOLEAN_FIELD_IDS, TAB_PARAM, SAFE_URL_LENGTH,
} from './share.mjs';
import { DRAFT_FIELDS } from './draft.mjs';
import { parsePanels, parseOnHandSheets, optimizeSheets } from './sheet.mjs';

const markup = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');

/** A small, realistic job: a bookcase in 3/4 ply, plus one offcut on the rack. */
const FILLED = Object.freeze({
  'sheet-width': '96',
  'sheet-height': '48',
  'sheet-kerf': '0.125',
  'sheet-trim': '0.25',
  'sheet-cost': '68',
  'sheet-parts': 'Side: 72 x 11.25 x 2\nShelf: 31.5 x 11.25 x 4\nTop: 31.5 x 11.25 x 2',
  'sheet-onhand': '31.5 x 11.25',
  'sheet-unit': 'in',
  'sheet-rotate': true,
  stock: '96',
  kerf: '0.125',
  cuts: '48 x 2\n24 x 6\n12.5',
  unit: 'in',
  'stock-cost': '14',
  onhand: '36 x 2\n22',
  currency: 'USD',
});

test('the shared field list is the form\'s own, not a copy that can drift', () => {
  assert.deepEqual([...SHARED_FIELD_IDS], [...DRAFT_FIELDS]);
});

test('index.html imports the field list rather than declaring a second one', () => {
  // The duplication this replaced was real: the list lived in the page and
  // would have been copied into share.mjs. A field added to one copy and not
  // the other still restores, onto the wrong number.
  assert.match(markup, /import \{[^}]*DRAFT_FIELDS[^}]*\} from '\.\/draft\.mjs'/);
  assert.doesNotMatch(markup, /const DRAFT_FIELDS = \[/);
});

test('a full plan survives the round trip unchanged', () => {
  const { values, tab } = decodeInputs(encodeInputs(FILLED, 'sheet'));
  assert.deepEqual(values, FILLED);
  assert.equal(tab, 'sheet');
});

test('a round-tripped link computes the same sheet plan as the form it came from', () => {
  const plan = (values) => optimizeSheets({
    sheetWidth: Number(values['sheet-width']),
    sheetHeight: Number(values['sheet-height']),
    kerf: Number(values['sheet-kerf']),
    trim: Number(values['sheet-trim']),
    panels: parsePanels(values['sheet-parts']),
    allowRotation: values['sheet-rotate'],
    onHand: parseOnHandSheets(values['sheet-onhand']),
  });
  const direct = plan(FILLED);
  const viaLink = plan(decodeInputs(encodeInputs(FILLED, 'sheet')).values);
  assert.deepEqual(viaLink, direct);
});

test('every draft field actually rides in the link', () => {
  const params = new URLSearchParams(encodeInputs(FILLED, 'sheet'));
  for (const id of DRAFT_FIELDS) {
    assert.ok(params.has(id), `${id} is missing from the encoded link`);
  }
});

test('an unticked checkbox is carried, not dropped', () => {
  // `false` here means "do not rotate parts", which is a decision the sender
  // made about the grain. Omitting it would let the recipient's default flip
  // the layout to one the sender rejected.
  const params = new URLSearchParams(encodeInputs({ ...FILLED, 'sheet-rotate': false }, 'sheet'));
  assert.equal(params.get('sheet-rotate'), '0');
  assert.equal(decodeInputs(params.toString()).values['sheet-rotate'], false);
  for (const id of BOOLEAN_FIELD_IDS) {
    assert.equal(typeof decodeInputs(encodeInputs(FILLED, 'sheet')).values[id], 'boolean');
  }
});

test('an empty text field is omitted so it cannot blank the recipient\'s own panel', () => {
  const partial = { ...FILLED, cuts: '', onhand: '', 'stock-cost': '' };
  const params = new URLSearchParams(encodeInputs(partial, 'sheet'));
  assert.equal(params.has('cuts'), false);
  assert.equal(params.has('onhand'), false);
  const { values } = decodeInputs(params.toString());
  assert.equal('cuts' in values, false);
});

test('the link opens on the panel it was copied from', () => {
  assert.equal(decodeInputs(encodeInputs(FILLED, 'linear')).tab, 'linear');
  assert.equal(decodeInputs(encodeInputs(FILLED, 'sheet')).tab, 'sheet');
});

test('an unknown or missing tab falls back to null rather than a broken panel', () => {
  assert.equal(decodeInputs(encodeInputs(FILLED, 'nonsense')).tab, null);
  assert.equal(decodeInputs(encodeInputs(FILLED, undefined)).tab, null);
  assert.equal(decodeInputs(`${TAB_PARAM}=../../etc`).tab, null);
});

test('an unknown parameter cannot inject a field into the form', () => {
  const { values } = decodeInputs('stock=96&__proto__=x&adminOverride=1&kerf=0.125');
  assert.deepEqual(values, { stock: '96', kerf: '0.125' });
  assert.equal(Object.hasOwn(values, 'adminOverride'), false);
  assert.equal({}.adminOverride, undefined);
});

test('a leading # or ? is accepted, and junk decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs('#stock=96').values, { stock: '96' });
  assert.deepEqual(decodeInputs('?stock=96').values, { stock: '96' });
  assert.deepEqual(decodeInputs('').values, {});
  assert.deepEqual(decodeInputs(null), { values: {}, tab: null });
  assert.deepEqual(decodeInputs(undefined), { values: {}, tab: null });
});

test('newlines in a parts list survive the round trip', () => {
  // The parts list is the whole payload and it is multi-line. An encoding that
  // lost the line breaks would deliver one unparseable part.
  const { values } = decodeInputs(encodeInputs(FILLED, 'sheet'));
  assert.equal(values['sheet-parts'], FILLED['sheet-parts']);
  assert.equal(values['sheet-parts'].split('\n').length, 3);
  assert.equal(parsePanels(values['sheet-parts']).length, parsePanels(FILLED['sheet-parts']).length);
});

test('shareUrl puts the payload in the fragment, never the query string', () => {
  const url = shareUrl('https://example.test/cut-list-optimizer/', FILLED, 'sheet');
  assert.ok(url.includes('#'));
  assert.equal(url.split('#')[0].includes('?'), false);
  assert.deepEqual(decodeInputs(url.split('#')[1]).values, FILLED);
});

test('shareUrl rebuilds from the plan on screen, not the link the page arrived on', () => {
  const arrived = 'https://example.test/cut-list-optimizer/#stock=1&kerf=9';
  const url = shareUrl(arrived, { ...FILLED, stock: '120' }, 'linear');
  assert.equal(url.split('#')[0], 'https://example.test/cut-list-optimizer/');
  assert.equal(decodeInputs(url.split('#')[1]).values.stock, '120');
  assert.equal(decodeInputs(url.split('#')[1]).values.kerf, '0.125');
});

test('a realistic job produces a link short enough to paste', () => {
  assert.ok(isSafeLength(shareUrl('https://example.test/cut-list-optimizer/', FILLED, 'sheet')));
});

test('an oversized parts list is reported as too long rather than truncated', () => {
  const huge = { ...FILLED, 'sheet-parts': Array.from({ length: 400 }, (_, i) => `Part ${i}: 30 x 12 x 1`).join('\n') };
  const url = shareUrl('https://example.test/cut-list-optimizer/', huge, 'sheet');
  assert.ok(url.length > SAFE_URL_LENGTH);
  assert.equal(isSafeLength(url), false);
});

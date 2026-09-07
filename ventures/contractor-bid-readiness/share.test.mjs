import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  encodeInputs, decodeInputs, TEXT_FIELD_IDS, DATE_FIELD_IDS, ROW_STATUSES, MAX_ROW_TEXT, MAX_ROWS,
} from './share.mjs';

const sample = {
  opportunity: 'County school roof RFP',
  due: '2026-12-01',
  items: [
    { name: 'W-9', owner: 'Pat', status: 'ready', note: 'Signed and on file' },
    { name: 'Insurance certificate', owner: 'Sam', status: 'blocked', note: 'Renewal requested' },
    { name: 'Pricing form', owner: '', status: 'attention', note: '' },
  ],
};

test('round-trips the opportunity header and every requirement row', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('the page has the button, status line, and decode-before-first-render wiring', () => {
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /<button id="copyShare" type="button">Copy shareable link<\/button>/);
  assert.match(page, /id="shareStatus"/);
  assert.match(page, /import \{ encodeInputs, decodeInputs \} from '.\/share\.mjs';/);
  // Decoded before the two placeholder rows are ever added, so a recipient
  // opening a shared link sees the sender's requirements, not the example.
  assert.match(page, /const shared = decodeInputs\(window\.location\.hash \|\| window\.location\.search\);/);
  assert.match(page, /shared\.items\.forEach\(item => add\(item\)\)/);
});

test('every top-level field index.html reads has a share slot', () => {
  // index.html reads #opportunity and #due directly by id, and reads each
  // requirement row's inputs via readItems(). This pins the two scalar ids
  // this module carries -- a third field added to the opportunity panel and
  // not added here would silently vanish from every shared link.
  assert.deepEqual([...TEXT_FIELD_IDS, ...DATE_FIELD_IDS].sort(), ['due', 'opportunity'].sort());
});

test('every field readItems() collects on a row is carried', () => {
  // readItems() in index.html returns { name, owner, status, note } per row --
  // this is that same shape, spelled out here so a field added to one place
  // and not the other fails a test instead of shipping a silently smaller
  // shared checklist.
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const readItems = /const readItems = \(\) => \[\.\.\.items\.children\]\.map\(row=>\{const fields=row\.querySelectorAll\('input'\); return \{name:fields\[0\]\.value,owner:fields\[1\]\.value,status:row\.querySelector\('select'\)\.value,note:fields\[2\]\.value\};\}\);/;
  assert.match(page, readItems, 'this test and index.html have drifted apart on what a row reads');
  const row = decodeInputs(encodeInputs({ items: [{ name: 'x', owner: 'o', status: 'ready', note: 'n' }] })).items[0];
  assert.deepEqual(Object.keys(row).sort(), ['name', 'note', 'owner', 'status']);
});

test('omits a blank field rather than sending a placeholder value', () => {
  const encoded = encodeInputs({});
  assert.equal(encoded, '');
  assert.deepEqual(decodeInputs(encoded), {});
});

test('drops a row with no usable name, matching index.html\'s own filter', () => {
  const encoded = encodeInputs({ items: [{ name: '   ', owner: 'Pat', status: 'ready', note: 'x' }] });
  assert.deepEqual(decodeInputs(encoded), {});
});

test('rejects a status the form never offers, and a decoded unknown status falls back to attention', () => {
  const encoded = encodeInputs({ items: [{ name: 'Bond', owner: '', status: 'DROP TABLE', note: '' }] });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.items[0].status, 'attention');
  for (const status of ROW_STATUSES) assert.ok(['ready', 'attention', 'blocked'].includes(status));
});

test('rejects a fragment that is not date-shaped', () => {
  assert.equal(decodeInputs('due=not-a-date').due, undefined);
});

test('a date-shaped but calendar-invalid string still passes through, for model.mjs to treat as no deadline', () => {
  assert.equal(decodeInputs('due=2099-13-40').due, '2099-13-40');
});

test('caps rows at MAX_ROWS so a crafted link cannot grow the checklist without bound', () => {
  const items = Array.from({ length: MAX_ROWS + 50 }, (_, i) => ({ name: `Item ${i}`, owner: '', status: 'ready', note: '' }));
  const decoded = decodeInputs(encodeInputs({ items }));
  assert.equal(decoded.items.length, MAX_ROWS);
});

test('truncates an over-long row cell rather than dropping the whole row', () => {
  const longName = 'x'.repeat(MAX_ROW_TEXT + 40);
  const decoded = decodeInputs(encodeInputs({ items: [{ name: longName, owner: '', status: 'ready', note: '' }] }));
  assert.equal(decoded.items[0].name.length, MAX_ROW_TEXT);
});

test('a row cell can contain the separators without corrupting other rows', () => {
  const items = [
    { name: 'Scope, pricing: v2', owner: 'A:B', status: 'ready', note: 'note, with, commas' },
    { name: 'Second item', owner: '', status: 'blocked', note: '' },
  ];
  assert.deepEqual(decodeInputs(encodeInputs({ items })).items, items);
});

test('accepts hash or query prefixes', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
});

test('ignores empty, missing, and non-string input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(), {});
  assert.deepEqual(encodeInputs(), '');
  assert.deepEqual(encodeInputs(undefined), '');
});

test('drops unknown top-level fields', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope' });
  const params = new URLSearchParams(encoded);
  assert.equal(params.has('secret'), false);
});

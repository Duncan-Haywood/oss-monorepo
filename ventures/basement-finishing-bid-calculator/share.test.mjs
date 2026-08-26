// Round-trip tests for the bid link.
//
// Dependency-free like the rest of this venture's suite: the DOM here is a
// handful of plain objects, which is enough because share.mjs only ever reads
// `type`, `tagName`, `options`, `value`, `checked` and `dataset`.
//
// The field names below are deliberately generic. share.mjs has no knowledge
// of this calculator's fields — that is the property under test — so pinning
// these cases to real ids would test the fixture rather than the module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBid, decodeBid, applyBid, bidLink, copyText, readShareValues } from './share.mjs';

function number(value = '') {
  return { type: 'number', tagName: 'INPUT', value: String(value), dataset: {} };
}

function checkbox(checked = false) {
  return { type: 'checkbox', tagName: 'INPUT', checked, dataset: {} };
}

function select(value, optionValues) {
  return {
    tagName: 'SELECT',
    type: 'select-one',
    value,
    options: optionValues.map((option) => ({ value: option })),
    dataset: {},
  };
}

function fakeDoc(fields) {
  return { getElementById: (id) => fields[id] ?? null };
}

test('a bid survives the round trip unchanged', () => {
  const input = {
    scope: 'full',
    quantity: '3',
    hourlyWage: '48.50',
    proposedPrice: '',
    includeHaul: true,
    includeExtra: false,
  };
  const decoded = decodeBid(`#${encodeBid(input)}`);

  // The empty optional field is the one value that legitimately drops: an
  // absent id restores as "leave the recipient's blank alone".
  assert.deepEqual({ ...decoded }, {
    scope: 'full',
    quantity: '3',
    hourlyWage: '48.50',
    includeHaul: '1',
    includeExtra: '0',
  });
});

test('a field invented after this test was written still reaches the link', () => {
  // The regression this module is shaped around: a field the calculator reads
  // but the link drops makes the recipient price a different job. There is no
  // allowlist to drift out of date, so a new id needs no change here.
  const values = Object.fromEntries(
    ['scope', 'quantity', 'travelMiles', 'hourlyWage', 'burdenRate',
      'overheadRate', 'targetMargin', 'aFieldAddedNextYear']
      .map((id, index) => [id, String(index + 1)]),
  );
  const decoded = decodeBid(`#${encodeBid(values)}`);
  assert.deepEqual(Object.keys(decoded).sort(), Object.keys(values).sort());
});

test('an ordinary in-page anchor is not a bid', () => {
  assert.equal(decodeBid('#faq'), null);
  assert.equal(decodeBid('#how-much-to-charge'), null);
  assert.equal(decodeBid(''), null);
  assert.equal(decodeBid(undefined), null);
});

test('an over-long fragment is refused rather than parsed', () => {
  assert.equal(decodeBid(`#bid=1&x=${'9'.repeat(12001)}`), null);
});

test('prototype-polluting keys never reach the values object', () => {
  const decoded = decodeBid('#bid=1&__proto__=polluted&hourlyWage=40');
  assert.equal(decoded.hourlyWage, '40');
  assert.equal(Object.prototype.hasOwnProperty.call(decoded, '__proto__'), false);
  assert.equal({}.polluted, undefined);
});

test('non-primitive values are dropped rather than serialised as [object Object]', () => {
  const decoded = decodeBid(`#${encodeBid({ good: '4', bad: { a: 1 }, worse: () => {}, nan: Number.NaN })}`);
  assert.deepEqual({ ...decoded }, { good: '4' });
});

test('applyBid writes values back onto the page', () => {
  const fields = {
    quantity: number('1'),
    hourlyWage: number('40'),
    includeHaul: checkbox(false),
    scope: select('basic', ['basic', 'full']),
  };
  const report = applyBid(fakeDoc(fields), decodeBid(`#${encodeBid({
    quantity: '3', hourlyWage: '48.50', includeHaul: true, scope: 'full',
  })}`));

  assert.equal(fields.quantity.value, '3');
  assert.equal(fields.hourlyWage.value, '48.50');
  assert.equal(fields.includeHaul.checked, true);
  assert.equal(fields.scope.value, 'full');
  assert.equal(report.restored, 4);
  assert.equal(report.changed, 4);
});

test('only fields the link actually changed are marked edited', () => {
  // The calculators refuse to overwrite an edited field when a preset kit is
  // applied. Marking an untouched default as edited would leave the recipient
  // unable to switch presets on fields the sender never typed in.
  const fields = { hourlyWage: number('40'), burdenRate: number('28') };
  applyBid(fakeDoc(fields), decodeBid(`#${encodeBid({ hourlyWage: '40', burdenRate: '35' })}`));

  assert.equal(fields.hourlyWage.dataset.edited, undefined);
  assert.equal(fields.burdenRate.dataset.edited, '1');
});

test('a select is left alone when the link names an option it does not have', () => {
  // Assigning an unknown value to a <select> silently blanks it, which would
  // reprice the job against no scope at all.
  const fields = { scope: select('basic', ['basic', 'full']) };
  const report = applyBid(fakeDoc(fields), decodeBid('#bid=1&scope=retired-preset'));

  assert.equal(fields.scope.value, 'basic');
  assert.deepEqual(report.skipped, ['scope']);
  assert.equal(report.restored, 0);
});

test('ids the page no longer has are reported, not thrown', () => {
  const fields = { hourlyWage: number('40') };
  const report = applyBid(fakeDoc(fields), decodeBid('#bid=1&hourlyWage=55&removedLastYear=9'));

  assert.equal(fields.hourlyWage.value, '55');
  assert.deepEqual(report.skipped, ['removedLastYear']);
});

test('applyBid tolerates a missing document or missing values', () => {
  assert.deepEqual(applyBid(null, { a: '1' }), { restored: 0, changed: 0, skipped: [] });
  assert.deepEqual(applyBid(fakeDoc({}), null), { restored: 0, changed: 0, skipped: [] });
});

test('bidLink replaces an existing fragment instead of stacking one', () => {
  const first = bidLink('https://example.test/tool/', { hourlyWage: '40' });
  const second = bidLink(first, { hourlyWage: '55' });

  assert.equal(second.split('#').length, 2);
  assert.match(second, /hourlyWage=55/);
  assert.doesNotMatch(second, /hourlyWage=40/);
});

test('the link carries no host-visible query string', () => {
  // The privacy claim on the page: a fragment is never sent to a server.
  const link = bidLink('https://example.test/tool/', { hourlyWage: '95', proposedPrice: '2400' });
  const url = new URL(link);
  assert.equal(url.search, '');
  assert.match(url.hash, /hourlyWage=95/);
});

test('copyText falls back to a textarea when the clipboard is unavailable', async () => {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard) delete globalThis.navigator.clipboard;
  const appended = [];
  const doc = {
    createElement: () => ({
      setAttribute() {}, style: {}, select() {}, remove() {}, set value(text) { appended.push(text); },
    }),
    body: { append() {} },
    execCommand: () => true,
  };

  assert.equal(await copyText(doc, 'a bid'), true);
  assert.deepEqual(appended, ['a bid']);
  if (clipboard) globalThis.navigator.clipboard = clipboard;
});

test('copyText reports failure instead of claiming a copy that did not happen', async () => {
  const doc = { createElement: () => { throw new Error('no DOM'); }, body: {} };
  assert.equal(await copyText(doc, 'a bid'), false);
});

function queryDoc(fields) {
  // Tag the field objects in place rather than copying them, so a write
  // through applyBid is visible on the same object the test asserts against.
  const all = Object.entries(fields).map(([id, field]) => Object.assign(field, { id }));
  return { querySelectorAll: () => all, getElementById: (id) => all.find((f) => f.id === id) ?? null };
}

test('readShareValues snapshots whatever controls the page has', () => {
  const doc = queryDoc({
    quantity: number('4'),
    scope: select('full', ['basic', 'full']),
    includeHaul: checkbox(true),
    // Presentational, not priced from — but the summary the recipient copies
    // is titled from it, so it belongs in the link all the same.
    jobPresets: select('2', ['', '1', '2']),
  });

  assert.deepEqual(readShareValues(doc), {
    quantity: '4', scope: 'full', includeHaul: true, jobPresets: '2',
  });
});

test('the usage opt-out never travels in a link', () => {
  // Someone else's choice about counting on their own machine is not part of
  // the job being priced, and a link must not switch it back on for them.
  const doc = queryDoc({ quantity: number('4'), usageOptOut: checkbox(true) });
  assert.deepEqual(Object.keys(readShareValues(doc)), ['quantity']);
});

test('readShareValues tolerates a document that cannot be queried', () => {
  assert.deepEqual(readShareValues(null), {});
  assert.deepEqual(readShareValues({}), {});
});

test('a page snapshot round-trips through the link and back onto the page', () => {
  // The end-to-end property, in one test: what the sender's page held is what
  // the recipient's page ends up holding.
  const sender = queryDoc({
    quantity: number('4'),
    hourlyWage: number('62'),
    scope: select('full', ['basic', 'full']),
    includeHaul: checkbox(true),
    usageOptOut: checkbox(true),
  });
  const recipientFields = {
    quantity: number('1'),
    hourlyWage: number('40'),
    scope: select('basic', ['basic', 'full']),
    includeHaul: checkbox(false),
    usageOptOut: checkbox(false),
  };

  applyBid(queryDoc(recipientFields), decodeBid(`#${encodeBid(readShareValues(sender))}`));

  assert.equal(recipientFields.quantity.value, '4');
  assert.equal(recipientFields.hourlyWage.value, '62');
  assert.equal(recipientFields.scope.value, 'full');
  assert.equal(recipientFields.includeHaul.checked, true);
  assert.equal(recipientFields.usageOptOut.checked, false);
});

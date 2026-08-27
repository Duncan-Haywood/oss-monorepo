import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_KIND,
  BACKUP_VERSION,
  BACKUP_WIDGET_HTML,
  BACKUP_WIDGET_SCRIPT,
  MAX_BACKUP_BYTES,
  backupFilename,
  buildBackup,
  countBids,
  mergeBids,
  parseBackup,
  restoreSummary,
} from './backup.mjs';
import { MAX_SAVED_BIDS } from './jobs.mjs';
import { SHOP_RATE_FIELDS } from './rates.mjs';

const bid = (name, at, fields = { roofArea: '2400' }) => ({ name, at, fields });

const store = (overrides = {}) => ({
  'gutter-bid-calculator': [bid('14 Oak St — Mrs Reid', '2026-08-20T10:00:00.000Z')],
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildBackup
// ---------------------------------------------------------------------------

test('buildBackup writes a kind and a version so a stray JSON file is not mistaken for one', () => {
  const backup = buildBackup({ bids: store(), at: '2026-08-27T09:00:00.000Z' });
  assert.equal(backup.kind, BACKUP_KIND);
  assert.equal(backup.v, BACKUP_VERSION);
  assert.equal(backup.at, '2026-08-27T09:00:00.000Z');
  assert.equal(countBids(backup.bids), 1);
});

test('buildBackup drops a slug that is not the shape the build produces', () => {
  const backup = buildBackup({
    bids: { '../evil': [bid('x', '2026-08-20T10:00:00.000Z')], ...store() },
  });
  assert.deepEqual(Object.keys(backup.bids), ['gutter-bid-calculator']);
});

test('buildBackup carries shop rates, and omits the key entirely when there are none', () => {
  const withRates = buildBackup({ bids: store(), rates: { hourlyWage: 38, targetMargin: 22 } });
  assert.deepEqual(withRates.rates, { hourlyWage: 38, targetMargin: 22 });

  const without = buildBackup({ bids: store() });
  assert.ok(!('rates' in without), 'an absent key restores nothing; a null one invites a reader to clear');
});

test('buildBackup normalises the bids it writes, so a corrupt store cannot be backed up as-is', () => {
  const backup = buildBackup({
    bids: { 'gutter-bid-calculator': [bid('ok', '2026-08-20T10:00:00.000Z'), { name: 'no at' }, 7] },
  });
  assert.equal(backup.bids['gutter-bid-calculator'].length, 1);
});

test('backupFilename sorts by date in a downloads folder, and survives a missing stamp', () => {
  assert.equal(backupFilename('2026-08-27T09:00:00.000Z'), 'saved-bids-2026-08-27.json');
  assert.equal(backupFilename(null), 'saved-bids-export.json');
});

// ---------------------------------------------------------------------------
// parseBackup — every failure is an ordinary thing a person does with a picker
// ---------------------------------------------------------------------------

test('parseBackup round-trips what buildBackup wrote', () => {
  const text = JSON.stringify(buildBackup({ bids: store(), rates: { hourlyWage: 38 } }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(countBids(parsed.bids), 1);
  assert.deepEqual(parsed.rates, { hourlyWage: 38 });
  assert.equal(parsed.skipped, 0);
});

test('parseBackup refuses a file that is not from this site rather than importing half of it', () => {
  for (const text of [
    '',
    '   ',
    'not json at all',
    '[]',
    'null',
    JSON.stringify({ bids: store() }), // right shape, no kind
    JSON.stringify({ kind: 'something-else', v: 1, bids: store() }),
  ]) {
    const parsed = parseBackup(text);
    assert.equal(parsed.ok, false, `should have refused: ${text.slice(0, 40)}`);
    assert.match(parsed.error, /\S/);
  }
});

test('parseBackup refuses a backup from a version this build cannot read', () => {
  const parsed = parseBackup(JSON.stringify({ kind: BACKUP_KIND, v: 2, bids: store() }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /different version/);
});

test('parseBackup refuses a file too large to be a backup, before parsing it', () => {
  const parsed = parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /too large/);
});

test('parseBackup rejects a slug that could be used to build a selector or an href', () => {
  const parsed = parseBackup(JSON.stringify({
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    bids: {
      '../../etc': [bid('a', '2026-08-20T10:00:00.000Z')],
      'gutter-bid-calculator": [], "x': [bid('b', '2026-08-20T10:00:00.000Z')],
      'gutter-bid-calculator': [bid('c', '2026-08-20T10:00:00.000Z')],
    },
  }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.bids), ['gutter-bid-calculator']);
  // Not silently: the two refused rows are counted so the page can say so.
  assert.equal(parsed.skipped, 2);
});

test('parseBackup counts entries it could not read instead of swallowing them', () => {
  const parsed = parseBackup(JSON.stringify({
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    bids: {
      'gutter-bid-calculator': [
        bid('keeps', '2026-08-20T10:00:00.000Z'),
        { name: 'no timestamp', fields: { a: '1' } },
        { at: '2026-08-20T10:00:00.000Z', fields: { a: '1' } },
        'nonsense',
      ],
    },
  }));
  assert.equal(parsed.ok, true);
  assert.equal(countBids(parsed.bids), 1);
  assert.equal(parsed.skipped, 3);
});

test('parseBackup says a file held nothing readable rather than reporting an empty success', () => {
  const empty = parseBackup(JSON.stringify({ kind: BACKUP_KIND, v: BACKUP_VERSION, bids: {} }));
  assert.equal(empty.ok, false);
  assert.match(empty.error, /no saved bids/);

  const unreadable = parseBackup(JSON.stringify({
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    bids: { 'gutter-bid-calculator': [{ name: 'no timestamp' }] },
  }));
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.error, /this site can read/);
});

test('parseBackup drops rates outside what a calculator would accept', () => {
  const margin = SHOP_RATE_FIELDS.find((f) => f.id === 'targetMargin');
  const parsed = parseBackup(JSON.stringify({
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    bids: store(),
    rates: { hourlyWage: 38, targetMargin: margin.max + 1, burdenRate: -5, notARate: 9 },
  }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rates, { hourlyWage: 38 });
});

// ---------------------------------------------------------------------------
// mergeBids — the rule that a restore never deletes
// ---------------------------------------------------------------------------

test('a restore adds to what is already here and removes nothing', () => {
  const mine = store();
  const theirs = { 'roof-bid-calculator': [bid('9 Elm — Mr Ives', '2026-08-25T10:00:00.000Z')] };
  const merged = mergeBids(mine, theirs);

  assert.equal(countBids(merged.bids), 2);
  assert.equal(merged.bids['gutter-bid-calculator'][0].name, '14 Oak St — Mrs Reid');
  assert.deepEqual(
    { added: merged.added, replaced: merged.replaced, unchanged: merged.unchanged },
    { added: 1, replaced: 0, unchanged: 0 },
  );
});

test('the same job in both keeps the newer save, whichever side it is on', () => {
  const older = bid('14 Oak St', '2026-08-20T10:00:00.000Z', { roofArea: '2400' });
  const newer = bid('14 Oak St', '2026-08-26T10:00:00.000Z', { roofArea: '2600' });

  const fileIsNewer = mergeBids(
    { 'gutter-bid-calculator': [older] },
    { 'gutter-bid-calculator': [newer] },
  );
  assert.equal(fileIsNewer.bids['gutter-bid-calculator'][0].fields.roofArea, '2600');
  assert.equal(fileIsNewer.replaced, 1);

  // The case that makes "never deletes" real: an old backup restored onto a
  // device that has since re-priced the job must not take it back in time.
  const deviceIsNewer = mergeBids(
    { 'gutter-bid-calculator': [newer] },
    { 'gutter-bid-calculator': [older] },
  );
  assert.equal(deviceIsNewer.bids['gutter-bid-calculator'][0].fields.roofArea, '2600');
  assert.equal(deviceIsNewer.unchanged, 1);
  assert.equal(deviceIsNewer.replaced, 0);
});

test('a merge past the per-tool cap drops the oldest and says how many', () => {
  const many = (prefix, count, month) =>
    Array.from({ length: count }, (_, i) =>
      bid(`${prefix} ${i}`, `2026-${month}-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`));

  const merged = mergeBids(
    { 'gutter-bid-calculator': many('mine', 20, '07') },
    { 'gutter-bid-calculator': many('theirs', 20, '08') },
  );
  assert.equal(merged.bids['gutter-bid-calculator'].length, MAX_SAVED_BIDS);
  assert.equal(merged.added, 20);
  assert.equal(merged.dropped, 40 - MAX_SAVED_BIDS);
  // Newest first, so what survives is the most recent — never an arbitrary 25.
  assert.equal(merged.bids['gutter-bid-calculator'][0].name, 'theirs 19');
});

test('merging an empty file into a full device changes nothing', () => {
  const mine = store();
  const merged = mergeBids(mine, {});
  assert.deepEqual(merged.bids, mine);
  assert.deepEqual(
    { added: merged.added, replaced: merged.replaced, dropped: merged.dropped },
    { added: 0, replaced: 0, dropped: 0 },
  );
});

test('merging onto a device with nothing is the whole file — the new-device case', () => {
  const theirs = store();
  const merged = mergeBids({}, theirs);
  assert.deepEqual(merged.bids, theirs);
  assert.equal(merged.added, 1);
});

test('the merge normalises both sides, so a corrupt device store cannot poison the result', () => {
  const merged = mergeBids(
    { 'gutter-bid-calculator': [{ name: 'broken' }, bid('good', '2026-08-20T10:00:00.000Z')] },
    { 'gutter-bid-calculator': [bid('fresh', '2026-08-26T10:00:00.000Z')] },
  );
  assert.equal(merged.bids['gutter-bid-calculator'].length, 2);
});

// ---------------------------------------------------------------------------
// restoreSummary — the whole of what the visitor learns
// ---------------------------------------------------------------------------

test('restoreSummary reports each count and never reports a silent drop', () => {
  const text = restoreSummary({
    added: 3, replaced: 1, unchanged: 2, dropped: 4, skipped: 1, ratesKept: true,
  });
  assert.match(text, /3 bids added/);
  assert.match(text, /1 bid updated/);
  assert.match(text, /2 bids already here/);
  assert.match(text, /1 entry in the file could not be read/);
  assert.match(text, new RegExp(`4 bids went over the ${MAX_SAVED_BIDS}-per-tool limit`));
  assert.match(text, /shop rates already set in this browser were kept/);
});

test('restoreSummary says so when a file added nothing, rather than looking like a success', () => {
  assert.match(restoreSummary({ added: 0, replaced: 0, unchanged: 0 }), /nothing new to add/);
});

test('restoreSummary distinguishes rates restored from rates kept', () => {
  assert.match(restoreSummary({ added: 1, ratesApplied: true }), /shop rates were restored/);
  assert.doesNotMatch(restoreSummary({ added: 1 }), /shop rates/);
});

// ---------------------------------------------------------------------------
// The hub widget
// ---------------------------------------------------------------------------

test('the widget is drawn even with no saved bids, because that is the browser that needs it', () => {
  // The restore control must not live inside `#bids`, which is hidden until
  // there is at least one saved bid — the empty browser is the case it exists
  // for.
  assert.match(BACKUP_WIDGET_HTML, /id="backup-file"/);
  assert.match(BACKUP_WIDGET_HTML, /id="backup-box"/);
  assert.ok(!/id="bids"/.test(BACKUP_WIDGET_HTML));
});

test('the file input is labelled and the status is announced', () => {
  assert.match(BACKUP_WIDGET_HTML, /<label for="backup-file"/);
  assert.match(BACKUP_WIDGET_HTML, /id="backup-status"[^>]*aria-live="polite"/);
});

test('the widget tells the visitor what is in the file before they move it', () => {
  assert.match(BACKUP_WIDGET_HTML, /job names and numbers you typed/);
  assert.match(BACKUP_WIDGET_HTML, /never deletes a bid/);
});

test('the hub script keeps the file on the device and counts without naming anything', () => {
  assert.match(BACKUP_WIDGET_SCRIPT, /createObjectURL/);
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(BACKUP_WIDGET_SCRIPT),
    'a backup that uploaded anything would contradict the copy on every page of this site');
  for (const event of ['bids_backup_downloaded', 'bids_backup_restored', 'bids_backup_rejected']) {
    assert.ok(BACKUP_WIDGET_SCRIPT.includes(`record('${event}')`), `missing ${event}`);
  }
});

test('the panel keeps the id every tool page links to', () => {
  // `jobs.mjs` puts `<toRoot>#backup-box` in the band on 234 pages. Renaming
  // this id would leave every one of those links pointing at nothing, and
  // nothing else would fail.
  assert.match(BACKUP_WIDGET_HTML, /id="backup-box"/);
});

test('the hub script redraws the bid list after a restore', () => {
  // Being told twelve bids arrived and shown the same eight rows reads as a
  // restore that did not happen.
  assert.match(BACKUP_WIDGET_SCRIPT, /showSavedBids\(\)/);
});

test('the transcribed rate ceilings match the ones rates.mjs enforces', () => {
  // The hub cannot import, so the four fields are interpolated. A venture that
  // changes a ceiling must not leave the restore path accepting a value the
  // calculator would reject.
  for (const field of SHOP_RATE_FIELDS) {
    assert.ok(
      BACKUP_WIDGET_SCRIPT.includes(`"id":"${field.id}","max":${field.max}`),
      `${field.id} ceiling is not carried into the hub script`,
    );
  }
});

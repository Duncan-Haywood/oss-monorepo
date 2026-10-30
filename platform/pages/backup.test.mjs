import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_KIND,
  BACKUP_MERGE_HELPERS,
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
import { MAX_SAVED_BIDS, normalizeBid } from './jobs.mjs';
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

// ---------------------------------------------------------------------------
// Outcomes across two devices
// ---------------------------------------------------------------------------

const decided = (name, at, outcome, decidedAt) => ({
  ...bid(name, at),
  outcome,
  ...(decidedAt ? { decidedAt } : {}),
});

const OAK = '14 Oak St — Mrs Reid';
const AT = '2026-08-20T10:00:00.000Z';

test('a win recorded on one device is not lost by merging the other way', () => {
  // The case this whole resolution exists for. Marking a bid won does not
  // re-price it, so both copies carry the same `at` — and under "later at
  // wins" alone the incoming decision would be counted "unchanged" and thrown
  // away, leaving a won job sitting in the chase list on this device forever.
  const phone = { g: [decided(OAK, AT, 'won', '2026-08-25T09:00:00.000Z')] };
  const laptop = { g: [bid(OAK, AT)] };

  const merged = mergeBids(laptop, phone);
  assert.equal(merged.bids.g[0].outcome, 'won');
  assert.equal(merged.bids.g[0].decidedAt, '2026-08-25T09:00:00.000Z');
  // Something on this device changed, so the sentence the visitor reads must
  // not call it unchanged.
  assert.equal(merged.replaced, 1);
  assert.equal(merged.unchanged, 0);
});

test('an older backup does not un-decide a bid this device has already settled', () => {
  // The same merge in the other direction. Waiting is the absence of news, not
  // a competing claim: a file written before the customer answered must not
  // reopen a job the contractor has since won.
  const stale = { g: [bid(OAK, AT)] };
  const here = { g: [decided(OAK, AT, 'won', '2026-08-25T09:00:00.000Z')] };

  const merged = mergeBids(here, stale);
  assert.equal(merged.bids.g[0].outcome, 'won');
  assert.equal(merged.unchanged, 1);
  assert.equal(merged.replaced, 0);
});

test('between two decisions the later one wins', () => {
  const june = { g: [decided(OAK, AT, 'lost', '2026-06-01T09:00:00.000Z')] };
  const august = { g: [decided(OAK, AT, 'won', '2026-08-01T09:00:00.000Z')] };

  assert.equal(mergeBids(june, august).bids.g[0].outcome, 'won');
  assert.equal(mergeBids(august, june).bids.g[0].outcome, 'won');
});

test('a decision that says when beats one that only says what', () => {
  const dated = { g: [decided(OAK, AT, 'won', '2026-08-25T09:00:00.000Z')] };
  const undated = { g: [decided(OAK, AT, 'lost')] };
  assert.equal(mergeBids(undated, dated).bids.g[0].outcome, 'won');
  assert.equal(mergeBids(dated, undated).bids.g[0].outcome, 'won');
});

test('the later pricing still takes the numbers, and keeps the decision', () => {
  // Fields and outcome are resolved on different clocks, so a bid re-priced on
  // one device and decided on the other has to come out of the merge with both.
  const repriced = {
    g: [{ ...bid(OAK, '2026-08-26T10:00:00.000Z', { roofArea: '3000' }) }],
  };
  const won = { g: [decided(OAK, AT, 'won', '2026-08-25T09:00:00.000Z')] };

  const merged = mergeBids(won, repriced);
  assert.equal(merged.bids.g[0].fields.roofArea, '3000');
  assert.equal(merged.bids.g[0].at, '2026-08-26T10:00:00.000Z');
  assert.equal(merged.bids.g[0].outcome, 'won');
});

test('what a lost job went for travels with the decision, not with the pricing', () => {
  // The same class of defect the resolution above exists for, one field along:
  // `lostTo` belongs to the loss. Three cases, and they are not symmetric.
  const lost = (at, decidedAt, went) => ({
    ...decided(OAK, at, 'lost', decidedAt),
    ...(went ? { lostTo: went } : {}),
  });

  // 1. A later decision that the job was *won* must not leave the earlier
  //    loss's winning price attached to it — undercutSentence would average a
  //    price against a bid nobody lost.
  const flipped = mergeBids(
    { g: [lost(AT, '2026-08-24T09:00:00.000Z', '1900')] },
    { g: [decided(OAK, AT, 'won', '2026-08-26T09:00:00.000Z')] },
  );
  assert.equal(flipped.bids.g[0].outcome, 'won');
  assert.equal('lostTo' in flipped.bids.g[0], false);

  // 2. Both sides call it lost and only one knows the figure. The merge is
  //    never subtractive, so the figure survives from either side.
  for (const [a, b] of [
    [lost(AT, '2026-08-24T09:00:00.000Z', '1900'), lost(AT, '2026-08-26T09:00:00.000Z')],
    [lost(AT, '2026-08-24T09:00:00.000Z'), lost(AT, '2026-08-26T09:00:00.000Z', '1900')],
  ]) {
    assert.equal(mergeBids({ g: [a] }, { g: [b] }).bids.g[0].lostTo, '1900');
  }

  // 3. Two figures for the same loss is a correction, and the later decision
  //    carries it.
  const corrected = mergeBids(
    { g: [lost(AT, '2026-08-24T09:00:00.000Z', '1900')] },
    { g: [lost(AT, '2026-08-26T09:00:00.000Z', '2100')] },
  );
  assert.equal(corrected.bids.g[0].lostTo, '2100');
});

test('what a won job cost travels with the decision too', () => {
  // The same three cases as above, pointed at the other outcome. The first is
  // the one with teeth: marginSentence divides a cost by the bid's own price,
  // so a delivered cost left on a record this merge has just called a loss
  // would report a margin on a job that was never done.
  const won = (at, decidedAt, cost) => ({
    ...decided(OAK, at, 'won', decidedAt),
    ...(cost ? { cost } : {}),
  });

  const flipped = mergeBids(
    { g: [won(AT, '2026-08-24T09:00:00.000Z', '3400')] },
    { g: [decided(OAK, AT, 'lost', '2026-08-26T09:00:00.000Z')] },
  );
  assert.equal(flipped.bids.g[0].outcome, 'lost');
  assert.equal('cost' in flipped.bids.g[0], false);

  // Never subtractive: the device that costed the job keeps the figure even
  // when the other one marked the same win a minute later without it.
  for (const [a, b] of [
    [won(AT, '2026-08-24T09:00:00.000Z', '3400'), won(AT, '2026-08-26T09:00:00.000Z')],
    [won(AT, '2026-08-24T09:00:00.000Z'), won(AT, '2026-08-26T09:00:00.000Z', '3400')],
  ]) {
    assert.equal(mergeBids({ g: [a] }, { g: [b] }).bids.g[0].cost, '3400');
  }

  // A second figure for the same win is the last supplier invoice landing, and
  // the later decision carries it.
  const corrected = mergeBids(
    { g: [won(AT, '2026-08-24T09:00:00.000Z', '3400')] },
    { g: [won(AT, '2026-08-26T09:00:00.000Z', '3610')] },
  );
  assert.equal(corrected.bids.g[0].cost, '3610');
});

test('the delivered cost survives the round trip the hub actually performs', () => {
  // Same proof as the winning price below, through the hub's transcribed
  // copies rather than this module's: a field added to normalizeBid but left
  // out of BID_RECORD_HELPERS would be dropped here and nowhere else.
  const { normalizeBid: hub, mergeBids: hubMerge } = hubHelpers();
  const onDevice = {
    g: [{ ...decided(OAK, AT, 'won', '2026-08-24T09:00:00.000Z'), cost: '3400' }],
  };
  assert.equal(hub(onDevice.g[0]).cost, '3400');

  const file = parseBackup(JSON.stringify(buildBackup({ bids: onDevice })));
  assert.equal(file.ok, true);
  assert.equal(file.bids.g[0].cost, '3400');
  assert.equal(hubMerge({}, file.bids).bids.g[0].cost, '3400');
});

test('the winning price survives the round trip the hub actually performs', () => {
  // Driven through the hub's own transcribed code, because that is where the
  // outcome itself was silently dropped before #1905's rule was applied here.
  const { normalizeBid: hub, mergeBids: hubMerge } = hubHelpers();
  const onDevice = {
    g: [{ ...decided(OAK, AT, 'lost', '2026-08-24T09:00:00.000Z'), lostTo: '1900' }],
  };
  assert.equal(hub(onDevice.g[0]).lostTo, '1900');

  const file = parseBackup(JSON.stringify(buildBackup({ bids: onDevice })));
  assert.equal(file.ok, true);
  assert.equal(file.bids.g[0].lostTo, '1900');
  assert.equal(hubMerge({}, file.bids).bids.g[0].lostTo, '1900');
});

test('an outcome survives being written to a backup file and read back', () => {
  const file = buildBackup({ bids: { g: [decided(OAK, AT, 'lost', '2026-08-24T09:00:00.000Z')] } });
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.bids.g[0].outcome, 'lost');
  assert.equal(parsed.bids.g[0].decidedAt, '2026-08-24T09:00:00.000Z');
});

test('a backup carrying an outcome this site does not know reads as waiting', () => {
  const file = buildBackup({ bids: { g: [decided(OAK, AT, 'archived', '2026-08-24T09:00:00.000Z')] } });
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal('outcome' in parsed.bids.g[0], false);
});

// ---------------------------------------------------------------------------
// What the browser actually runs
//
// Every test above this line exercises the module. The hub used to run a
// hand-written second copy of `normalizeBid` and `mergeBids`, and that copy
// predated outcomes — so all of the above passed while a contractor's won and
// lost decisions were destroyed by any backup round trip on the live site.
// These tests evaluate the source the page is given.
// ---------------------------------------------------------------------------

/**
 * The embedded helpers, in a scope shaped like the hub script's.
 *
 * `MAX_SAVED_BIDS` is declared by the script that takes the block, not by the
 * block, so the harness has to supply it exactly as the hub does — and this is
 * also the test that the two agree about the cap.
 */
const hubHelpers = () =>
  new Function(`const MAX_SAVED_BIDS = ${MAX_SAVED_BIDS};
${BACKUP_MERGE_HELPERS}
return { normalizeBid: normalizeBid, mergeBids: mergeBids, resolveBidPair: resolveBidPair };`)();

test('the hub normalises a bid exactly as the module does', () => {
  const { normalizeBid: hub } = hubHelpers();
  for (const entry of [
    decided(OAK, AT, 'won', '2026-08-24T09:00:00.000Z'),
    decided(OAK, AT, 'lost'),
    bid(OAK, AT),
    bid('  spaced   out  ', AT),
    decided(OAK, AT, 'archived', '2026-08-24T09:00:00.000Z'),
    { name: OAK, at: AT, fields: { roofArea: '2400', usageOptOut: 'true', 'pf-x': '1' } },
    { name: '', at: AT, fields: { a: '1' } },
    null,
  ]) {
    assert.deepEqual(hub(entry), normalizeBid(entry), JSON.stringify(entry));
  }
});

test('the hub merges exactly as the module does', () => {
  const { mergeBids: hub } = hubHelpers();
  const mine = { g: [decided(OAK, AT, 'won', '2026-08-24T09:00:00.000Z')] };
  const theirs = { g: [bid(OAK, '2026-08-26T10:00:00.000Z', { roofArea: '3000' })] };
  assert.deepEqual(hub(mine, theirs), mergeBids(mine, theirs));
  assert.deepEqual(hub(theirs, mine), mergeBids(theirs, mine));
  assert.deepEqual(hub({}, theirs), mergeBids({}, theirs));
});

test('a win survives the round trip the hub actually performs', () => {
  // The defect, driven end to end through the page's own code: mark 14 Oak St
  // won, download a backup, restore it. Every step below is the hub's, and
  // before this fix the bid came back out of it waiting.
  const { normalizeBid: hub, mergeBids: hubMerge } = hubHelpers();
  const onDevice = { g: [decided(OAK, AT, 'won', '2026-08-24T09:00:00.000Z')] };

  // readBidStore(): the device's own store, normalised on the way out.
  const read = { g: onDevice.g.map((entry) => hub(entry)).filter(Boolean) };
  assert.equal(read.g[0].outcome, 'won', 'the backup file was written without the win');

  // The file, and parseBackupText() reading it back.
  const file = JSON.parse(JSON.stringify({ bids: read }));
  const incoming = { g: file.bids.g.map((entry) => hub(entry)).filter(Boolean) };

  // The restore merges the file into the store it just read.
  const merged = hubMerge(read, incoming);
  assert.equal(merged.bids.g[0].outcome, 'won', 'restoring a backup un-won the bid');
  assert.equal(merged.bids.g[0].decidedAt, '2026-08-24T09:00:00.000Z');
});

test('restoring a backup does not un-decide a bid the file never mentioned', () => {
  // The worst shape of the same defect: the device normalises its *whole*
  // store on the way into a restore, so a file about the siding calculator
  // could strip the outcomes off every bid in the gutter one.
  const { normalizeBid: hub, mergeBids: hubMerge } = hubHelpers();
  const onDevice = {
    g: [decided(OAK, AT, 'won', '2026-08-24T09:00:00.000Z')],
    s: [bid('elsewhere', AT)],
  };
  const read = {};
  for (const [slug, list] of Object.entries(onDevice)) {
    read[slug] = list.map((entry) => hub(entry)).filter(Boolean);
  }
  const merged = hubMerge(read, { s: [bid('elsewhere', '2026-08-26T10:00:00.000Z')] });
  assert.equal(merged.bids.g[0].outcome, 'won');
});

test('the hub carries no second normaliser and no second merge to drift from', () => {
  // The fix is not that the copy was corrected — it is that there is no copy.
  // A future field added to a bid must reach the browser without a second
  // edit, which is the whole reason the block is embedded by toString.
  assert.ok(!/function normalizedBid\b/.test(BACKUP_WIDGET_SCRIPT),
    'the hub script still defines its own bid normaliser');
  assert.ok(!/function mergeBidStores\b/.test(BACKUP_WIDGET_SCRIPT),
    'the hub script still defines its own merge');
  assert.ok(BACKUP_WIDGET_SCRIPT.includes(BACKUP_MERGE_HELPERS),
    'the hub script does not carry the embedded helpers');
});

test('every embedded line leaves its backticks balanced', () => {
  // `stripForInjection` joins trimmed lines, which would corrupt a template
  // literal spanning two of them. None of these functions has one; this is the
  // guard that notices when one gains it.
  for (const line of BACKUP_MERGE_HELPERS.split('\n')) {
    assert.equal((line.match(/`/g) ?? []).length % 2, 0, line);
  }
});

// ---------------------------------------------------------------------------
// Red-team guards (2026-10-27): boundaries of parseBackup, and the page's own
// copy of the same parser and its copy strings, driven through the script the
// hub actually embeds.
// ---------------------------------------------------------------------------

test('parseBackup refuses JSON null, a number and an array without throwing', () => {
  for (const text of ['null', '0', '"x"', 'true', '[]', '[{"kind":"' + BACKUP_KIND + '"}]']) {
    const parsed = parseBackup(text);
    assert.equal(parsed.ok, false, text);
    assert.equal(parsed.error, 'That file is not a backup from this site.', text);
  }
});

test('parseBackup accepts exactly 500 tools and refuses 501', () => {
  const withSlugs = (n) => {
    const bids = {};
    for (let i = 0; i < n; i++) bids[`tool-${i}`] = [bid(`job ${i}`, '2026-08-20T10:00:00.000Z')];
    return JSON.stringify({ kind: BACKUP_KIND, v: BACKUP_VERSION, bids });
  };
  assert.equal(parseBackup(withSlugs(500)).ok, true);
  assert.equal(parseBackup(withSlugs(501)).ok, false);
});

test('parseBackup keeps the timestamp a file carries, and nulls a missing or non-string one', () => {
  const read = (at) => parseBackup(JSON.stringify({ kind: BACKUP_KIND, v: BACKUP_VERSION, at, bids: store() }));
  assert.equal(read('2026-08-20T10:00:00.000Z').at, '2026-08-20T10:00:00.000Z');
  assert.equal(read(undefined).at, null);
  assert.equal(read(12345).at, null);
  assert.equal(read('').at, null);
});

// A DOM just big enough for the embedded script to run its download and
// restore handlers. The script is the string the hub ships, evaluated as is.
function runHub({ stored = {}, file } = {}) {
  const listeners = {};
  const els = {};
  const el = (id) => (els[id] ??= {
    id, hidden: true, textContent: '', value: 'x', files: null,
    addEventListener: (type, fn) => { listeners[`${id}:${type}`] = fn; },
  });
  const ls = { ...stored };
  const downloads = [];
  const sandbox = {
    document: {
      getElementById: el,
      createElement: () => ({
        click() { downloads.push(this.download); }, remove() {},
      }),
      body: { append() {} },
    },
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {},
    setTimeout: (fn) => fn(),
    BIDS_KEY: 'bids',
    record() {}, showSavedBids() {}, bidsExpanded: false,
  };
  new Function(...Object.keys(sandbox), BACKUP_WIDGET_SCRIPT)(...Object.values(sandbox));
  return { els, listeners, ls, downloads, el };
}

test('the page names the bid count in singular and plural, and the download after the day', () => {
  const day = '2026-08-20T10:00:00.000Z';
  const one = runHub({ stored: { bids: JSON.stringify({ v: 1, bids: { g: [bid('a', day)] } }) } });
  assert.match(one.els['backup-copy'].textContent, /Download your saved bid as a file/);
  const two = runHub({ stored: { bids: JSON.stringify({ v: 1, bids: { g: [bid('a', day), bid('b', day)] } }) } });
  assert.match(two.els['backup-copy'].textContent, /Download all 2 saved bids as a file/);

  const realDate = Date;
  globalThis.Date = class extends realDate {
    toISOString() { return '2026-09-03T08:15:00.000Z'; }
  };
  try {
    two.listeners['backup-download:click']();
  } finally {
    globalThis.Date = realDate;
  }
  assert.deepEqual(two.downloads, ['saved-bids-2026-09-03.json']);
});

test('the page parses a restored file as the module does, rates included', async () => {
  const rates = { hourlyWage: 38, targetMargin: 9999, burdenRate: -1 };
  const run = (text) => {
    const hub = runHub();
    hub.els['backup-file'] = Object.assign(hub.el('backup-file'), {
      files: [{ text: async () => text }],
    });
    return hub;
  };
  const text = JSON.stringify({ kind: BACKUP_KIND, v: BACKUP_VERSION, bids: store(), rates });
  const hub = run(text);
  await hub.listeners['backup-file:change']();
  assert.deepEqual(JSON.parse(hub.ls['portfolio-shop-rates']).rates, { hourlyWage: 38 });
  assert.match(hub.els['backup-status'].textContent, /^Restored: 1 bid added/);

  const textNumeric = JSON.stringify({
    kind: BACKUP_KIND, v: BACKUP_VERSION, bids: store(), rates: { hourlyWage: '41.5' },
  });
  const hub2 = run(textNumeric);
  await hub2.listeners['backup-file:change']();
  assert.deepEqual(JSON.parse(hub2.ls['portfolio-shop-rates']).rates, { hourlyWage: 41.5 });
});

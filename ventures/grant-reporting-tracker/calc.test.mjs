import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, reviewAll, reviewGrant, toCsv, loadGrants, sampleGrants, removeGrant, markReportFiled } from './calc.mjs';
import { readFileSync } from 'node:fs';

test('adds months without overflowing short months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('refuses a fractional month interval instead of silently flooring it', () => {
  // Before this, addMonths floored 1.5 to 1 and returned a real-looking date
  // -- the wrong deadline a straight 1-month interval would produce, with no
  // error at all. The Add form's step=1 blocks entering this through the UI,
  // but a row loaded from localStorage (an older save, or one edited outside
  // the page) has no such gate, so the calculator itself has to refuse it.
  assert.equal(addMonths('2026-01-15', 1.5), null);
  assert.equal(addMonths('2026-01-15', 0.5), null);
});

test('a grant with a fractional interval reports "Check inputs" rather than a wrong due date', () => {
  const row = reviewGrant(
    { name: 'Corrupted row', awardDate: '2026-01-15', intervalMonths: '1.5', awardAmount: 1000, spentAmount: 0 },
    '2026-01-16',
  );
  assert.equal(row.nextReport, null);
  assert.equal(row.daysUntilReport, null);
  assert.equal(row.status, 'Check inputs');
});

test('orders grants and labels overdue and due-soon reports', () => {
  const rows = reviewAll([
    { name: 'Future', funder: 'A', awardDate: '2026-01-01', intervalMonths: 12, awardAmount: 100, spentAmount: 25 },
    { name: 'Late', funder: 'B', awardDate: '2025-01-01', intervalMonths: 6, awardAmount: 80, spentAmount: 20 },
  ], '2026-08-24');
  assert.equal(rows[0].name, 'Late');
  assert.equal(rows[0].status, 'Overdue');
  assert.equal(rows[0].restrictedBalance, 60);
  assert.equal(rows[1].status, 'On track');
});

test('the next report rolls forward from the last one filed, not always from the award date', () => {
  // A 2023 award reporting quarterly, filed on schedule every time: without
  // lastReportFiled the old behavior pinned nextReport to the very first
  // 2023 due date, forever. With the most recent filing recorded, the next
  // due date is one interval past it.
  const row = reviewGrant(
    { name: 'Multi-year award', awardDate: '2023-01-01', intervalMonths: 3, lastReportFiled: '2026-07-01', awardAmount: 0, spentAmount: 0 },
    '2026-08-24',
  );
  assert.equal(row.nextReport, '2026-10-01');
  assert.equal(row.status, 'On track');
});

test('an award with no filing history behaves exactly as before lastReportFiled existed', () => {
  const row = reviewGrant(
    { name: 'Fresh award', awardDate: '2026-01-01', intervalMonths: 6, awardAmount: 0, spentAmount: 0 },
    '2026-08-24',
  );
  assert.equal(row.nextReport, '2026-07-01');
  assert.equal(row.status, 'Overdue');
});

test('a last-filed date before the award date or after today is ignored rather than moving the schedule the wrong way', () => {
  const beforeAward = reviewGrant(
    { name: 'Bad anchor', awardDate: '2026-01-01', intervalMonths: 6, lastReportFiled: '2025-01-01', awardAmount: 0, spentAmount: 0 },
    '2026-08-24',
  );
  assert.equal(beforeAward.nextReport, '2026-07-01', 'falls back to the award date, same as having no lastReportFiled at all');

  const inTheFuture = reviewGrant(
    { name: 'Overeager anchor', awardDate: '2026-01-01', intervalMonths: 6, lastReportFiled: '2027-01-01', awardAmount: 0, spentAmount: 0 },
    '2026-08-24',
  );
  assert.equal(inTheFuture.nextReport, '2026-07-01', 'a filed date ahead of today cannot be real, so it is ignored too');
});

test('an unparseable last-filed value is ignored, not treated as a crash or a valid anchor', () => {
  const row = reviewGrant(
    { name: 'Typo anchor', awardDate: '2026-01-01', intervalMonths: 6, lastReportFiled: 'not-a-date', awardAmount: 0, spentAmount: 0 },
    '2026-08-24',
  );
  assert.equal(row.nextReport, '2026-07-01');
});

test('escapes CSV values and preserves the review fields', () => {
  const csv = toCsv([{ name: 'Food, Inc.', funder: 'A "Funder"', nextReport: '2026-09-01', status: 'Due soon', restrictedBalance: 10 }]);
  assert.match(csv, /"Food, Inc\."/);
  assert.match(csv, /"A ""Funder"""/);
});

test('CSV export carries every field the queue reads, not just what the table shows', () => {
  // A CSV handed to a board member or a grant file is often the only copy of
  // an award outside this browser. The on-page table shows five columns;
  // the export used to match that table exactly and silently drop
  // awardDate, intervalMonths, awardAmount, spentAmount, and
  // daysUntilReport -- the figures a recipient needs to check *why* a report
  // is due, not just that it is.
  const row = reviewGrant(
    { name: 'Community garden', funder: 'Local foundation', awardDate: '2026-01-01', intervalMonths: 6, awardAmount: 1000, spentAmount: 250 },
    '2026-06-01',
  );
  const csv = toCsv([row]);
  const [header, dataLine] = csv.split('\n');
  assert.equal(
    header,
    'name,funder,awardDate,intervalMonths,lastReportFiled,nextReport,daysUntilReport,status,awardAmount,spentAmount,restrictedBalance',
  );
  for (const value of ['2026-01-01', '6', '2026-07-01', '750']) {
    assert.ok(dataLine.includes(value), `CSV row is missing ${value}: ${dataLine}`);
  }
});

test('does not mutate saved award data while reviewing', () => {
  const grant = { name: 'Annual award', awardDate: '2026-01-31', intervalMonths: '1', awardAmount: '500', spentAmount: '125' };
  const before = JSON.stringify(grant);
  reviewAll([grant], '2026-02-01');
  assert.equal(JSON.stringify(grant), before);
});

test('loads only saved grant rows and recovers from damaged local storage', () => {
  assert.deepEqual(loadGrants(null), []);
  assert.deepEqual(loadGrants(''), []);
  assert.deepEqual(loadGrants('{not json'), []);
  assert.deepEqual(loadGrants('{"awardDate":"2026-01-01"}'), []);
  // The row that used to blank the queue: a null and a string alongside a real
  // award. Both are dropped; the real award survives.
  assert.deepEqual(
    loadGrants(JSON.stringify([{ name: 'Garden' }, null, 'not a grant'])),
    [{ name: 'Garden' }],
  );
});

test('a damaged saved queue still reviews the awards that survived', () => {
  const grants = loadGrants(JSON.stringify([null, { name: 'Garden', awardDate: '2026-01-01', intervalMonths: 6, awardAmount: 1000, spentAmount: 250 }]));
  const rows = reviewAll(grants, '2026-06-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].restrictedBalance, 750);
});

test('the sample shows every status, whatever day it is loaded', () => {
  // The point of deriving the dates: run the sample on a leap day, a
  // month-end, and an ordinary day and it still demonstrates all three
  // statuses. A hard-coded fixture decays into three overdue rows.
  for (const today of ['2026-08-27', '2026-01-31', '2028-02-29', '2026-12-31', '2027-03-01']) {
    const rows = reviewAll(sampleGrants(today), today);
    assert.deepEqual(
      rows.map((row) => row.status),
      ['Overdue', 'Due soon', 'On track'],
      `sample statuses drifted when loaded on ${today}`,
    );
  }
});

test('the sample rows carry the fields the queue and CSV read', () => {
  const rows = reviewAll(sampleGrants('2026-08-27'), '2026-08-27');
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(row.name && row.funder, 'a sample row is missing its name or funder');
    assert.match(row.nextReport, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(row.restrictedBalance));
  }
  // A fully spent award is worth showing: the balance column reads 0.00, not blank.
  assert.equal(rows.find((row) => row.name === 'Winter shelter capital').restrictedBalance, 0);
});

test('reviewAll attaches the source array index, surviving the sort so a queue row can be removed by identity', () => {
  // The queue is sorted by daysUntilReport, so a row's on-screen position is
  // not its position in the saved grants array. Before sourceIndex existed
  // there was no way to translate "the third row on screen" back into "the
  // grant actually at index 2 in storage" -- the only removal available was
  // wiping every saved award at once.
  const rows = reviewAll([
    { name: 'Soonest', awardDate: '2025-01-01', intervalMonths: 1, awardAmount: 10, spentAmount: 0 },
    { name: 'Latest', awardDate: '2026-01-01', intervalMonths: 12, awardAmount: 10, spentAmount: 0 },
    { name: 'Middle', awardDate: '2026-06-01', intervalMonths: 1, awardAmount: 10, spentAmount: 0 },
  ], '2026-08-24');
  // Sorted by urgency, not input order:
  assert.deepEqual(rows.map((r) => r.name), ['Soonest', 'Middle', 'Latest']);
  // But each row still points back at its own slot in the original array:
  assert.deepEqual(rows.map((r) => r.sourceIndex), [0, 2, 1]);
});

test('removeGrant drops exactly the award at the given source index', () => {
  const grants = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  assert.deepEqual(removeGrant(grants, 1), [{ name: 'A' }, { name: 'C' }]);
  // The original array is untouched -- the page still owns replacing it.
  assert.equal(grants.length, 3);
});

test('removeGrant is a no-op on an out-of-range or malformed index, rather than deleting the wrong row', () => {
  const grants = [{ name: 'A' }, { name: 'B' }];
  assert.deepEqual(removeGrant(grants, -1), grants);
  assert.deepEqual(removeGrant(grants, 2), grants);
  assert.deepEqual(removeGrant(grants, 1.5), grants);
  assert.deepEqual(removeGrant(grants, NaN), grants);
  assert.deepEqual(removeGrant(null, 0), []);
});

test('sampleGrants survives an unusable today', () => {
  assert.deepEqual(sampleGrants('not-a-date').map((row) => row.awardDate), [null, null, null]);
});

test('reviewGrant and sampleGrants default to the visitor\'s local calendar date, not UTC\'s', () => {
  // index.html never passes `today` — `reviewAll(grants)` and `sampleGrants()`
  // both run on the default parameter, so that default is the only "today"
  // any real visitor's status ever gets computed against. It used to be
  // `new Date().toISOString().slice(0, 10)`, the UTC calendar date, which for
  // several hours a day everywhere off the meridian is a different day than
  // the one on the visitor's own clock: a report due today could read
  // "Overdue" a day early (negative UTC offsets, evening) or "On track" a day
  // past when a late filing would actually bite (positive offsets, night).
  //
  // +14 with no DST (Kiritimati) keeps local and UTC dates apart for the
  // large majority of every real day, so this is not a flaky window around
  // UTC midnight the way a smaller offset would be.
  const originalTZ = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Kiritimati';
    const now = new Date();
    const localToday = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const utcToday = now.toISOString().slice(0, 10);
    // Only meaningful while this run straddles the local/UTC date boundary;
    // skip rather than assert nothing in the sliver where they coincide.
    if (localToday === utcToday) return;

    const grant = { name: 'X', funder: 'Y', awardDate: '2020-06-15', intervalMonths: 1, awardAmount: 100, spentAmount: 0 };
    const noArg = reviewGrant(grant);
    const withLocal = reviewGrant(grant, localToday);
    const withUtc = reviewGrant(grant, utcToday);
    assert.equal(noArg.daysUntilReport, withLocal.daysUntilReport, 'default today must match the visitor\'s local date, not UTC\'s');
    assert.notEqual(noArg.daysUntilReport, withUtc.daysUntilReport, 'this timezone is chosen so local and UTC dates differ here');

    const sampleNoArg = sampleGrants();
    const sampleLocal = sampleGrants(localToday);
    assert.deepEqual(sampleNoArg, sampleLocal, 'sampleGrants() must anchor on the local date, not UTC\'s');
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test('markReportFiled rolls a saved award forward without re-keying it', () => {
  const grants = [
    { name: 'A', awardDate: '2023-01-01', intervalMonths: 3, awardAmount: 100, spentAmount: 10 },
    { name: 'B', awardDate: '2023-01-01', intervalMonths: 3 },
  ];
  const after = markReportFiled(grants, 0, '2026-08-24');
  assert.equal(after[0].lastReportFiled, '2026-08-24');
  assert.equal(after[0].awardAmount, 100, 'every other field on the award survives');
  assert.equal(after[1].lastReportFiled, undefined, 'only the named row is stamped');
  assert.equal(grants[0].lastReportFiled, undefined, 'the saved array is not mutated in place');
  // The whole point: the next due date moves one interval past the filing.
  assert.equal(reviewGrant(after[0], '2026-08-24').nextReport, '2026-11-24');
});

test('markReportFiled refuses an out-of-range index or an unparseable date instead of corrupting the queue', () => {
  const grants = [{ name: 'A', awardDate: '2026-01-01', intervalMonths: 6 }];
  assert.deepEqual(markReportFiled(grants, 5, '2026-08-24'), grants);
  assert.deepEqual(markReportFiled(grants, -1, '2026-08-24'), grants);
  assert.deepEqual(markReportFiled(grants, 1.5, '2026-08-24'), grants);
  assert.deepEqual(markReportFiled(grants, 0, 'not-a-date'), grants, 'a bad stamp would anchor every future due date');
  assert.deepEqual(markReportFiled(null, 0, '2026-08-24'), []);
});

test('the review queue exposes the Filed-today action and the Last-filed column it stamps', () => {
  // The calc-side roll-forward is only reachable for a returning user through
  // this button, so a page that drops it silently reverts the feature to
  // "delete the award and type it again".
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /markReportFiled/, 'the page imports and calls the roll-forward');
  assert.match(page, /data-filed=/, 'each queue row carries a Filed-today control');
  assert.match(page, /<th>Last filed<\/th>/, 'the queue shows the anchor it is counting from');
});

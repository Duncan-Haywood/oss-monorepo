import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRecord, summary, buildEvidencePack, packSummary, entriesToCsv } from './record.mjs';

const complete = {
  date: '2026-08-26',
  project: 'Oak Street renovation',
  crew: '2 carpenters, 1 electrician',
  conditions: 'Rain after 2pm; access clear',
  work: 'Set kitchen cabinets on the west wall.',
  changeType: 'none',
};

test('complete daily log with no change is ready to review', () => {
  const bundle = makeRecord(complete, '2026-08-26T12:00:00.000Z');
  assert.equal(bundle.findings.length, 0);
  assert.equal(bundle.record.schema, 'construction-evidence-log/v1');
  assert.equal(bundle.record.change, null);
  assert.equal(bundle.record.log.project, 'Oak Street renovation');
  assert.match(summary(bundle), /No change or delay recorded/);
});

test('blank crew and conditions become review notes', () => {
  const bundle = makeRecord({ ...complete, crew: '', conditions: '  ' });
  assert.equal(bundle.findings.length, 2);
  assert.match(bundle.findings[0], /People on site/);
  assert.match(bundle.findings[1], /Site conditions/);
});

test('scope change without requester or details is flagged', () => {
  const bundle = makeRecord({
    ...complete,
    changeType: 'change',
    requestedBy: '',
    changeDetails: '',
    impact: 'Adds 2 days',
  });
  assert.equal(bundle.record.change.type, 'change');
  assert.equal(bundle.record.change.impact, 'Adds 2 days');
  assert.equal(bundle.findings.length, 2);
  assert.match(summary(bundle), /Change\/delay: \(not described\)/);
});

test('buildEvidencePack sorts entries by date regardless of save order', () => {
  const day2 = { ...makeRecord({ ...complete, date: '2026-08-27' }), savedAt: '2026-08-27T09:00:00.000Z' };
  const day1 = { ...makeRecord({ ...complete, date: '2026-08-25' }), savedAt: '2026-08-25T09:00:00.000Z' };
  const pack = buildEvidencePack([day2, day1]);
  assert.equal(pack.schema, 'construction-evidence-log/pack/v1');
  assert.equal(pack.entryCount, 2);
  assert.deepEqual(pack.entries.map((r) => r.log.date), ['2026-08-25', '2026-08-27']);
  assert.deepEqual(pack.dateRange, { from: '2026-08-25', to: '2026-08-27' });
  assert.deepEqual(pack.projects, ['Oak Street renovation']);
});

test('buildEvidencePack collects review notes and change/delay count across days', () => {
  const thin = { ...makeRecord({ ...complete, date: '2026-08-25', crew: '' }), savedAt: '2026-08-25T09:00:00.000Z' };
  const withChange = {
    ...makeRecord({ ...complete, date: '2026-08-26', changeType: 'delay', requestedBy: 'Owner', impact: '1 day', changeDetails: 'Rain stopped exterior work.' }),
    savedAt: '2026-08-26T09:00:00.000Z',
  };
  const pack = buildEvidencePack([thin, withChange]);
  assert.equal(pack.changeOrDelayEntryCount, 1);
  assert.equal(pack.reviewNotes.length, 1);
  assert.match(pack.reviewNotes[0], /^2026-08-25: People on site/);
});

test('buildEvidencePack on an empty list has no date range and stays valid', () => {
  const pack = buildEvidencePack([]);
  assert.equal(pack.entryCount, 0);
  assert.equal(pack.dateRange, null);
  assert.deepEqual(pack.projects, []);
  assert.match(packSummary(pack), /no dated entries/);
});

test('packSummary reads as a short combined-pack review line', () => {
  const day1 = { ...makeRecord({ ...complete, date: '2026-08-25' }), savedAt: '2026-08-25T09:00:00.000Z' };
  const pack = buildEvidencePack([day1]);
  const text = packSummary(pack);
  assert.match(text, /^1 day logged \(2026-08-25 to 2026-08-25\)/);
  assert.match(text, /Oak Street renovation/);
  assert.match(text, /No missing-field observations across the pack\./);
});

test('entriesToCsv header carries every field the form collects', () => {
  const csv = entriesToCsv([]);
  assert.equal(
    csv,
    'date,project,crew,conditions,work,changeType,requestedBy,impact,changeDetails,findings,savedAt',
  );
});

test('entriesToCsv writes one row per saved entry, including change/delay fields', () => {
  const day1 = { ...makeRecord({ ...complete, date: '2026-08-25' }), savedAt: '2026-08-25T09:00:00.000Z' };
  const withChange = {
    ...makeRecord({
      ...complete, date: '2026-08-26', changeType: 'delay', requestedBy: 'Owner', impact: '1 day',
      changeDetails: 'Rain stopped exterior work.',
    }),
    savedAt: '2026-08-26T09:00:00.000Z',
  };
  const rows = entriesToCsv([day1, withChange]).split('\n');
  assert.equal(rows.length, 3);
  assert.match(rows[1], /^"2026-08-25","Oak Street renovation".*"none"/);
  assert.match(rows[2], /"delay","Owner","1 day","Rain stopped exterior work\."/);
});

test('entriesToCsv includes a blank entry\'s review notes, not just its data', () => {
  const thin = { ...makeRecord({ ...complete, date: '2026-08-25', crew: '' }), savedAt: '2026-08-25T09:00:00.000Z' };
  const rows = entriesToCsv([thin]).split('\n');
  assert.match(rows[1], /People on site was left blank/);
});

test('entriesToCsv quotes commas and doubles embedded quotes so the file stays one column per field', () => {
  const withComma = {
    ...makeRecord({ ...complete, date: '2026-08-25', work: 'Set cabinets, then trim the "west" wall.' }),
    savedAt: '2026-08-25T09:00:00.000Z',
  };
  const rows = entriesToCsv([withComma]).split('\n');
  assert.match(rows[1], /"Set cabinets, then trim the ""west"" wall\."/);
});

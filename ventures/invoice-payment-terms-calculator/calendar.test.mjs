import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar } from './calendar.mjs';

const base = { invoiceDate: '2026-08-24', dueDate: '2026-09-23', settlementDate: '2026-10-01', graceDays: 10, amount: 1200, label: 'Acme' };

test('emits due, grace-end and cash events in date order', () => {
  const ics = buildCalendar(base);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  const starts = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map(m => m[1]);
  assert.deepEqual(starts, ['20260923', '20261003', '20261001'].sort());
  assert.match(ics, /SUMMARY:Acme \$1200\.00 due/);
  assert.match(ics, /DTEND;VALUE=DATE:20260924/);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR\r\n'));
});

test('merges events that land on the same day', () => {
  const ics = buildCalendar({ ...base, settlementDate: base.dueDate, graceDays: 0 });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /due \/ .*cash expected/);
});

test('escapes text and folds long lines', () => {
  const ics = buildCalendar({ ...base, label: 'A, B; C' });
  assert.match(ics, /SUMMARY:A\\, B\; C/);
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75);
});

test('rejects bad dates', () => {
  assert.throws(() => buildCalendar({ ...base, dueDate: 'soon' }), /valid date/);
  assert.throws(() => buildCalendar({ ...base, dueDate: '2026-13-45' }), /valid date/);
});

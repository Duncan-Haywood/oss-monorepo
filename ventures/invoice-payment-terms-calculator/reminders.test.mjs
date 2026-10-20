import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderSchedule, reminderIcs } from './reminders.mjs';

test('Net 30 invoice gets five dated steps around the due date', () => {
  const s = reminderSchedule({ invoiceDate: '2026-08-24', termsDays: 30, amount: 1200, invoiceNumber: 'INV-7' });
  assert.equal(s.dueDate, '2026-09-23');
  assert.deepEqual(s.steps.map(x => x.date), ['2026-09-20', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-23']);
  assert.match(s.steps[0].body, /\$1,200\.00/);
  assert.match(s.steps[2].body, /7 days ago/);
  assert.equal(s.steps[2].subject, 'Invoice INV-7 — 7 days past due');
});

test('due on receipt drops the pre-due heads-up', () => {
  const s = reminderSchedule({ invoiceDate: '2026-08-24', termsDays: 0 });
  assert.equal(s.steps[0].id, 'due-today');
  assert.equal(s.steps.length, 4);
});

test('Net 2 keeps the heads-up only if it falls on or after the invoice date', () => {
  assert.equal(reminderSchedule({ invoiceDate: '2026-08-24', termsDays: 2 }).steps[0].id, 'due-today');
  assert.equal(reminderSchedule({ invoiceDate: '2026-08-24', termsDays: 3 }).steps[0].id, 'heads-up');
});

test('rejects impossible dates', () => {
  assert.throws(() => reminderSchedule({ invoiceDate: '2026-02-30' }), /valid invoice date/);
  assert.throws(() => reminderSchedule(null), /invoice details/);
});

test('missing amount omits the amount phrase', () => {
  const s = reminderSchedule({ invoiceDate: '2026-08-24' });
  assert.doesNotMatch(s.steps[0].body, /\$/);
});

test('ics is CRLF, folded to 75 octets, and escapes text', () => {
  const s = reminderSchedule({ invoiceDate: '2026-08-24', amount: 1200, invoiceNumber: 'A,B;C' });
  const ics = reminderIcs(s, { invoiceNumber: 'A,B;C', now: new Date('2026-08-24T10:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(ics, /DTSTART;VALUE=DATE:20260920/);
  assert.match(ics, /DTSTAMP:20260824T100000Z/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:Friendly heads-up — A\\,B\;C/);
});

test('invoice number cannot inject calendar lines', () => {
  const s = reminderSchedule({ invoiceDate: '2026-08-24', invoiceNumber: 'X\r\nEND:VCALENDAR' });
  const ics = reminderIcs(s, { invoiceNumber: 'X\r\nEND:VCALENDAR' });
  const lines = ics.replace(/\r\n /g, '').split('\r\n');
  assert.equal(lines.filter(l => l === 'END:VCALENDAR').length, 1);
});

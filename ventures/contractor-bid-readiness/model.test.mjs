import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBid, daysUntilDue, deadlineSentence, dueInstant, markdownReport, usableTimeZone } from './model.mjs';

const items = [{ name: 'Scope', owner: '', status: 'ready', note: '' }];
const at = (when) => new Date(when);

test('finds missing and blocked bid artifacts', () => {
  const result = assessBid([
    { name: 'W-9', owner: 'Pat', status: 'ready', note: '' },
    { name: 'Insurance certificate', owner: 'Sam', status: 'blocked', note: 'Renewal requested' },
    { name: 'Pricing form', owner: 'Pat', status: 'attention', note: 'Needs signature' },
  ], '2099-12-31', new Date('2099-12-20T12:00:00'));
  assert.equal(result.ready, false);
  assert.equal(result.missing.length, 2);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.urgency, 'normal');
});

test('reports urgent and past-due deadlines', () => {
  assert.equal(assessBid(items, '2099-01-02', at('2099-01-01T12:00:00')).urgency, 'urgent');
  assert.equal(assessBid(items, '2098-12-30', at('2099-01-01T12:00:00')).urgency, 'past-due');
});

test('the day count is calendar days, counted from the due date itself', () => {
  // The old form measured to the due date's last second and rounded up, so
  // every future deadline read one day further away than it was.
  assert.equal(daysUntilDue('2099-01-01', at('2099-01-01T09:00:00')), 0, 'due today is zero days out');
  assert.equal(daysUntilDue('2099-01-01', at('2099-01-01T23:30:00')), 0, 'still zero late on the day');
  assert.equal(daysUntilDue('2099-01-02', at('2099-01-01T09:00:00')), 1);
  assert.equal(daysUntilDue('2099-01-08', at('2099-01-01T09:00:00')), 7);
});

test('a deadline that passed last night is past due, not urgent', () => {
  // Regression: a gap between -1 and 0 days rounded up to 0, so `urgency`
  // could not reach past-due until the deadline was a full day gone. The page
  // told a contractor a bid was "urgent" when it could no longer be filed.
  const yesterday = assessBid(items, '2099-01-01', at('2099-01-02T09:00:00'));
  assert.equal(yesterday.daysRemaining, -1);
  assert.equal(yesterday.urgency, 'past-due');
  assert.equal(assessBid(items, '2099-01-01', at('2099-01-02T23:45:00')).urgency, 'past-due');
});

test('the day count survives a daylight-saving boundary', () => {
  // A 23- or 25-hour day shifts a millisecond division across the boundary.
  assert.equal(daysUntilDue('2099-11-02', at('2099-11-01T12:00:00')), 1);
  assert.equal(daysUntilDue('2099-03-09', at('2099-03-08T12:00:00')), 1);
});

test('a missing or unparseable due date reads as no deadline, not NaN', () => {
  assert.equal(daysUntilDue('', at('2099-01-01T09:00:00')), null);
  assert.equal(daysUntilDue(undefined, at('2099-01-01T09:00:00')), null);
  assert.equal(daysUntilDue('not-a-date', at('2099-01-01T09:00:00')), null);
  const result = assessBid(items, 'not-a-date', at('2099-01-01T09:00:00'));
  assert.equal(result.daysRemaining, null, 'NaN would print as "NaN day(s) remain"');
  assert.equal(result.urgency, 'normal');
});

test('creates a portable report without hidden input data', () => {
  const report = markdownReport(assessBid([{ name: 'Bid bond', owner: 'Lee', status: 'ready', note: '' }], ''), 'School roof', '2099-12-31');
  assert.match(report, /School roof/);
  assert.match(report, /Bid bond/);
  assert.match(report, /not a determination/);
});

test('deadline wording never reads as slack on the day it is due', () => {
  assert.equal(deadlineSentence(null), 'Add a deadline for urgency context.');
  assert.equal(deadlineSentence(0), 'The deadline is today.');
  assert.equal(deadlineSentence(1), '1 day remains.');
  assert.equal(deadlineSentence(5), '5 days remain.');
  assert.equal(deadlineSentence(-1), 'The deadline passed 1 day ago.');
  assert.equal(deadlineSentence(-3), 'The deadline passed 3 days ago.');
});

test('a calendar-invalid due date is no deadline, not a rolled-over one (quality audit 2026-11-19)', () => {
  assert.equal(daysUntilDue('2099-02-30', new Date(2099, 1, 27)), null);
  assert.equal(daysUntilDue('2099-04-31', new Date(2099, 1, 27)), null);
  assert.equal(daysUntilDue('2028-02-29', new Date(2028, 1, 27)), 2, 'a real leap day still counts');
});

test('an empty checklist is never ready', () => {
  assert.equal(assessBid([], '').ready, false);
});

test('the report carries the deadline even when every item is ready (quality audit 2026-11-19)', () => {
  const row = { name: 'Bid bond', owner: '', status: 'ready', note: '' };
  const result = assessBid([row], '2026-11-10', new Date(2026, 10, 19, 10));
  assert.equal(result.ready, true);
  const md = markdownReport(result, 'x', '2026-11-10');
  assert.match(md, /Deadline: The deadline passed 9 days ago\. \(past-due\)/);
});

// Quality audit 2026-11-19, defect 0: a date-only deadline kept a bid due at
// 2:00 PM "urgent" at 3:00 PM. Instants below are UTC so the tests mean the
// same on every runner, whatever its TZ.
test('a due time makes the bid past-due from that minute, on the issuing office clock', () => {
  const timing = { dueTime: '14:00', timeZone: 'America/Chicago' };
  // 2099-06-15 14:00 CDT is 19:00 UTC.
  const before = assessBid(items, '2099-06-15', new Date('2099-06-15T18:40:00Z'), timing);
  assert.equal(before.daysRemaining, 0);
  assert.equal(before.minutesRemaining, 20);
  assert.equal(before.urgency, 'urgent');
  assert.equal(deadlineSentence(before.daysRemaining, before), 'The deadline is today at 14:00 America/Chicago time, 20 min from now.');
  const after = assessBid(items, '2099-06-15', new Date('2099-06-15T20:00:00Z'), timing);
  assert.equal(after.daysRemaining, 0, 'still the due date on the office calendar');
  assert.equal(after.urgency, 'past-due');
  assert.equal(deadlineSentence(after.daysRemaining, after), 'The deadline passed today at 14:00 America/Chicago time, 1 h 0 min ago.');
});

test('the office zone, not the viewer, decides the calendar day', () => {
  // 03:00 UTC on 06-16 is still 06-15 evening in Chicago: the bid due 06-16 is 1 day out there.
  const r = assessBid(items, '2099-06-16', new Date('2099-06-16T03:00:00Z'), { timeZone: 'America/Chicago' });
  assert.equal(r.daysRemaining, 1);
  assert.equal(r.minutesRemaining, null, 'no due time, no minute count');
});

test('dueInstant converts the office wall clock across both daylight-saving rules', () => {
  assert.equal(new Date(dueInstant('2099-01-15', '14:00', 'America/New_York')).toISOString(), '2099-01-15T19:00:00.000Z');
  assert.equal(new Date(dueInstant('2099-07-15', '14:00', 'America/New_York')).toISOString(), '2099-07-15T18:00:00.000Z');
  assert.equal(new Date(dueInstant('2099-07-15', '10:30', 'America/Phoenix')).toISOString(), '2099-07-15T17:30:00.000Z');
  assert.equal(new Date(dueInstant('2099-07-15', '12:00', 'Europe/London')).toISOString(), '2099-07-15T11:00:00.000Z');
  assert.equal(dueInstant('2099-07-15', '25:00', 'America/New_York'), null);
  assert.equal(dueInstant('2099-02-30', '14:00', 'America/New_York'), null);
  assert.equal(dueInstant('2099-07-15', '', 'America/New_York'), null);
});

test('an unknown time zone falls back to the browser clock rather than throwing', () => {
  assert.equal(usableTimeZone('Mars/Olympus'), null);
  assert.equal(usableTimeZone(''), null);
  const r = assessBid(items, '2099-01-01', at('2099-01-01T15:00:00'), { dueTime: '14:00', timeZone: 'Mars/Olympus' });
  assert.equal(r.timeZone, null);
  assert.equal(r.urgency, 'past-due');
  assert.equal(r.minutesRemaining, -60);
});

test('the report names the due time and zone', () => {
  const r = assessBid(items, '2099-06-15', new Date('2099-06-15T18:40:00Z'), { dueTime: '14:00', timeZone: 'America/Chicago' });
  const report = markdownReport(r, 'Roof RFP', '2099-06-15');
  assert.match(report, /Due date: 2099-06-15 14:00 \(America\/Chicago\)/);
  assert.match(report, /Deadline: The deadline is today at 14:00 America\/Chicago time, 20 min from now\. \(urgent\)/);
});

test('a later day with a due time names the time', () => {
  assert.equal(deadlineSentence(3, { minutesRemaining: 4000, dueTime: '10:00', timeZone: 'America/Denver' }), '3 days remain (due at 10:00 America/Denver time).');
  assert.equal(deadlineSentence(-2, { minutesRemaining: -3000, dueTime: '10:00' }), 'The deadline passed 2 days ago.');
});

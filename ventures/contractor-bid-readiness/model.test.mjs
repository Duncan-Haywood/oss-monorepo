import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBid, daysUntilDue, deadlineSentence, markdownReport } from './model.mjs';

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

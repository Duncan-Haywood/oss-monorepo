import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBid, markdownReport } from './model.mjs';

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
  const items = [{ name: 'Scope', owner: '', status: 'ready', note: '' }];
  assert.equal(assessBid(items, '2099-01-02', new Date('2099-01-01T12:00:00')).urgency, 'urgent');
  assert.equal(assessBid(items, '2098-12-30', new Date('2099-01-01T12:00:00')).urgency, 'past-due');
});

test('creates a portable report without hidden input data', () => {
  const report = markdownReport(assessBid([{ name: 'Bid bond', owner: 'Lee', status: 'ready', note: '' }], ''), 'School roof', '2099-12-31');
  assert.match(report, /School roof/);
  assert.match(report, /Bid bond/);
  assert.match(report, /not a determination/);
});

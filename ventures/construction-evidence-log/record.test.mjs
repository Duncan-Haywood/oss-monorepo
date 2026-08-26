import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRecord, summary } from './record.mjs';

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

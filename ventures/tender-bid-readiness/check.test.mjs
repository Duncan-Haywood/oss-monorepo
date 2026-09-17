import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTender } from './check.mjs';

test('extracts common readiness signals and preserves evidence', () => {
  const result = checkTender('Responses due 30 September. Bid bond 5%. Insurance certificate required. Contractor license. Attendance at the mandatory pre-bid meeting is required. Portal submission. Questions due Friday; addenda follow.');
  assert.equal(result.score, 100);
  assert.match(result.findings.find((item) => item.key === 'bond').evidence, /^Bid bond 5%\./);
});

test('does not invent findings for empty or unrelated text', () => {
  assert.equal(checkTender('').score, 0);
  const result = checkTender('A sunny day and a blue truck.');
  assert.equal(result.findings.filter((item) => item.found).length, 0);
  assert.match(result.warnings[1], /7 readiness/);
});

test('keeps every finding actionable when a signal is absent', () => {
  const result = checkTender('Submit through the portal by Friday.');
  assert.equal(result.findings.length, 7);
  assert.equal(result.findings.filter((item) => !item.found).length, 6);
  assert.ok(result.findings.every((item) => item.action.length > 20));
});

test('flags a mandatory pre-bid meeting or site visit as its own signal', () => {
  const meeting = checkTender('Attendance at the mandatory pre-bid meeting is required for all bidders.');
  const meetingFinding = meeting.findings.find((item) => item.key === 'site-visit');
  assert.ok(meetingFinding.found);
  assert.match(meetingFinding.evidence, /pre-?bid meeting/i);

  const visit = checkTender('A site visit is mandatory and will not be rescheduled.');
  assert.ok(visit.findings.find((item) => item.key === 'site-visit').found);

  const silent = checkTender('Submit through the portal by Friday.');
  assert.equal(silent.findings.find((item) => item.key === 'site-visit').found, false);
});

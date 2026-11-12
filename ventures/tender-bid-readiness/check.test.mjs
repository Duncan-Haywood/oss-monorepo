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

// Quality audit 2026-11-12 (portfolio/quality/audits/2026-11-12-tender-bid-readiness.json).
test('recognises FAR bid guarantee and bid security wording', () => {
  for (const t of ['52.228-1 Bid Guarantee. The bid guarantee shall be not less than 20 percent of the bid price.',
                   'Each bid shall be accompanied by bid security of 5%, by certified check or surety bond.'])
    assert.ok(checkTender(t).findings.find((f) => f.key === 'bond').found, t);
});

test('shows the proposal due date, not an earlier question cut-off', () => {
  const r = checkTender('Questions are due by 2 January 2027.\nProposals are due 20 January 2027 at 3pm.');
  assert.match(r.findings.find((f) => f.key === 'deadline').evidence, /20 January 2027/);
  const only = checkTender('Questions are due by 2 January 2027.');
  assert.match(only.findings.find((f) => f.key === 'deadline').evidence, /2 January 2027/);
  assert.equal(checkTender('Bidders should complete their due diligence.').findings.find((f) => f.key === 'deadline').found, false);
});

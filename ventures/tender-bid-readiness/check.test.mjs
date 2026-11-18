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

// Added by quality audit round 53 (portfolio/quality/audits/2026-11-12-tender-bid-readiness.json).
const find = (text, key) => checkTender(text).findings.find((item) => item.key === key);

test('FAR 52.228-1 wording ("bid guarantee") counts as a bond requirement', () => {
  const far = '(a) Failure to furnish a bid guarantee in the proper form and amount, by the time set for opening of bids, may be cause for rejection of the bid.';
  assert.ok(find(far, 'bond').found);
  assert.ok(find(far, 'deadline').found);
  assert.ok(find('Performance and payment bonds are required within 10 days of award.', 'bond').found);
});

test('FAR deadline and amendment wording is caught', () => {
  assert.ok(find('Offers must be received no later than 2:00 p.m. local time on 14 January.', 'deadline').found);
  assert.ok(find('Bids will be publicly opened at 2:00 p.m.', 'deadline').found);
  assert.ok(find('Acknowledge receipt of each amendment on SF 30.', 'questions').found);
});

test('word boundaries stop look-alike words counting', () => {
  assert.equal(find('The coinsurance clause applies to the owner only.', 'insurance').found, false);
  assert.equal(find('Due to site constraints, deliveries are at the rear.', 'deadline').found, false);
  assert.equal(find('A certified check may accompany the bid.', 'certification').found, false);
  assert.equal(find('Certified payroll reports are submitted weekly.', 'certification').found, false);
  assert.ok(find('Bidders must hold a current contractor license.', 'certification').found);
});

test('a waived requirement is reported as stated not required, not found', () => {
  const bond = find('A bid bond is not required for this solicitation.', 'bond');
  assert.equal(bond.found, false);
  assert.equal(bond.waived, true);
  assert.match(bond.action, /not required/);
  const visit = find('No site visit will be held.', 'site-visit');
  assert.equal(visit.found, false);
  assert.equal(visit.waived, true);
  assert.ok(find('A bid bond of 5% is required.', 'bond').found);
});

test('the bid deadline is preferred over an earlier question deadline', () => {
  const r = find('Questions are due 3 March. Bids are due 20 March at 2 p.m.', 'deadline');
  assert.match(r.evidence, /^due 20 March/);
});

test('score is the rounded share of signals found, and the warning counts the misses', () => {
  const r = checkTender('Bids due Friday. Bid bond 5%. Insurance certificate required. Contractor license.');
  assert.equal(r.score, Math.round((4 / 7) * 100));
  assert.equal(r.score, 57);
  assert.match(r.warnings[1], /^3 readiness/);
});

// Red-team 2026-11-15 (prompts/runs/2026-11-15-session_01E5sJKmMRkNpZrXdD1mYhYj.json): two real defects where a
// required item read as waived, and guards for five mutants that escaped.
test('a "not required" in another clause does not waive a requirement', () => {
  const t = 'A 5% bid bond and proof of insurance are required, but a site visit is not required.';
  assert.equal(find(t, 'bond').found, true);
  assert.equal(find(t, 'bond').waived, undefined);
  assert.equal(find(t, 'insurance').found, true);
  assert.equal(find(t, 'site-visit').waived, true);
  assert.equal(find('A bid bond is required while insurance is not required.', 'bond').found, true);
  assert.equal(find('A bid bond is required and insurance is not required.', 'bond').found, true);
});

test('"no X will be required to attend" is an obligation, not a waiver', () => {
  const r = find('Firms with no local office will be required to attend the mandatory site visit.', 'site-visit');
  assert.equal(r.found, true);
  assert.equal(r.waived, undefined);
  assert.equal(find('Bidders must attend the site visit; those with no prior contract is required to bring references.', 'site-visit').found, true);
});

test('waivers that share one predicate still read as waived', () => {
  assert.equal(find('A bid bond and insurance are not required.', 'bond').waived, true);
  assert.equal(find('A bid bond and insurance are not required.', 'insurance').waived, true);
  assert.equal(find('Bidders are not required to attend the site visit.', 'site-visit').waived, true);
  assert.equal(find('No bid bond will be required.', 'bond').waived, true);
});

test('SF 30 alone counts as amendment wording', () => {
  assert.ok(find('Sign and return the SF 30 with the offer.', 'questions').found);
});

test('the "no ... will be held" waiver reaches three words and stops at four', () => {
  assert.equal(find('No pre-bid site visit will be held.', 'site-visit').waived, true);
  assert.equal(find('Contractors with no prior public works experience will be held responsible for attending the site visit.', 'site-visit').waived, undefined);
});

test('evidence runs from the keyword to 100 characters past it', () => {
  const tail = 'x'.repeat(150);
  const r = find(`A bid bond ${tail}`, 'bond');
  assert.equal(r.evidence, `bid bond ${tail}`.slice(0, 'bid bond'.length + 100));
});

test('with every signal found the warning says so', () => {
  const r = checkTender('Responses due 30 September. Bid bond 5%. Insurance certificate required. Contractor license. Attendance at the mandatory pre-bid meeting is required. Portal submission. Questions due Friday; addenda follow.');
  assert.match(r.warnings[1], /^All common readiness signals were found/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPUTE_REASONS,
  EVIDENCE_LABELS,
  REASONS,
  buildDraft,
  buildPacket,
  buildWorkingNotes,
  daysUntil,
  deadlineStatus,
  evidenceReview,
  labelFor,
  rulesFor,
  safeFileStem,
} from './packet.mjs';

const TODAY = new Date('2026-08-29T09:00:00');

test('every reason names required and recommended evidence that exists', () => {
  for (const [reason, rule] of Object.entries(DISPUTE_REASONS)) {
    assert.ok(rule.required.length > 0, `${reason} has no required evidence`);
    assert.ok(rule.focus.length > 20, `${reason} has no explanation of the question`);
    for (const key of [...rule.required, ...rule.recommended]) {
      assert.ok(key in EVIDENCE_LABELS, `${reason} references unknown evidence "${key}"`);
    }
    const overlap = rule.required.filter((key) => rule.recommended.includes(key));
    assert.deepEqual(overlap, [], `${reason} lists ${overlap} as both required and recommended`);
  }
});

test('every modeled reason asks for genuinely different records', () => {
  // The bug this replaces: "not as described" and "fraudulent" shared one
  // generic list, so a seller fighting a fraud claim was never told to pull
  // AVS/CVV and a seller fighting a description claim was never told to keep
  // the listing. Two reasons with identical required sets is that regression.
  const signatures = REASONS.map((reason) => rulesFor(reason).required.join('|'));
  assert.equal(new Set(signatures).size, REASONS.length, 'two reasons share a required set');
});

test('duplicate, subscription, and incorrect-amount disputes each get their own core set', () => {
  // These three were added after the original four shipped, to cover reason
  // codes that are common but were previously falling back to the generic
  // order+payment minimum with no reason-specific guidance at all.
  assert.deepEqual(rulesFor('Duplicate transaction').required, ['order', 'payment']);
  assert.ok(rulesFor('Subscription canceled').required.includes('terms'));
  assert.ok(rulesFor('Subscription canceled').required.includes('contact'));
  assert.ok(rulesFor('Incorrect amount').required.includes('terms'));
  assert.ok(!rulesFor('Duplicate transaction').required.includes('terms'));
});

test('fraud responses turn on verification, description responses on the listing', () => {
  assert.ok(rulesFor('Fraudulent transaction').required.includes('avs'));
  assert.ok(rulesFor('Fraudulent transaction').required.includes('address'));
  assert.ok(rulesFor('Merchandise not as described').required.includes('listing'));
  assert.ok(rulesFor('Merchandise not as described').required.includes('terms'));
  assert.ok(rulesFor('Merchandise not received').required.includes('tracking'));
  assert.ok(rulesFor('Credit not processed').required.includes('refund'));
});

test('evidenceReview separates missing-required from missing-recommended', () => {
  const review = evidenceReview('Merchandise not received', ['order', 'payment']);
  assert.deepEqual(review.missingRequired, ['fulfillment', 'tracking']);
  assert.deepEqual(review.missingRecommended, ['contact', 'terms', 'address']);
  assert.equal(review.complete, false);
});

test('holding every required record completes the checklist even with gaps below it', () => {
  const review = evidenceReview('Credit not processed', ['order', 'payment', 'refund', 'contact']);
  assert.equal(review.complete, true);
  assert.deepEqual(review.missingRequired, []);
  assert.deepEqual(review.missingRecommended, ['terms']);
});

test('unknown evidence keys from an older saved draft are ignored, not counted', () => {
  const review = evidenceReview('Credit not processed', ['order', 'payment', 'refund', 'contact', 'legacy-key']);
  assert.equal(review.complete, true);
  assert.ok(!review.held.includes('legacy-key'));
});

test('an unrecognised reason still yields a usable, honest rule', () => {
  const review = evidenceReview('Some new reason code', []);
  assert.deepEqual(review.required, ['order', 'payment']);
  assert.match(review.focus, new RegExp(`not one of the ${REASONS.length}`));
});

test('deadline arithmetic counts calendar days, not elapsed hours', () => {
  // Late in the day, "tomorrow" is under 24h away; it is still one day.
  assert.equal(daysUntil('2026-08-30', new Date('2026-08-29T23:30:00')), 1);
  assert.equal(daysUntil('2026-08-29', new Date('2026-08-29T00:05:00')), 0);
  assert.equal(daysUntil('2026-08-28', TODAY), -1);
  assert.equal(daysUntil('', TODAY), null);
  assert.equal(daysUntil('not-a-date', TODAY), null);
});

test('deadline arithmetic survives a daylight-saving boundary', () => {
  // A 23- or 25-hour day rounds to the wrong side under Math.ceil on ms.
  assert.equal(daysUntil('2026-11-02', new Date('2026-11-01T12:00:00')), 1);
  assert.equal(daysUntil('2026-03-09', new Date('2026-03-08T12:00:00')), 1);
});

test('deadline status names each band a seller acts on differently', () => {
  assert.equal(deadlineStatus('', TODAY).state, 'unknown');
  assert.equal(deadlineStatus('2026-08-25', TODAY).state, 'past');
  assert.equal(deadlineStatus('2026-08-29', TODAY).state, 'today');
  assert.equal(deadlineStatus('2026-08-30', TODAY).state, 'urgent');
  assert.equal(deadlineStatus('2026-09-30', TODAY).state, 'ahead');
  assert.match(deadlineStatus('2026-08-30', TODAY).note, /1 day away/);
  assert.match(deadlineStatus('2026-08-31', TODAY).note, /2 days away/);
});

test('the submitted draft never lists what the seller could not produce', () => {
  const packet = buildPacket(
    { order: '10482', reason: 'Fraudulent transaction', amount: '89.00', deadline: '2026-09-05', facts: 'Shipped 2026-08-01.', checked: ['payment'] },
    TODAY,
  );
  assert.ok(packet.missingEvidence.length > 0, 'test needs a packet with gaps');
  for (const gap of packet.missingEvidence) {
    assert.ok(!packet.draft.includes(gap), `draft leaked the missing record "${gap}" to the issuer`);
  }
  assert.ok(packet.draft.includes(labelFor('payment')));
});

test('the working notes keep the submitted half and the private half apart', () => {
  const packet = buildPacket(
    { order: '10482', reason: 'Merchandise not received', amount: '89.00', deadline: '2026-09-05', facts: 'Shipped.', checked: ['order'] },
    TODAY,
  );
  const notes = buildWorkingNotes(packet);
  const submit = notes.indexOf('this is the part you submit');
  const private_ = notes.indexOf('do not submit');
  assert.ok(submit > -1 && private_ > submit, 'notes must mark the draft, then the private section');
  assert.ok(notes.includes(packet.draft));
  assert.ok(notes.includes(labelFor('tracking')), 'notes should tell the seller what is still missing');
  assert.match(notes, /does not predict a bank's decision/);
});

test('blank fields become visible placeholders rather than silent holes', () => {
  const packet = buildPacket({ reason: 'Credit not processed' }, TODAY);
  assert.equal(packet.orderId, '[order ID]');
  assert.equal(packet.amount, '[amount]');
  assert.match(packet.draft, /\[add the factual timeline\]/);
  assert.match(packet.draft, /\[confirm in processor account\]/);
  assert.match(packet.draft, /\[list each attached record\]/);
});

test('buildDraft keeps the reviewed-and-submitted language the boundary depends on', () => {
  const draft = buildDraft({ order: '1', reason: 'Credit not processed', amount: '5', deadline: '2026-09-01', facts: 'x', checked: [] });
  assert.match(draft, /I have reviewed the attached records for accuracy/);
  assert.match(draft, /redact unnecessary personal data/);
});

test('order IDs are reduced to safe filename stems', () => {
  assert.equal(safeFileStem('10482'), '10482');
  assert.equal(safeFileStem('  ../../etc/passwd '), 'etc-passwd');
  assert.equal(safeFileStem('order #7/8'), 'order-7-8');
  assert.equal(safeFileStem('***'), 'draft');
  assert.equal(safeFileStem(''), 'draft');
  assert.equal(safeFileStem(null), 'draft');
  assert.equal(safeFileStem('a'.repeat(200)).length, 80);
});

test('the exported packet carries the fields a later review needs', () => {
  const packet = buildPacket(
    {
      order: '10482',
      reason: 'Merchandise not as described',
      date: '2026-08-01',
      amount: '89.00',
      deadline: '2026-09-05',
      facts: 'Buyer messaged 2026-08-10.',
      checked: ['order', 'listing'],
    },
    TODAY,
  );
  assert.equal(packet.orderDate, '2026-08-01');
  assert.equal(packet.deadlineState, 'ahead');
  assert.equal(packet.deadlineDays, 7);
  assert.deepEqual(packet.evidence, ['order', 'listing']);
  assert.deepEqual(packet.missingEvidence, [labelFor('contact'), labelFor('terms')]);
  assert.equal(packet.complete, false);
});

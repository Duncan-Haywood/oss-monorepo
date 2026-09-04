import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrueUp, reviewMessage, evaluateNoticeDeadline, noticeMessage } from './calc.mjs';
import { loadScenario, saveScenario, clearScenario } from './usage.mjs';
import { readFileSync } from 'node:fs';

test('quantifies unused seats and renewal exposure', () => {
  assert.deepEqual(calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 }), {
    purchased: 20, used: 14, unused: 6, extra: 0, overageRatePct: 0, seatMinimum: 0,
    droppableSeats: 6, lockedByMinimum: 0, utilizationPercent: 70,
    monthlyAvoidable: 108, remainingAvoidable: 432, annualAvoidable: 1296,
    monthlyOverage: 0, remainingOverage: 0, annualOverage: 0,
  });
});

test('a contracted seat minimum below actual usage has no effect', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4, seatMinimum: 10 });
  assert.equal(result.droppableSeats, 6);
  assert.equal(result.lockedByMinimum, 0);
  assert.equal(result.monthlyAvoidable, 108);
});

test('a contracted seat minimum above actual usage locks in part of the unused count', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4, seatMinimum: 17 });
  assert.equal(result.unused, 6);
  assert.equal(result.droppableSeats, 3);
  assert.equal(result.lockedByMinimum, 3);
  assert.equal(result.monthlyAvoidable, 54);
  assert.equal(result.remainingAvoidable, 216);
  assert.equal(result.annualAvoidable, 648);
  assert.match(reviewMessage(result), /6 seats are unused, but the contracted 17-seat minimum locks in 3 of them/);
  assert.match(reviewMessage(result), /Only 3 seats can actually be dropped: \$648\.00 over a full year/);
});

test('a seat minimum at or above the purchased count locks in everything unused', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4, seatMinimum: 25 });
  assert.equal(result.droppableSeats, 0);
  assert.equal(result.lockedByMinimum, 6);
  assert.equal(result.monthlyAvoidable, 0);
});

test('a seat minimum does not change the overage calculation', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 23, monthlyPrice: 18, monthsRemaining: 4, seatMinimum: 10 });
  assert.equal(result.extra, 3);
  assert.equal(result.lockedByMinimum, 0);
  assert.match(reviewMessage(result), /over the purchased count by 3 seats/);
});

test('rejects a negative seat minimum', () => {
  assert.throws(() => calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, seatMinimum: -1 }), /non-negative/);
});

test('handles a zero-seat plan without dividing by zero', () => {
  assert.equal(calculateTrueUp({ seatsPurchased: 0, seatsUsed: 0, monthlyPrice: 20 }).utilizationPercent, 0);
});

test('rejects negative inputs', () => {
  assert.throws(() => calculateTrueUp({ seatsPurchased: -1, seatsUsed: 0, monthlyPrice: 10 }), /non-negative/);
});

test('used above purchased is overage, not an error', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 23, monthlyPrice: 18, monthsRemaining: 4 });
  assert.equal(result.unused, 0);
  assert.equal(result.extra, 3);
  assert.equal(result.monthlyOverage, 54);
  assert.equal(result.remainingOverage, 216);
  assert.equal(result.annualOverage, 648);
  assert.match(reviewMessage(result), /over the purchased count by 3 seats/);
});

test('a contracted overage premium raises extra-seat cost above list price', () => {
  const result = calculateTrueUp({ seatsPurchased: 40, seatsUsed: 43, monthlyPrice: 18, monthsRemaining: 12, overageRatePct: 20 });
  assert.equal(result.extra, 3);
  assert.equal(result.overageRatePct, 20);
  assert.equal(result.monthlyOverage, 64.8);
  assert.equal(Number(result.annualOverage.toFixed(2)), 777.6);
  assert.match(reviewMessage(result), /20% overage premium/);
});

test('saves and restores the entered totals including overage premium and seat minimum', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const scenario = { purchased: '20', used: '14', price: '18', months: '4', overageRate: '0', seatMinimum: '10' };
  assert.equal(saveScenario(storage, scenario), true);
  assert.deepEqual(loadScenario(storage), { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0, seatMinimum: 10 });
  clearScenario(storage);
  assert.equal(loadScenario(storage), null);
});

test('older four-field saves still restore with a zero overage premium and seat minimum', () => {
  const storage = { getItem: () => '{"purchased":20,"used":14,"price":18,"months":4}' };
  assert.deepEqual(loadScenario(storage), { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0, seatMinimum: 0 });
});

test('older five-field saves (with overage but no seat minimum) still restore', () => {
  const storage = { getItem: () => '{"purchased":20,"used":14,"price":18,"months":4,"overageRate":5}' };
  assert.deepEqual(loadScenario(storage), { purchased: 20, used: 14, price: 18, months: 4, overageRate: 5, seatMinimum: 0 });
});

test('ignores malformed or incomplete saved scenarios', () => {
  assert.equal(loadScenario({ getItem: () => '{"purchased":null}' }), null);
  assert.equal(loadScenario({ getItem: () => '{"purchased":20,"used":14}' }), null);
  assert.equal(loadScenario({ getItem: () => '[20,14,18,4]' }), null);
  assert.equal(saveScenario({ setItem() { throw new Error('quota'); } }, { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0 }), false);
});

test('no renewal date means no notice deadline evaluation', () => {
  assert.equal(evaluateNoticeDeadline({}), null);
  assert.equal(evaluateNoticeDeadline({ renewalDate: '' }), null);
});

test('rejects an invalid renewal date string', () => {
  assert.equal(evaluateNoticeDeadline({ renewalDate: 'not-a-date' }), null);
});

test('rejects a negative notice period', () => {
  assert.throws(() => evaluateNoticeDeadline({ renewalDate: '2026-12-01', noticeDays: -5, today: new Date('2026-01-01') }), /non-negative/);
});

test('a future notice deadline is neither passed nor imminent', () => {
  const notice = evaluateNoticeDeadline({ renewalDate: '2027-01-01', noticeDays: 60, today: new Date('2026-09-04') });
  assert.equal(notice.deadlinePassed, false);
  assert.equal(notice.deadlineSoon, false);
  assert.equal(notice.daysUntilDeadline, 59); // deadline is Nov 2, 2026
  assert.equal(notice.daysUntilRenewal, 119);
});

test('a notice deadline within 14 days is flagged as soon', () => {
  const notice = evaluateNoticeDeadline({ renewalDate: '2026-09-20', noticeDays: 10, today: new Date('2026-09-04') });
  assert.equal(notice.deadlineSoon, true);
  assert.equal(notice.deadlinePassed, false);
  assert.equal(notice.daysUntilDeadline, 6); // deadline is Sep 10, 2026
});

test('a notice deadline that has already passed is flagged', () => {
  const notice = evaluateNoticeDeadline({ renewalDate: '2026-09-10', noticeDays: 60, today: new Date('2026-09-04') });
  assert.equal(notice.deadlinePassed, true);
  assert.equal(notice.daysUntilDeadline, -54); // deadline was Jul 12, 2026
});

test('noticeMessage is silent with no notice evaluation or nothing droppable', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 20, monthlyPrice: 18, monthsRemaining: 4 });
  assert.equal(noticeMessage(result, null), null);
  const notice = evaluateNoticeDeadline({ renewalDate: '2026-09-10', noticeDays: 60, today: new Date('2026-09-04') });
  assert.equal(noticeMessage(result, notice), null); // droppableSeats is 0 here
});

test('a passed deadline reframes the saving as locked in, not avoidable', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 });
  const notice = evaluateNoticeDeadline({ renewalDate: '2026-09-10', noticeDays: 60, today: new Date('2026-09-04') });
  const message = noticeMessage(result, notice);
  assert.match(message, /passed 54 days ago/);
  assert.match(message, /auto-renews at the full 20 seats regardless of usage/);
  assert.match(message, /6-seat saving above is not avoidable this cycle/);
});

test('an imminent deadline urges action before it closes', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 });
  const notice = evaluateNoticeDeadline({ renewalDate: '2026-09-20', noticeDays: 10, today: new Date('2026-09-04') });
  const message = noticeMessage(result, notice);
  assert.match(message, /Notice deadline in 6 days/);
  assert.match(message, /Submit the 6-seat reduction/);
});

test('a distant deadline is stated as a plain reminder', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 });
  const notice = evaluateNoticeDeadline({ renewalDate: '2027-01-01', noticeDays: 30, today: new Date('2026-09-04') });
  const message = noticeMessage(result, notice);
  assert.match(message, /Notice deadline: 2026-12-02/);
  assert.match(message, /only real if the reduction is submitted by then/);
});

test('the page wires save, reset, and the overage premium without uploading totals', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /Save scenario/);
  assert.match(html, /saveScenario/);
  assert.match(html, /loadScenario/);
  assert.match(html, /clearScenario/);
  assert.match(html, /id="overageRate"/);
  assert.match(html, /overageRatePct/);
  assert.match(html, /id="seatMinimum"/);
  assert.match(html, /seatMinimum:read\('seatMinimum'\)/);
  assert.match(html, /Saved scenarios store only the totals entered here/);
});

test('the page wires the notice-deadline check without persisting it in the saved scenario', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="renewalDate"/);
  assert.match(html, /id="noticeDays"/);
  assert.match(html, /evaluateNoticeDeadline/);
  assert.match(html, /noticeMessage/);
  assert.match(html, /id="notice" hidden/);
  // renewalDate/noticeDays must stay out of `ids` (the save/restore field
  // list) -- saveScenario Number()-converts every field in it, and a date
  // string is not a number.
  const idsMatch = html.match(/const ids = \[([^\]]*)\];/);
  assert.ok(idsMatch, 'ids array not found');
  assert.doesNotMatch(idsMatch[1], /renewalDate/);
  assert.doesNotMatch(idsMatch[1], /noticeDays/);
  // Reset must still clear the two new fields even though they are not part
  // of the persisted scenario.
  assert.match(html, /querySelector\('#renewalDate'\)\.value = ''/);
  assert.match(html, /querySelector\('#noticeDays'\)\.value = 0/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS } from './calc.mjs';
import { encodeInputs, decodeInputs } from './share.mjs';

const SCENARIO = { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0, seatMinimum: 0 };

test('round-trips every known field and drops junk', () => {
  const encoded = encodeInputs({ ...SCENARIO, renewalDate: '2026-12-01', noticeDays: 60 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of INPUT_FIELDS) {
    assert.equal(decoded[field], SCENARIO[field]);
  }
  // Regression for the 2026-09-06 defect `platform/pages/roundtrip.mjs` found:
  // noticeDays and renewalDate feed evaluateNoticeDeadline's verdict, and a
  // link that dropped them silently hid that verdict on the recipient's page
  // (a blank renewalDate makes evaluateNoticeDeadline return null outright).
  // They are deliberately outside INPUT_FIELDS -- see calc.mjs's comment --
  // because they are not part of calculateTrueUp itself and are excluded from
  // the *saved* scenario, but the share link still needs to carry both so a
  // reviewer's link shows the same deadline warning the sender saw.
  assert.equal(decoded.noticeDays, 60);
  assert.equal(decoded.renewalDate, '2026-12-01');
});

test('drops a malformed or missing renewal date rather than a garbage string', () => {
  assert.equal(decodeInputs('renewalDate=not-a-date').renewalDate, undefined);
  assert.equal(encodeInputs({ ...SCENARIO, renewalDate: '' }).includes('renewalDate='), false);
  assert.equal(encodeInputs({ ...SCENARIO }).includes('renewalDate='), false);
});

test('drops a negative notice period rather than carrying it into the form', () => {
  assert.equal(encodeInputs({ ...SCENARIO, noticeDays: -1 }).includes('noticeDays='), false);
});

test('decodes a hash-prefixed link the same as a query string', () => {
  const encoded = encodeInputs(SCENARIO);
  assert.deepEqual(decodeInputs(`#${encoded}`), decodeInputs(`?${encoded}`));
});

test('drops a negative value rather than carrying it into the form', () => {
  assert.equal(encodeInputs({ ...SCENARIO, price: -4 }).includes('price='), false);
});

test('ignores a crafted non-numeric query value instead of throwing', () => {
  assert.deepEqual(decodeInputs('price=abc&used=6'), { used: 6 });
});

test('an empty or missing value decodes to an empty scenario', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

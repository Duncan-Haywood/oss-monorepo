import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS } from './calc.mjs';
import { encodeInputs, decodeInputs } from './share.mjs';

const SCENARIO = { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0, seatMinimum: 0 };

test('round-trips every known field and drops junk', () => {
  const encoded = encodeInputs({ ...SCENARIO, renewalDate: '2026-12-01' });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of INPUT_FIELDS) {
    assert.equal(decoded[field], SCENARIO[field]);
  }
  assert.equal(decoded.renewalDate, undefined, 'renewalDate is session-only, like the saved scenario');
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

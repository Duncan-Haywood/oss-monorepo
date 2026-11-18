// Unit tests for the thousands-comma sweep's comparator (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, maskTyped, lineDiff } from './check_comma_input.mjs';

test('same page text is not a hit', () => {
  assert.equal(classify('Total $5,000', 'Total $5,000'), null);
});

test('a different answer with no error is silent', () => {
  assert.equal(classify('Monthly $208.33', 'Monthly $0.17'), 'silent');
});

test('an added error message is a reject, not silent', () => {
  assert.equal(classify('Monthly $208.33', 'Please enter a number'), 'rejects');
  assert.equal(classify('Monthly $208.33', 'Monthly $NaN'), 'rejects');
});

test('the typed value echoed back is masked', () => {
  assert.equal(maskTyped('You typed 2,500 and 2500.00'), 'You typed <v> and <v>');
  assert.equal(maskTyped('?amount=2%2C500'), '?amount=<v>');
  assert.equal(maskTyped('Total 12,500'), 'Total 12,500');
});

test('lineDiff names the first differing line', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nx\nc'), ['b', 'x']);
  assert.equal(lineDiff('a', 'a'), null);
});

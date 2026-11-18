// Unit tests for the Enter-reload sweep's helpers (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { selfAction, fillValue, TYPABLE } from './check_enter_reload.mjs';

test('forms that submit back to the page are probed', () => {
  for (const a of [null, '', '  ', '#', '#calc', '?', '?x=1']) assert.equal(selfAction(a), true, String(a));
});

test('forms that submit elsewhere are left alone', () => {
  for (const a of ['/search', 'https://example.com/form', 'mailto:a@example.com', 'results.html']) {
    assert.equal(selfAction(a), false, a);
  }
});

test('required fields get a value their type accepts', () => {
  assert.equal(fillValue('number', ''), '7');
  assert.equal(fillValue('number', '10'), '11');
  assert.equal(fillValue('number', 'x'), '7');
  assert.match(fillValue('email', ''), /^[^@]+@[^@]+\.[a-z]+$/);
  assert.match(fillValue('url', ''), /^https:\/\//);
});

test('only text-like inputs are typed into', () => {
  for (const t of ['text', 'number', '']) assert.ok(TYPABLE.includes(t));
  for (const t of ['checkbox', 'radio', 'range', 'date', 'file', 'submit']) assert.ok(!TYPABLE.includes(t));
});

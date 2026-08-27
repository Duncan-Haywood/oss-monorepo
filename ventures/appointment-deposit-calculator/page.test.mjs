import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('page carries the no-warranty clause and a local-only privacy line', () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /never uploaded/i);
  assert.match(page, /Best-effort hosting, no SLA/);
});

test('page wires the extracted calculator and usage modules', () => {
  assert.match(page, /id="deposit-form"/);
  assert.match(page, /src="app\.mjs"/);
  const app = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/calc\.mjs'/);
  assert.match(app, /from '\.\/usage\.mjs'/);
  assert.match(app, /deposit_calculated/);
  assert.match(app, /policy_copied/);
});

test('page does not recommend a deposit percent', () => {
  assert.match(page, /does not decide for you/);
  assert.doesNotMatch(page, /you should charge|must take a deposit|recommended deposit/i);
});

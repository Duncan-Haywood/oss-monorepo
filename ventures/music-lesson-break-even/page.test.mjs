import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('page wires the pricing form, local draft controls, and submit-only usage', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  for (const id of ['form', 'reset', 'lessonPrice', 'target', 'breakeven', 'errors', 'lever-section', 'lever-body', 'lever-summary']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /localStorage\.setItem\(storageKey/);
  assert.match(page, /form\.addEventListener\('submit'/);
  assert.match(page, /update\(true\)/);
  assert.match(page, /document\.querySelector\('#reset'\)\.addEventListener/);
  assert.match(page, /comparePolicyLevers/);
  assert.match(page, /policy_levers_viewed/);
});

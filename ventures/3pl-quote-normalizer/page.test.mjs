import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('page persists quote inputs locally', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /localStorage\.setItem\(saveKey/);
  assert.match(page, /localStorage\.getItem\(saveKey/);
  assert.match(page, /Saved locally in this browser/);
  assert.match(page, /id="report"/);
});

test('comparison page exposes two monthly quote inputs and disclaimer', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /name="first"/);
  assert.match(page, /name="second"/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
});

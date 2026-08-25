import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('page persists quote inputs locally', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /localStorage\.setItem\(saveKey/);
  assert.match(page, /localStorage\.getItem\(saveKey/);
  assert.match(page, /Saved locally in this browser/);
});

test('page exposes the line-by-line review export', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /Show line-by-line export/);
  assert.match(page, /summary\(r\)/);
  assert.match(page, /id="report"/);
});

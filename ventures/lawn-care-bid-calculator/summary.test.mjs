import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('copied bid draft carries its cost guardrail', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /Monthly cost floor \(walk-away\)/);
  assert.match(page, /Monthly profit at calculated price/);
});
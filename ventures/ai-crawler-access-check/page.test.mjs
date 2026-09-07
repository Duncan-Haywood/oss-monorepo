import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the how-to docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="how-to-block-or-allow-ai-crawlers\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./how-to-block-or-allow-ai-crawlers.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('both pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'how-to-block-or-allow-ai-crawlers.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

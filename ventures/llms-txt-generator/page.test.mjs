import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the "what is llms.txt" docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="what-is-llms-txt\.html"/);
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./what-is-llms-txt.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('every page carries the no-warranty clause', async () => {
  for (const file of ['index.html', 'what-is-llms-txt.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('index has title, meta description, and JSON-LD', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /<title>.+<\/title>/);
  assert.match(page, /<meta name="description" content="[^"]+"/);
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test('index carries the sponsor link', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index exposes a usage opt-out control', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /setUsageOptOut/);
  assert.match(page, /id="optout"/);
});

test('index links one hop to the ai-crawler-access-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/ai-crawler-access-check\/"/,
    'index must link ../ai-crawler-access-check/ so crawlers reach a related tool in one hop',
  );
});

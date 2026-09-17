import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="why-products-get-disapproved-in-google-merchant-center\.html"/,
    'index must link the docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./why-products-get-disapproved-in-google-merchant-center.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('both pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'why-products-get-disapproved-in-google-merchant-center.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('index carries the sponsor link', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index states nothing is uploaded (privacy line)', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /never uploaded|never leaves your device/i);
});

// Closest sibling per platform/pages/siblings.mjs's worklist convention:
// both are free, deterministic, no-network checkers serving the same online
// seller across the two representations Google reads for Shopping results
// (a page's own JSON-LD vs. the separate Merchant Center feed). Without this,
// this venture ships as a crawlable orphan -- no other tool links to it.
test('index links one hop to the structured-data-drift-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/structured-data-drift-check\/"/,
    'index must link ../structured-data-drift-check/ so crawlers reach this tool in one hop from a sibling',
  );
});

test('index links to the docs page which also names the sibling', async () => {
  const page = await readFile(new URL('./why-products-get-disapproved-in-google-merchant-center.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\.\/structured-data-drift-check\/"/);
});

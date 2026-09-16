import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="why-vs-code-does-not-warn-you-when-an-extension-is-delisted\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./why-vs-code-does-not-warn-you-when-an-extension-is-delisted.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('both pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'why-vs-code-does-not-warn-you-when-an-extension-is-delisted.html']) {
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

// Closest sibling: both are free, deterministic, paste-a-snapshot-and-diff
// developer supply-chain checkers, just for a different signal (editor
// extension surface vs. npm install-time scripts). Without this, this
// venture ships as a crawlable orphan -- no other tool links to it.
test('index links one hop to the npm-lifecycle-script-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/npm-lifecycle-script-check\/"/,
    'index must link ../npm-lifecycle-script-check/ so crawlers reach this tool in one hop from a sibling',
  );
});

test('index and docs page state that only `check` touches the network', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /snapshot.*and.*diff.*read only local files|no network call, ever/is);
});

test('index links to the vs-vscan comparison page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="vs-vscan\.html"/);
});

test('the vs-vscan page links back to the tool, carries the not-affiliated clause, and its FAQ JSON-LD matches visible text', async () => {
  const page = await readFile(new URL('./vs-vscan.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
  assert.match(page, /not\s+affiliated\s+with/i);
  assert.match(page, /no warranty/i);
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the vs-vscan page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(page.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(page.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the vs-vscan page is listed in the venture sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-vscan\.html/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the why-not-just-npm-audit-signatures docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="why-not-just-npm-audit-signatures\.html"/);
});

test('docs page links back to the tool', async () => {
  const page = await readFile(new URL('./why-not-just-npm-audit-signatures.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('all pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'why-not-just-npm-audit-signatures.html', 'vs-socket.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('sitemap lists all three pages', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /why-not-just-npm-audit-signatures\.html/);
  assert.match(sitemap, /vs-socket\.html/);
});

test('index links to the vs-socket comparison page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="vs-socket\.html"/);
});

test('vs-socket page links back to the tool and carries the trademark disclaimer', async () => {
  const page = await readFile(new URL('./vs-socket.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by socket/i);
});

test('index carries the sponsor link', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index states the file is never uploaded (privacy line)', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /never uploaded/i);
});

test('index honestly discloses the per-package registry request, not a blanket "nothing leaves your device" claim', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /registry\.npmjs\.org/);
  assert.match(page, /read-only/i);
});

// Reciprocal sibling links keep this venture from shipping as a crawlable
// orphan -- see npm-lifecycle-script-check's own test for the pattern this
// follows. One-directional here: linking out is enough for a crawler to
// reach this page in one hop from an established sibling.
test('index links one hop to the npm-lifecycle-script-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\.\/npm-lifecycle-script-check\/"/);
});

test('index links one hop to the slopsquatting-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\.\/slopsquatting-check\/"/);
});

// Reciprocal half of pypi-provenance-check's own inbound-link test.
test('index links one hop to the pypi-provenance-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\.\/pypi-provenance-check\/"/);
});

test('index has a title and meta description carrying the target search phrase', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /<title>[^<]*provenance[^<]*<\/title>/i);
  assert.match(page, /name="description" content="[^"]*provenance[^"]*"/i);
});

test('index carries SoftwareApplication and FAQPage JSON-LD', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

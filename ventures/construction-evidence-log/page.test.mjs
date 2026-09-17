import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const script = () => readFileSync(new URL('./app.js', import.meta.url), 'utf8');

test('the page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Construction Daily Log and Change Order Evidence Pack/);
  assert.match(html, /<script type="module" src="app\.js">/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
});

test('every element id app.js looks up by getElementById exists in the page', () => {
  const html = page('index.html');
  const js = script();
  const ids = [...js.matchAll(/\$\('([a-zA-Z-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 10, 'sanity check: expected many $() lookups in app.js');
  for (const id of new Set(ids)) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing id="${id}" that app.js looks up`);
  }
});

test('project log history section exists with the multi-day pack workflow wired up', () => {
  const html = page('index.html');
  assert.match(html, /<section id="history">/);
  assert.match(html, /id="history-list"/);
  assert.match(html, /id="download-pack"/);
  assert.match(html, /id="download-csv"/);
  assert.match(html, /id="clear-entries"/);
  const js = script();
  assert.match(js, /ENTRIES_KEY/);
  assert.match(js, /function loadEntries/);
  assert.match(js, /function saveEntries/);
  assert.match(js, /buildEvidencePack/);
  assert.match(js, /entriesToCsv/);
  assert.match(js, /addEventListener\('submit'/);
});

test('the privacy copy accurately describes that entries now persist locally', () => {
  const html = page('index.html');
  assert.match(html, /saved in this browser's local storage/);
  assert.match(html, /delete a single entry or clear everything/i);
  // Must not still claim the old (now false) "download it or it's gone" behaviour as the only path.
  assert.doesNotMatch(html, /Close the tab before downloading and today's entry is gone/);
});

test('the FAQPage JSON-LD stays in sync with the visible FAQ answers', () => {
  const html = page('index.html');
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  const faqLd = ldMatches.map((m) => m[1]).find((json) => json.includes('FAQPage'));
  assert.ok(faqLd, 'expected a FAQPage JSON-LD block');
  const parsed = JSON.parse(faqLd);
  assert.ok(parsed.mainEntity.length >= 5);
  for (const q of parsed.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), `visible FAQ is missing question: ${q.name}`);
  }
});

// Closest sibling: same "Getting paid & job margin" subcategory, but a
// margin-aware change-order price rather than a dated evidence pack.
// Without a crawlable link here, a crawler entering on the evidence log
// never reaches the pricing calculator in one hop.
test('index links one hop to the change-order-margin-calculator sibling', () => {
  assert.match(
    page('index.html'),
    /href="\.\.\/change-order-margin-calculator\/"/,
    'index must link ../change-order-margin-calculator/ so crawlers reach the pricing calculator in one hop',
  );
});

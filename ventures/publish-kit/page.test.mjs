import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const PAGES = ['index.html', 'acx-audiobook-requirements.html'];

test('every page has valid JSON-LD, a title, a description and the no-warranty clause', () => {
  for (const page of PAGES) {
    const html = read(page);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(blocks.length >= 1, page);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b), page);
    assert.match(html, /<title>[^<]{20,}<\/title>/, page);
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
    assert.ok(desc.length > 50 && desc.length <= 170, `${page} description length ${desc.length}`);
    assert.match(html, /No warranty\./, page);
  }
});

test('index imports only modules that exist and wires the usage opt-out and sponsor link', () => {
  const html = read('index.html');
  const imports = [...html.matchAll(/from '\.\/([\w-]+\.mjs)'/g)].map((m) => m[1]);
  assert.ok(imports.length >= 6);
  for (const f of imports) assert.ok(existsSync(new URL(`./${f}`, import.meta.url)), f);
  assert.match(html, /id="usageOptOut"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Privacy\./);
});

test('every id the index script reads exists in the page', () => {
  const html = read('index.html');
  const script = html.slice(html.indexOf('<script type="module">'));
  for (const [, id] of script.matchAll(/\$\('([\w-]+)'\)/g)) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('sitemap lists every page', () => {
  const sitemap = read('sitemap.xml');
  for (const page of PAGES) assert.match(sitemap, new RegExp(`<loc>\\./${page}</loc>`));
});

test('index links one hop to its siblings, the feed validator and KDP royalty calculator', () => {
  const html = read('index.html');
  assert.match(html, /href="\.\.\/podcast-feed-check\/"/);
  assert.match(html, /href="\.\.\/kdp-royalty-calculator\/"/);
});

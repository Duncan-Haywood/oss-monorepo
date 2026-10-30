import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./duplicate-packages-npm-guide.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /usage\.mjs/);
  assert.match(index, /dupes\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not engineering advice/i);
  assert.match(guide, /not engineering advice/i);
});

test('the page makes no network calls in its script', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0].replace(/\\"/g, '"');
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  assert.ok(headings.length > 0);
  for (const h of headings) assert.ok(ld.includes(h), `heading not in FAQPage JSON-LD: ${h}`);
});

test('JSON-LD blocks parse', () => {
  for (const m of index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
});

test('title and description carry the search phrases', () => {
  assert.match(index, /<title>[^<]*Duplicate[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*duplicate dependency finder[^"]*"/i);
});

test('index links the guide and the guide links back', () => {
  assert.match(index, /href="duplicate-packages-npm-guide\.html"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
});

test('every category the analyzer emits is described on the guide page', async () => {
  const { analyze } = await import('./dupes.mjs');
  const r = analyze(JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/a': { version: '1.0.0' }, 'node_modules/q/node_modules/a': { version: '2.0.0' } } }));
  assert.equal(r.duplicates[0].kind, 'cross-major');
  for (const c of ['same-major', 'cross-major']) assert.ok(guide.includes(c), `guide does not describe ${c}`);
});

test('every .html file is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html'))) {
    if (name !== 'index.html') assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')));
  }
});

test('index links one hop to sibling checks that exist', () => {
  for (const s of ['lockfile-license-check', 'npm-lifecycle-script-check']) {
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readdirSync(new URL(`../${s}/`, import.meta.url)).includes('index.html'));
  }
});

// Closest sibling: the same "what is duplicated in this JavaScript repo"
// question, at the code level instead of the dependency level.
test('index links one hop to the dupehound sibling', () => {
  assert.match(index, /href="\.\.\/dupehound\/"/, 'index must link ../dupehound/');
  assert.match(index, /copy-pasted blocks/);
});

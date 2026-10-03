import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./what-is-bus-factor.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /usage\.mjs/);
  assert.match(index, /classify\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test('the page says it is a heuristic and bars people-decisions on it alone', () => {
  assert.match(index, /heuristic from commit history/i);
  assert.match(index, /not a measure of who understands the code/i);
  assert.match(index, /must not be used on its own to make decisions about hiring/i);
  assert.match(guide, /heuristic/i);
});

test('the page makes no network calls: no fetch, XHR, beacon or WebSocket in its script', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0].replace(/\\"/g, '"');
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  assert.ok(headings.length > 0);
  for (const h of headings) assert.ok(ld.includes(h), `heading not in FAQPage JSON-LD: ${h}`);
});

test('title and description carry the search phrases', () => {
  assert.match(index, /<title>[^<]*Bus Factor[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*truck factor[^"]*"/i);
});

test('index links the guide and the guide links back', () => {
  assert.match(index, /href="what-is-bus-factor\.html"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /no SLA/i);
});

test('the copy-paste git command on the page is the one the parser expects', async () => {
  const { LOG_COMMAND } = await import('./classify.mjs');
  const shown = index.match(/<code id="logcmd">([^<]*)<\/code>/)[1];
  assert.equal(shown, LOG_COMMAND);
  const py = await readFile(new URL('./busfactor.py', import.meta.url), 'utf8');
  assert.ok(py.includes('LOG_FORMAT = "@@|%an|%ae|%at"'));
  assert.ok(shown.includes("--format='@@|%an|%ae|%at'"));
});

test('every status the analyzer can emit is described on the guide page', async () => {
  const { STATUSES } = await import('./classify.mjs');
  for (const s of STATUSES) assert.ok(guide.includes(s), `guide does not describe ${s}`);
});

test('every .html file is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html'))) {
    if (name !== 'index.html') assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')));
  }
});

test('index links one hop to a sibling check', () => {
  assert.match(index, /href="\.\.\/env-example-drift-check\/"/);
});

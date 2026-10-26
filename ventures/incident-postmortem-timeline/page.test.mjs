import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./how-to-write-a-blameless-postmortem.html', import.meta.url), 'utf8');

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
  assert.match(index, /not professional advice/i);
  assert.match(guide, /not professional advice/i);
});

test('the page makes no network calls in its script', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0].replace(/\\"/g, '"');
  const faq = index.slice(index.indexOf('<h2>Common questions</h2>'));
  const headings = [...faq.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  assert.ok(headings.length > 0);
  for (const h of headings) assert.ok(ld.includes(h), `heading not in FAQPage JSON-LD: ${h}`);
});

test('JSON-LD blocks parse', () => {
  for (const m of index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
});

test('title and description carry the search phrases', () => {
  assert.match(index, /<title>[^<]*Postmortem[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*incident timeline generator[^"]*"/i);
});

test('index links the guide and the guide links back', () => {
  assert.match(index, /href="how-to-write-a-blameless-postmortem\.html"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
});

test('every phase the analyzer emits is described on the guide page', async () => {
  const { PHASES } = await import('./classify.mjs');
  for (const c of PHASES) assert.ok(guide.includes(c), `guide does not describe ${c}`);
});

test('every .html file is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html'))) {
    if (name !== 'index.html') assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')));
  }
});

test('index links one hop to sibling checks that exist', () => {
  for (const s of ['slo-burn-rate-alerts', 'git-bus-factor-check']) {
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readdirSync(new URL(`../${s}/`, import.meta.url)).includes('index.html'));
  }
});

test('links to the on-call load analyzer', async () => {
  assert.match(await readFile(new URL('./index.html', import.meta.url), 'utf8'), /href="\.\.\/oncall-load-analyzer\/"/);
});

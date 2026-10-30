import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { parsePage, checkScriptSyntax } from '../../platform/webcheck/page-integrity.mjs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./280e-vs-ordinary-business-tax-comparison.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /id="receipts"/);
  assert.match(index, /id="calc"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /usage\.mjs/);
  assert.match(index, /tax\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(guide, /not professional advice/i);
});

test('neither the page script nor the engine makes network calls', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  const engine = readFileSync(new URL('./tax.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|child_process/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = JSON.parse([...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('FAQPage')));
  const names = ld.mainEntity.map((q) => q.name);
  const faq = index.slice(index.indexOf('<h2>Questions</h2>'));
  const headings = [...faq.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim().replace(/&amp;/g, '&'));
  assert.ok(headings.length > 0);
  for (const h of headings) assert.ok(names.includes(h), `heading not in FAQPage JSON-LD: ${h}`);
});

test('title and description carry the search phrases', () => {
  assert.match(index, /<title>[^<]*280E Tax Calculator[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*280E[^"]*gross profit[^"]*"/i);
});

test('index links the guide and the guide links back', () => {
  assert.match(index, /href="280e-vs-ordinary-business-tax-comparison\.html"/);
  assert.match(guide, /href="\.\/"/);
});

test('every .html file is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html'))) {
    if (name !== 'index.html') assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')));
  }
});

test('index links one hop to sibling tools that exist', () => {
  for (const s of ['quarterly-estimated-tax-calendar', 'estimated-tax-penalty-calculator']) {
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readdirSync(new URL(`../${s}/`, import.meta.url)).includes('index.html'));
  }
});

test('every inline script on the entry page parses, so the tool actually runs', () => {
  const { scripts, scriptTags } = parsePage(index);
  assert.deepEqual(checkScriptSyntax(scripts, scriptTags), []);
});

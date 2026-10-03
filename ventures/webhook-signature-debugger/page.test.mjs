import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { parsePage, checkScriptSyntax } from '../../platform/webcheck/page-integrity.mjs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./how-to-verify-webhook-signatures.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /usage\.mjs/);
  assert.match(index, /webhook\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never (leave|uploaded)/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not a security audit/i);
  assert.match(guide, /not security advice/i);
});

test('the page makes no network calls in its script', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  const engine = readFileSync(new URL('./webhook.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = JSON.parse([...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('FAQPage')));
  const names = ld.mainEntity.map((q) => q.name);
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim().replace(/&amp;/g, '&'));
  assert.ok(headings.length > 0);
  for (const h of headings) assert.ok(names.includes(h), `heading not in FAQPage JSON-LD: ${h}`);
});

test('title and description carry the search phrases', () => {
  assert.match(index, /<title>[^<]*Webhook Signature[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*webhook signature verification[^"]*"/i);
});

test('index links the guide and the guide links back', () => {
  assert.match(index, /href="how-to-verify-webhook-signatures\.html"/);
  assert.match(guide, /href="\.\/"/);
});

test('the guide describes every provider the engine supports', async () => {
  const { PROVIDERS } = await import('./webhook.mjs');
  const names = { stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', slack: 'Slack', standard: 'Standard Webhooks' };
  for (const p of PROVIDERS) assert.ok(guide.includes(names[p]), `guide does not describe ${p}`);
  assert.ok(index.includes('value="standard"'));
});

test('every .html file is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html'))) {
    if (name !== 'index.html') assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')));
  }
});

test('index links one hop to sibling checks that exist', () => {
  for (const s of ['jwt-verification-misuse-check', 'email-auth-check']) {
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readdirSync(new URL(`../${s}/`, import.meta.url)).includes('index.html'));
  }
});

test('every inline script on the entry page parses, so the tool actually runs', () => {
  const { scripts, scriptTags } = parsePage(index);
  assert.deepEqual(checkScriptSyntax(scripts, scriptTags), []);
});

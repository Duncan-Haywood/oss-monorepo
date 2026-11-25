import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse, format, checkCatalogs } from './icu.mjs';

const stripTags = (s) => { let p; do { p = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== p); return s; };

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, f), 'utf8');
const GUIDE = 'apostrophes-in-icu-messageformat.html';
const pages = ['index.html', GUIDE];
const ld = (src) => [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const unhtml = (s) => stripTags(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('JSON-LD parses: SoftwareApplication + FAQPage on the tool, HowTo on the guide', () => {
  const idx = ld(read('index.html'));
  assert.equal(idx.find((b) => b['@type'] === 'SoftwareApplication').offers.price, '0');
  assert.ok(idx.find((b) => b['@type'] === 'FAQPage').mainEntity.length >= 3);
  assert.ok(ld(read(GUIDE)).find((b) => b['@type'] === 'HowTo').step.length >= 3);
});

test('every FAQ answer in the schema is also visible on the page', () => {
  const html = read('index.html');
  for (const q of ld(html).find((b) => b['@type'] === 'FAQPage').mainEntity) {
    assert.ok(html.includes(`<h3>${q.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h3>`), q.name);
    const visible = unhtml(html.split(`<h3>${q.name}</h3>`)[1].split('</p>')[0]);
    assert.equal(visible.trim(), q.acceptedAnswer.text, q.name);
  }
});

test('no-warranty clause, sponsor link and licence on every page; privacy line and opt-out on the tool', () => {
  for (const p of pages) {
    const s = read(p);
    assert.match(s, /provided free and as-is, without warranty/, p);
    assert.match(s, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(s, /FSL-1.1-MIT licence/, p);
  }
  assert.match(read('index.html'), /never uploaded/);
  assert.match(read('index.html'), /id="usageOptOut"/);
});

test("every row of the guide's table is what the formatter prints", () => {
  const rows = [...read(GUIDE).matchAll(/<tr><td><code>([^<]+)<\/code>(?: with n = (\d+))?<\/td><td><code>([^<]+)<\/code>/g)];
  assert.equal(rows.length, 7);
  for (const [, msg, n, want] of rows) {
    const m = unhtml(msg);
    assert.equal(format(parse(m).ast, { item: 'image', n: Number(n) }, 'fr'), unhtml(want), m);
  }
});

test("the page's inline example files match examples/ and give the README's counts", () => {
  const html = read('index.html');
  const block = html.match(/const EXAMPLES = (\{[\s\S]*?\n {2}\});/)[1];
  const EXAMPLES = Function(`return ${block}`)();
  for (const [name, obj] of Object.entries(EXAMPLES)) assert.deepEqual(obj, JSON.parse(read(`examples/${name}`)), name);
  const r = checkCatalogs(Object.entries(EXAMPLES).map(([name, obj]) => ({ name, text: JSON.stringify(obj) })));
  assert.deepEqual([r.errors, r.warnings], [4, 5]);
});

test('the FAQ claim of 100,000 differential messages matches the eval record', () => {
  assert.match(read('index.html'), /100,000 generated messages/);
  assert.match(read('eval/differential-2026-11-19.md'), /100,000 messages/);
});

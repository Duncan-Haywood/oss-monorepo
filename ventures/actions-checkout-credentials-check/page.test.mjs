import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the entry page is a working tool', () => {
  for (const id of ['check', 'load-example', 'add-file', 'optout']) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /<textarea/);
  assert.match(index, /check\.mjs/);
});

test('disclaimers, stays local, usage opt-out, sponsor link', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not a security audit/);
});

test('no unqualified safety claim', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of prose.matchAll(/\b(?:is|are)\s+safe\b/gi)) {
    const before = prose.slice(Math.max(0, m.index - 60), m.index);
    const after = prose.slice(m.index + m[0].length, m.index + m[0].length + 12);
    assert.ok(/\b(?:never|not|no)\b/i.test(before) || after.trimStart().startsWith('?'));
  }
});

test('FAQPage JSON-LD matches the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0];
  const heads = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  assert.ok(heads.length >= 4);
  for (const h of heads) assert.ok(ld.includes(h), h);
});

test('search phrases in title and description; sibling links', () => {
  assert.match(index, /<title>[^<]*persist-credentials[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*persist-credentials[^"]*"/);
  for (const s of ['actions-secret-leak-check', 'pinned-actions-check', 'actions-permissions-check', 'actions-timeout-check'])
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');
const blocks = (s) => [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('JSON-LD is valid, free-priced, and every FAQ question is visible text', async () => {
  const html = await read('index.html');
  const parsed = blocks(html);
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.equal(app.offers.price, '0');
  assert.ok(faq.mainEntity.length >= 3);
  for (const q of faq.mainEntity) assert.ok(html.includes(q.name), q.name);
});

test('page carries the no-warranty, trademark and no-upload clauses and a sponsor link', async () => {
  const html = await read('index.html');
  for (const s of ['No warranty', 'Not affiliated with Apple or Google', 'Best-effort hosting', 'never transmitted or stored', 'github.com/sponsors/Duncan-Haywood', 'id="usageOptOut"']) {
    assert.ok(html.includes(s), s);
  }
});

test('page imports only local modules and opens no network connection', async () => {
  const html = await read('index.html');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(html));
  assert.ok(!/src="https?:/.test(html));
});

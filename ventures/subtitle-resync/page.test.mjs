import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stripScripts = (s, sub = "") => { let p; do { p = s; s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, sub); } while (s !== p); return s; };

const PAGES = ['index.html', 'fix-subtitles-out-of-sync.html'];
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
// Text a visitor reads: JSON-LD and tags removed, entities decoded.
function visibleText(html) {
  return stripScripts(html, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→').replace(/&larr;/g, '←')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

for (const page of PAGES) {
  test(`${page}: every FAQ answer in JSON-LD is also visible prose`, async () => {
    const html = await read(page);
    const faq = jsonLd(html).find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq, 'FAQPage block');
    const text = visibleText(html);
    for (const q of faq.mainEntity) {
      assert.ok(text.includes(q.name), `question not visible: ${q.name}`);
      assert.ok(text.includes(q.acceptedAnswer.text), `answer not visible: ${q.name}`);
    }
  });
  test(`${page}: carries the no-warranty clause and sponsor link`, async () => {
    const html = await read(page);
    assert.match(html, /<strong>No warranty\.<\/strong>/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  });
}

test('index: free SoftwareApplication, opt-out control, no network calls in the page script', async () => {
  const html = await read('index.html');
  const app = jsonLd(html).find((b) => b['@type'] === 'SoftwareApplication');
  assert.equal(app.offers.price, '0');
  assert.match(html, /id="usageOptOut"/);
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test('guide: worked-example arithmetic matches the engine', async () => {
  const { resyncText } = await import('./engine.mjs');
  const r = resyncText('1\n00:45:00,000 --> 00:45:01,000\nx\n', { fps: ['25', '23.976'], offsetMs: 2000 });
  assert.match(r.output, /00:46:57,313/);
  const html = await read('fix-subtitles-out-of-sync.html');
  assert.match(html, /00:46:57,313/);
});

test('index links its sibling Silence Cutter (crawlable one-hop link)', async () => {
  assert.match(await read('index.html'), /href="\.\.\/silence-cutter\/"/);
});

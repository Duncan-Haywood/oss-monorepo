import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Remove every <script> element, case-insensitively and until nothing is left to strip.
const stripScripts = (s, sub = '') => { let p; do { p = s; s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, sub); } while (s !== p); return s; };
// Remove every tag, repeating until no tag-shaped text is left.
const stripTags = (s, sub = '') => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };

const PAGES = ['index.html', 'remove-silence-from-video.html'];
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
// Text a visitor reads: JSON-LD and tags removed, entities decoded.
function visibleText(html) {
  return stripTags(stripScripts(html, ' '), ' ')
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

test('guide: worked-example EDL matches the engine on the same cut list', async () => {
  const { toEDL } = await import('./engine.mjs');
  // Kept spans from the 60 s Silero test clip (eval/worked-example-2026-11-23.md).
  const edl = toEDL([{ start: 0, end: 2.3 }, { start: 2.56, end: 7.02 }], { fps: '30', clipName: 't.mp4' });
  const html = await read('remove-silence-from-video.html');
  for (const line of edl.split('\n').filter((l) => /^00[12] /.test(l))) assert.ok(html.includes(line), line);
});

test('benchmark figures on the page match the committed held-out run', async () => {
  const md = await readFile(new URL('./eval/benchmark-seed2-2026-11-23.md', import.meta.url), 'utf8');
  const row = md.split('\n').find((l) => l.startsWith('| auto (this tool) | 9'));
  assert.match(row, /\| 95\.8% \| 91\.6% \| \d+ ms \| 25 of 2496 \|/);
  const html = await read('index.html');
  assert.match(html, /95\.8%/); assert.match(html, /25 words/); assert.match(html, /2,496/);
});


test('index links its siblings Subtitle Resync and Caption Quality Checker', async () => {
  const html = await read('index.html');
  assert.match(html, /href="\.\.\/subtitle-resync\/"/);
  assert.match(html, /href="\.\.\/caption-quality-check\/"/);
});

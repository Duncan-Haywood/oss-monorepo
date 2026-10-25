import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';
import { analyse, FIELDS, DEFAULTS } from './calc.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('index.html');

test('page is findable and usable without a build step', () => {
  assert.match(html, /<title>Prop Firm Challenge Calculator/);
  assert.match(html, /<meta name="description" content="[^"]*funded-trader/);
  assert.match(html, /analyse\(values\(\)\)/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /not a forecast/);
  assert.match(html, /Not affiliated with any trading firm/);
  assert.match(html, /property="og:title"/);
});

test('every input has a programmatically associated label and every calculator field has an input', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== 'usageOptOut');
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}"`), `no <label for="${id}">`);
  for (const f of FIELDS) assert.match(html, new RegExp(`id="${f}"`), `no input for ${f}`);
});

test('question-shaped FAQ becomes FAQPage schema and matches the visible text', () => {
  const entries = faqEntries(html);
  assert.ok(entries.length >= 5);
  for (const { question, answer } of entries) { assert.ok(question.endsWith('?')); assert.ok(answer.length >= 40); }
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((q) => q.name), entries.map((e) => e.question));
  assert.ok(blocks.some((b) => b['@type'] === 'SoftwareApplication'));
});

test('no network call, and the share link claim matches the code', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /share link stores your inputs in the link itself/);
  assert.match(html, /errors\.textContent = e\.message; errors\.hidden = false; out\.hidden = true/);
});

test('the default inputs on the page equal the calculator defaults', () => {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const m = new RegExp(`id="${k}" type="number"[^>]*value="([^"]*)"`).exec(html);
    if (m) assert.equal(Number(m[1]), v, k);
  }
  const r = analyse(DEFAULTS, { sweep: false, breakEven: false });
  assert.ok(r.passRatePct >= 0 && r.passRatePct <= 100);
});

test('robots and sitemap let crawlers find the page and the guide; links resolve', () => {
  assert.match(page('robots.txt'), /Allow: \//);
  assert.match(page('sitemap.xml'), /prop-firm-challenge-calculator\/<\/loc>/);
  assert.match(page('sitemap.xml'), /vs-a-trading-spreadsheet\.html/);
  const hrefs = [...html.matchAll(/href="((?!https?:|data:|#)[^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 1);
  for (const href of hrefs) assert.ok(existsSync(new URL(href, import.meta.url)), `broken internal link: ${href}`);
});

test('makes no promise of profit or income', () => {
  assert.doesNotMatch(html, /guarantee[ds]?\b(?! of)|get funded fast|easy money|risk[- ]free|passive income/i);
});

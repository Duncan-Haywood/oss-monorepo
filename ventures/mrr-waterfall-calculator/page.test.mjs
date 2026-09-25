import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /MRR Waterfall Calculator/);
  assert.match(html, /calculateWaterfall\(input\)/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /vs-tracking-mrr-in-a-spreadsheet\.html/);
});

test('the page carries Open Graph tags so a shared link renders', () => {
  const html = page('index.html');
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
});

test('the entry page ships a real, question-shaped FAQ that build.mjs will turn into FAQPage schema', () => {
  const html = page('index.html');
  assert.match(html, /<h2>Common questions<\/h2>/);
  const entries = faqEntries(html);
  assert.ok(entries.length >= 4, `expected at least 4 derived FAQ entries, got ${entries.length}`);
  for (const { question, answer } of entries) {
    assert.ok(question.endsWith('?'));
    assert.ok(answer.length >= 40, `answer to "${question}" is too short to be a real explanation`);
  }
});

test('gross revenue retention is explained as capped and net as uncapped, matching calc.mjs', () => {
  const html = page('index.html');
  assert.match(html, /capped at 100%/);
  assert.match(html, /no cap/);
});

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /mrr-waterfall-calculator\/<\/loc>/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  const html = page('index.html');
  assert.match(html, /errorsEl\.textContent=e\.message;errorsEl\.hidden=false;headline\.hidden=true/);
});

test('the default worked example on the page matches calc.mjs exactly', async () => {
  const { calculateWaterfall } = await import('./calc.mjs');
  const r = calculateWaterfall({
    startingMrr: 10000, newMrr: 1200, expansionMrr: 1500, reactivationMrr: 100, contractionMrr: 400, churnedMrr: 600,
  });
  assert.equal(r.netRevenueRetention, 106);
  assert.equal(r.grossRevenueRetention, 90);
  const html = page('index.html');
  assert.match(html, /id="startingMrr" type="number" min="0" step="1" value="10000"/);
  assert.match(html, /id="churnedMrr" type="number" min="0" step="1" value="600"/);
});

test('every internal link on the index page resolves to a file in this venture', () => {
  const html = page('index.html');
  const internalHrefs = [...html.matchAll(/href="(\.\/|(?!https?:)[a-z0-9#-]+\.html)([^"]*)"/gi)]
    .map((m) => (m[1] === './' ? './' : m[1] + m[2]))
    .filter((href) => href !== './' && !href.startsWith('../'));
  for (const href of internalHrefs) {
    const target = new URL(href, import.meta.url);
    assert.ok(existsSync(target), `broken internal link: ${href}`);
  }
});

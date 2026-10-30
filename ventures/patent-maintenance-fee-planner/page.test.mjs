import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';
import { planPortfolio } from './calc.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('index.html');

test('page is findable and usable without a build step', () => {
  assert.match(html, /<title>Patent Maintenance Fee Planner/);
  assert.match(html, /<meta name="description" content="[^"]*maintenance fee/);
  assert.match(html, /planPortfolio\(values\(\)\)/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
});

test('every input has a programmatically associated label', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== 'usageOptOut');
  assert.ok(ids.length >= 5, `found ${ids.length} inputs`);
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}"`), `no <label for="${id}">`);
  assert.match(html, /<label><input id="usageOptOut" type="checkbox"> Do not keep/);
});

test('the entry page ships a question-shaped FAQ that build.mjs turns into FAQPage schema', () => {
  assert.match(html, /<h2>Common questions<\/h2>/);
  const entries = faqEntries(html);
  assert.ok(entries.length >= 5, `expected at least 5 FAQ entries, got ${entries.length}`);
  for (const { question, answer } of entries) {
    assert.ok(question.endsWith('?'));
    assert.ok(answer.length >= 40, `answer to "${question}" is too short`);
  }
});

test('the FAQPage JSON-LD questions match the visible FAQ', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq);
  const visible = faqEntries(html).map((e) => e.question);
  assert.deepEqual(faq.mainEntity.map((q) => q.name), visible);
  assert.ok(blocks.some((b) => b['@type'] === 'SoftwareApplication'));
});

test('shareable URL state, CSV export and the error path are wired', () => {
  assert.match(html, /decodeState\(location\.hash/);
  assert.match(html, /encodeState\(values\(\)\)/);
  assert.match(html, /toCsv\(last\)/);
  assert.match(html, /toIcs\(last\)/);
  assert.match(html, /errors\.textContent = e\.message; errors\.hidden = false; out\.hidden = true/);
});

test('the privacy line does not claim more than the code does', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /share link stores your patent list and fee table in the link itself/);
});

test('the default inputs on the page compute a real plan', () => {
  const area = (id) => new RegExp(`<textarea id="${id}"[^>]*>([^<]*)</textarea>`).exec(html)[1];
  const r = planPortfolio({ asOf: '2026-10-12', patents: area('patents'), fees: area('fees'), horizonYears: 5, warnDays: 90 });
  assert.equal(r.counts.patents, 4);
  assert.ok(r.rows.every((x) => x.complete || x.next.due >= '2026-01-01'));
  // The sample's dropped 2013 patent is fully maintained already, so the sample must still show a non-zero budget.
  assert.ok(r.budgetTotal > 0);
});

test('robots and sitemap let crawlers find the page', () => {
  assert.match(page('robots.txt'), /Allow: \//);
  assert.match(page('robots.txt'), /sitemap\.xml/);
  assert.match(page('sitemap.xml'), /patent-maintenance-fee-planner\/<\/loc>/);
});

test('no competitor is named on the entry page', () => {
  assert.doesNotMatch(html, /\b(Anaqua|CPA Global|Clarivate|PatentRenewal|Alt Legal)\b/i);
});

test('every internal link on the index page resolves', () => {
  const hrefs = [...html.matchAll(/href="((?!https?:|data:|#)[^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 3);
  for (const href of hrefs) {
    assert.ok(existsSync(new URL(href, import.meta.url)), `broken internal link: ${href}`);
  }
});

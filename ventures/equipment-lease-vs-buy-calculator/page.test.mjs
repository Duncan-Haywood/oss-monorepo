import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';
import { compareLeaseVsBuy } from './calc.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('index.html');

test('page is findable and usable without a build step', () => {
  assert.match(html, /<title>Equipment Lease vs Buy Calculator/);
  assert.match(html, /<meta name="description" content="[^"]*lease/);
  assert.match(html, /compareLeaseVsBuy\(values\(\)\)/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, tax, legal or accounting advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
});

test('every input has a programmatically associated label', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== 'usageOptOut');
  assert.ok(ids.length >= 12, `found ${ids.length} inputs`);
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
  assert.match(html, /errors\.textContent = e\.message; errors\.hidden = false; out\.hidden = true/);
});

test('the privacy line does not claim more than the code does', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /share link stores your inputs in the link itself/);
});

test('the default inputs on the page compute a real comparison', () => {
  const value = (id) => new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html)[1];
  const inputs = { depreciation: /<option value="([^"]+)" selected>/.exec(html)[1] };
  for (const id of ['price', 'salesTaxPct', 'downPaymentPct', 'loanAprPct', 'loanTermMonths', 'leaseMonthlyPayment', 'leaseTermMonths', 'leaseDueAtSigning', 'leaseEndBuyout', 'resaleValue', 'taxRatePct', 'discountRatePct']) inputs[id] = value(id);
  const r = compareLeaseVsBuy(inputs);
  assert.equal(r.winner, 'buy');
  assert.ok(r.advantage > 0);
  assert.equal(r.monthlyLoanPayment, 1547.49);
  assert.equal(r.methods.length, 5);
});

test('robots and sitemap let crawlers find the page', () => {
  assert.match(page('robots.txt'), /Allow: \//);
  assert.match(page('robots.txt'), /sitemap\.xml/);
  assert.match(page('sitemap.xml'), /equipment-lease-vs-buy-calculator\/<\/loc>/);
});

test('no competitor is named on the entry page', () => {
  assert.doesNotMatch(html, /\b(Balboa|Crest|Ascentium|Dell Financial|CIT|Marlin)\b/i);
});

test('every internal link on the index page resolves', () => {
  const hrefs = [...html.matchAll(/href="((?!https?:|data:|#)[^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 3);
  for (const href of hrefs) {
    assert.ok(existsSync(new URL(href, import.meta.url)), `broken internal link: ${href}`);
  }
});

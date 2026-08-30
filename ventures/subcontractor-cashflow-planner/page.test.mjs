import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Subcontractor Cash Flow Planner/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /planCashflow/);
  assert.match(html, /Export CSV/);
  assert.match(html, /Count anonymous local feature events/);
});

test('index links to the payment-terms SEO/AI-discovery page', () => {
  assert.match(html, /how-much-cash-do-i-need-for-net-30-payment-terms\.html/);
});

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the payment-terms page answers the search question with a worked table', () => {
  const docs = docsPage('how-much-cash-do-i-need-for-net-30-payment-terms.html');
  assert.match(docs, /How much cash do you need for net 30/i);
  assert.match(docs, /FAQPage/);
  assert.match(docs, /"@type":"Question"/);
  assert.match(docs, /href="\.\/"/);
  assert.match(docs, /No warranty/);
  assert.match(docs, /Best-effort hosting, no SLA/);
  // Table figures match calc.mjs's planCashflow() at the calculator's own
  // defaults, so a reader who runs the numbers themselves gets the same
  // answer this page states.
  assert.match(docs, /\$6,900/);
  assert.match(docs, /\$1,900/);
  assert.match(docs, /\$12,900/);
  assert.match(docs, /\$7,900/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /subcontractor-cashflow-planner\/<\/loc>/);
  assert.match(sitemap, /how-much-cash-do-i-need-for-net-30-payment-terms\.html/);
});

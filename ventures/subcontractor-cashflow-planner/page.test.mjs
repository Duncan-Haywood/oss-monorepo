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

test('the three cash levers are on the form with bounds a browser can enforce', () => {
  // Bounds matter beyond validation: platform/pages/invalid.mjs highlights the
  // offending field by asking each control checkValidity(), so an unbounded
  // input reports valid whatever is typed and the "fix the highlighted input"
  // instruction points at nothing.
  assert.match(html, /name="deposit"[^>]*min="0"[^>]*max="100"/);
  assert.match(html, /name="supplierTerms"[^>]*min="0"/);
  assert.match(html, /name="apr"[^>]*min="0"[^>]*max="200"/);
});

test('the export labels its rows from the calculator, not a second copy of the field list', () => {
  // The page used to carry its own hand-maintained array of column names. Two
  // lists of the same fields is how an added column silently exports under the
  // previous column's label.
  assert.match(html, /CSV_FIELDS/);
  assert.doesNotMatch(html, /\['invoice','materials','weeklyBurn'/);
});

test('every visible FAQ question also appears in the FAQPage block', () => {
  // This page hand-authors its own FAQPage, so build.mjs does not derive one
  // (it only injects where a venture wrote none). Nothing else keeps the two
  // in step, and drift means structured data promising an answer the page does
  // not show.
  const decode = (s) => s
    .replace(/&mdash;/g, '—').replace(/&minus;/g, '−').replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”').replace(/&amp;/g, '&');
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => decode(m[1]));
  assert.ok(visible.length >= 9, `expected the FAQ to have grown, saw ${visible.length}`);
  const schema = html.slice(html.indexOf('"@type":"FAQPage"'));
  for (const question of visible) {
    assert.ok(
      schema.includes(JSON.stringify(question).slice(1, -1)),
      `visible question is missing from the FAQPage block: ${question}`,
    );
  }
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

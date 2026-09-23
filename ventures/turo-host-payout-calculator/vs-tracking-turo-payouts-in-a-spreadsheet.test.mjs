import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { computeTripPayout, comparePlans, compareBookingWindows, estimateMonthly } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-tracking-turo-payouts-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The exact trip the page states in prose, so the test and the page cannot
// drift apart without one of them being edited.
const TRIP = {
  tripPrice: 350,
  days: 3,
  plan: 'balanced',
  bookingWindow: '3_13',
};

const money = (value) => {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

test('carries the no-warranty, best-effort-hosting, and nothing-leaves-your-browser disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /may be slow, broken, moved, or taken offline without notice/);
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
  assert.match(html, /nothing you enter is uploaded anywhere/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no competing spreadsheet application or fleet-management platform', () => {
  // This page compares against the generic method of tracking Turo payouts
  // by hand, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no rival product here to disclaim a relationship
  // with. Turo is named throughout because it is the platform this
  // calculator's own arithmetic runs against (the same way
  // str-host-payout-calculator/vs-tracking-payouts-in-a-spreadsheet.html
  // names Airbnb and Vrbo while still comparing against a spreadsheet), so
  // this test does not exclude that name -- it pins the absence of a rival
  // spreadsheet app or fleet/host-management platform, which is what the
  // exemption actually depends on.
  assert.doesNotMatch(html, /Google Sheets|Microsoft Excel|Airtable|Notion|HyreCar|Getaround|HopDrive|Avail/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-tracking-turo-payouts-in-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
    assert.ok(
      squash(visible).includes(squash(question.acceptedAnswer.text)),
      `FAQ answer for "${question.name}" is not visible on the page`,
    );
  }
});

test('the worked-example figures match calc.mjs on the stated trip', () => {
  // This is the test worth having on this page: its whole argument is a set
  // of dollar amounts, and a page whose numbers have drifted from the
  // calculator it promotes is worse than no page -- a specific, checkable,
  // wrong claim about the tool's own arithmetic. So every figure is
  // recomputed from the shipped model rather than pinned to a literal
  // someone typed once, the same discipline
  // str-host-payout-calculator/vs-tracking-payouts-in-a-spreadsheet.test.mjs
  // uses on its own worked example.
  const base = computeTripPayout(TRIP);
  assert.equal(money(base.hostPayout), '$280.00');
  assert.equal(money(base.turoCut), '$70.00');
  assert.equal(base.hostShare, 0.8);

  const plans = comparePlans({ ...TRIP, selectedPlan: TRIP.plan });
  const byPlan = Object.fromEntries(plans.rows.map((r) => [r.plan, r]));
  assert.equal(money(byPlan.peace_of_mind.hostPayout), '$245.00');
  assert.equal(money(byPlan.peace_of_mind.turoCut), '$105.00');
  assert.equal(money(byPlan.balanced.hostPayout), '$280.00');
  assert.equal(money(byPlan.balanced.turoCut), '$70.00');
  assert.equal(money(byPlan.more_earnings.hostPayout), '$315.00');
  assert.equal(money(byPlan.more_earnings.turoCut), '$35.00');
  assert.equal(money(plans.swing), '$70.00');

  const windows = compareBookingWindows({ ...TRIP, selectedWindow: TRIP.bookingWindow });
  const byWindow = Object.fromEntries(windows.rows.map((r) => [r.bookingWindow, r]));
  assert.equal(money(byWindow['0_2'].hostPayout), '$262.50');
  assert.equal(money(byWindow['0_2'].turoCut), '$87.50');
  assert.equal(money(byWindow['3_13'].hostPayout), '$280.00');
  assert.equal(money(byWindow['14_27'].hostPayout), '$297.50');
  assert.equal(money(byWindow['14_27'].turoCut), '$52.50');
  assert.equal(money(byWindow['28_plus'].hostPayout), '$315.00');
  assert.equal(money(windows.swing), '$52.50');

  // The two swings are genuinely different numbers, which is this page's
  // whole argument -- a single spreadsheet cell cannot report both.
  assert.notEqual(money(plans.swing), money(windows.swing));

  const monthly = estimateMonthly(base.hostPayout, 6);
  assert.equal(money(monthly.monthly), '$1,680.00');
  assert.equal(money(monthly.annual), '$20,160.00');

  for (const figure of ['$280.00', '$245.00', '$315.00', '$70.00', '$262.50', '$297.50', '$52.50', '$1,680.00', '$20,160.00']) {
    assert.ok(html.includes(figure), `${figure} missing from the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-tracking-turo-payouts-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-turo-payouts-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the sibling guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-does-turo-take-from-hosts\.html"/);
});

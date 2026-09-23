import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { CHANNEL_PRESETS, compareChannels } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-tracking-payouts-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The exact stay the page states in prose, so the test and the page cannot
// drift apart without one of them being edited.
const BOOKING = {
  nightlyRate: 220,
  nights: 4,
  cleaningFee: 120,
  extraFees: 0,
  taxRate: 8,
  securityDeposit: 0,
  bookingsPerYear: 40,
};

const money = (value) => {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const pct = (value) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

test('carries the no-warranty, best-effort-hosting, and nothing-leaves-your-browser disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /may be slow, broken, moved, or taken offline without notice/);
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
  assert.match(html, /nothing you enter is uploaded anywhere/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no competing spreadsheet application or STR management platform', () => {
  // This page compares against the generic method of tracking payouts by
  // hand across channels, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no rival product here to disclaim a relationship
  // with. Airbnb and Vrbo are named throughout because they are the two
  // channels this calculator's own arithmetic runs on (the same way
  // amazon-fba-calculator/vs-tracking-it-in-a-spreadsheet.html names
  // "Amazon" while still comparing against a spreadsheet, not Amazon as a
  // product), so this test does not exclude those two names -- it pins the
  // absence of a rival spreadsheet app or property-management platform,
  // which is what the exemption actually depends on.
  assert.doesNotMatch(html, /Google Sheets|Microsoft Excel|Airtable|Notion|Hospitable|Guesty|Wheelhouse|PriceLabs|Beyond Pricing|Lodgify|OwnerRez|Hostfully|Smoobu|Uplisting/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-tracking-payouts-in-a-spreadsheet\.html">/);
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

test('the per-channel worked-example figures match calc.mjs on the stated stay', () => {
  // This is the test worth having on this page: its whole argument is a set
  // of dollar amounts, and a page whose numbers have drifted from the
  // calculator it promotes is worse than no page -- a specific, checkable,
  // wrong claim about the tool's own arithmetic. So every figure is
  // recomputed from the shipped model rather than pinned to a literal
  // someone typed once, the same discipline
  // owner-operator-cpm-calculator/vs-dividing-your-bills-by-your-miles.test.mjs
  // and artificial-turf-bid-calculator/vs-a-flat-rate-per-square-foot.test.mjs
  // use on their own worked examples.
  const comparison = compareChannels(BOOKING, CHANNEL_PRESETS);
  assert.equal(comparison.error, undefined);

  assert.equal(money(comparison.booking.subtotal), '$1,000.00');

  const byId = Object.fromEntries(comparison.channels.map((c) => [c.id, c]));

  assert.equal(money(byId['airbnb-host-only'].payoutAfterSite), '$845.00');
  assert.equal(money(byId['airbnb-host-only'].guestPays), '$1,080.00');
  assert.equal(pct(byId['airbnb-host-only'].effectiveHostFeeRate), '15.5%');
  assert.equal(money(byId['airbnb-host-only'].annualPayout), '$33,800.00');

  assert.equal(money(byId['airbnb-split'].payoutAfterSite), '$970.00');
  assert.equal(money(byId['airbnb-split'].guestPays), '$1,221.00');
  assert.equal(pct(byId['airbnb-split'].effectiveHostFeeRate), '3%');
  assert.equal(money(byId['airbnb-split'].annualPayout), '$38,800.00');
  assert.equal(byId['airbnb-split'].referenceOnly, true);
  assert.equal(byId['airbnb-split'].isBest, false, 'the reference-only row must never be named best');

  assert.equal(money(byId['vrbo-pay-per-booking'].payoutAfterSite), '$917.60');
  assert.equal(money(byId['vrbo-pay-per-booking'].guestPays), '$1,180.00');
  assert.equal(pct(byId['vrbo-pay-per-booking'].effectiveHostFeeRate), '8.2%');
  assert.equal(money(byId['vrbo-pay-per-booking'].annualPayout), '$36,704.00');

  assert.equal(money(byId['vrbo-subscription'].payoutAfterSite), '$952.63');
  assert.equal(money(byId['vrbo-subscription'].guestPays), '$1,180.00');
  assert.equal(pct(byId['vrbo-subscription'].effectiveHostFeeRate), '4.7%');
  assert.equal(money(byId['vrbo-subscription'].annualPayout), '$38,105.00');

  assert.equal(money(byId.direct.payoutAfterSite), '$958.27');
  assert.equal(money(byId.direct.guestPays), '$1,080.00');
  assert.equal(pct(byId.direct.effectiveHostFeeRate), '4.2%');
  assert.equal(money(byId.direct.annualPayout), '$26,831.60');
  assert.equal(byId.direct.keptBookings, 28);

  // Vrbo's own two plans are not on the same fee base: pay-per-booking's 5%
  // commission plus 3% processing on the guest payment prices out to a
  // different effective rate than the subscription's amortized $599/yr, even
  // though both guest-facing totals are identical on this stay.
  assert.equal(byId['vrbo-pay-per-booking'].guestPays, byId['vrbo-subscription'].guestPays);
  assert.notEqual(
    byId['vrbo-pay-per-booking'].effectiveHostFeeRate.toFixed(1),
    byId['vrbo-subscription'].effectiveHostFeeRate.toFixed(1),
  );

  // The headline claim: among the channels a host can actually choose today
  // (excluding the reference-only retired split), direct booking's own
  // per-stay payout is the highest -- but its annual payout, the number that
  // actually decides where to list, is the lowest, because it keeps only 70%
  // of bookings. The retired split itself pays more per stay than direct
  // ($970.00 vs $958.27), which is exactly why the page's own claim is
  // scoped to the selectable channels rather than to all five.
  const selectable = comparison.channels.filter((c) => !c.referenceOnly);
  const perStayRanked = [...selectable].sort((a, b) => b.payoutAfterSite - a.payoutAfterSite);
  assert.equal(perStayRanked[0].id, 'direct', 'direct should rank highest per stay among selectable channels');
  assert.ok(
    byId['airbnb-split'].payoutAfterSite > byId.direct.payoutAfterSite,
    'the reference-only split should still out-pay direct per stay, which is why it does not count',
  );
  const annualRanked = [...selectable].sort((a, b) => b.annualPayout - a.annualPayout);
  assert.equal(annualRanked[annualRanked.length - 1].id, 'direct', 'direct should rank lowest annually');

  assert.equal(comparison.best.id, 'vrbo-subscription');
  const gap = comparison.best.annualPayout - byId.direct.annualPayout;
  assert.equal(money(gap), '$11,273.40');

  assert.ok(html.includes('$958.27'), 'direct per-stay payout missing from the page');
  assert.ok(html.includes('$26,831.60'), 'direct annual payout missing from the page');
  assert.ok(html.includes('$11,273.40'), 'the annual gap missing from the page');
  assert.ok(html.includes('28'), 'kept-bookings figure missing from the page');
  assert.ok(html.includes('70%'), 'occupancy figure missing from the page');

  // The break-even figure the same comparison reports.
  assert.ok(comparison.directBreakEven);
  assert.equal(comparison.directBreakEven.bookings.toFixed(1), '39.6');
  assert.equal(pct(comparison.directBreakEven.occupancyKeep), '99%');
  assert.ok(html.includes('39.6'), 'direct break-even bookings missing from the page');
  assert.ok(html.includes('99%'), 'direct break-even occupancy share missing from the page');

  // The restore-payout figure quoted in the fine print.
  assert.ok(comparison.restore && !comparison.restore.error);
  assert.equal(money(comparison.restore.newSubtotal), '$1,147.93');
  assert.equal(pct(comparison.restore.raisePct), '14.8%');
  assert.equal(money(comparison.restore.guestDelta), '$6.93');
  assert.ok(html.includes('$1,147.93'), 'restore-payout new subtotal missing from the page');
  assert.ok(html.includes('14.8%'), 'restore-payout raise percentage missing from the page');
  assert.ok(html.includes('$6.93'), 'restore-payout guest delta missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-tracking-payouts-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-payouts-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to a sibling guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="airbnb-vs-vrbo-host-fees\.html"/);
});

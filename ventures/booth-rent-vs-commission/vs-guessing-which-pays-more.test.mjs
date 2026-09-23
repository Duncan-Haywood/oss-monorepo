import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-guessing-which-pays-more.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, employment, or career advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing platform', () => {
  // This page compares against the chair-side napkin habit of eyeballing the
  // split against the rent, not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a vendor name here is what
  // keeps that exemption honest. vs-vagaro.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Vagaro|Schedulicity|Booksy|Square Appointments/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-guessing-which-pays-more\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage answer text matches the visible paragraph exactly (modulo entities)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
  for (const question of schema.mainEntity) {
    assert.ok(
      squash(visible).includes(squash(question.acceptedAnswer.text)),
      `answer for "${question.name}" is not visible on the page verbatim`,
    );
  }
});

test('the worked-example figures match calc.mjs on the shipped defaults', async () => {
  const { compareCompensation } = await import('./calc.mjs');

  // The shipped index.html defaults.
  const input = {
    averageTicket: 85,
    clientsPerWeek: 14,
    retailPerWeek: 80,
    weeksWorkedPerYear: 50,
    averageServiceMinutes: 75,
    commissionPercent: 50,
    retailCommissionPercent: 10,
    unpaidHoursCommission: 2,
    boothRentAmount: 275,
    boothRentCadence: 'weekly',
    cardFeePercent: 2.9,
    backbarPercent: 10,
    retailCostPercent: 50,
    otherWeeklyCost: 20,
    unpaidHoursBooth: 7,
    marginalIncomeTaxPercent: 0,
  };
  const result = compareCompensation(input);

  assert.equal(result.weeklyGross, 1270);
  assert.equal(result.commission.weeklyTakeHome.toFixed(2), '603.00');
  assert.equal(result.commission.weeklyHours, 19.5);
  assert.equal(result.commission.effectiveHourly.toFixed(2), '30.92');
  assert.equal(result.booth.weeklyTakeHome.toFixed(2), '779.17');
  assert.equal(result.booth.weeklyHours, 24.5);
  assert.equal(result.booth.effectiveHourly.toFixed(2), '31.80');
  assert.equal(result.booth.cardFees.toFixed(2), '36.83');
  assert.equal(result.booth.backbar.toFixed(2), '119.00');
  assert.equal(result.booth.retailCost.toFixed(2), '40.00');
  assert.equal(result.weeklyDifference.toFixed(2), '176.17');
  assert.equal(result.hourlyDifference.toFixed(2), '0.88');

  // Napkin math: booth = gross minus rent only; commission = half of gross.
  const napkinBooth = result.weeklyGross - 275;
  const napkinCommission = result.weeklyGross * 0.5;
  assert.equal(napkinBooth, 995);
  assert.equal(napkinCommission, 635);
  assert.equal((napkinBooth - napkinCommission).toFixed(2), '360.00');
  assert.equal(
    ((napkinBooth - napkinCommission) - result.weeklyDifference).toFixed(2),
    '183.83',
  );

  for (const figure of ['$995', '$635', '$360', '$779.17', '$603', '$176.17', '$183.83', '$30.92', '$31.80', '$0.88', '$36.83', '$119', '$40']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-guessing-which-pays-more\.html"|href="vs-guessing-which-pays-more\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-guessing-which-pays-more\.html/);
});

test('the comparison page links back to the calculator and to the break-even walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-many-clients-does-booth-rent-need\.html"/);
});

test('does not disparage the napkin habit', () => {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const word of ['worse', 'rip-off', 'ripoff', 'overpriced', 'scam', 'useless', 'stupid', 'dumb']) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

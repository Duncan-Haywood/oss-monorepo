import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateSeason } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-seasonal-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The shipped defaults this page's prose states, so the test and the page
// cannot drift apart without one of them being edited.
const BASE = {
  operatorWage: 22,
  burdenRate: 30,
  truckHourly: 45,
  deadheadMinutesPerSite: 6,
  saltCostPerBag: 8,
  overheadRate: 15,
  targetMargin: 20,
  passesPerSnowEvent: 1,
};

const TWO_CAR_DRIVEWAY = { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 };
const SIDEWALKS_ONLY = { name: 'Sidewalks / walkways only', minutesPerPush: 4, sidewalkMinutes: 18, saltBags: 1 };
const MEDIUM_LOT = { name: 'Medium lot (20-50 cars)', minutesPerPush: 55, sidewalkMinutes: 20, saltBags: 8 };

const money = (value) => {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

test('carries the no-warranty and nothing-leaves-your-browser disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/);
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test('names no competing business-management platform or field-service app', () => {
  // This page compares against the generic method of quoting one flat
  // seasonal rate from memory, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no rival product here to
  // disclaim a relationship with. "Aspire" is named once, in a link to this
  // venture's own separate vs-aspire.html page (which carries its own
  // trademark disclaimer), so this test excludes other field-service
  // platforms this page could otherwise be mistaken for promoting.
  assert.doesNotMatch(html, /ServiceTitan|Jobber|Housecall Pro|ServiceMonster|Workiz/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-seasonal-rate\.html">/);
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

test('the same-storm-count, three-stop worked example matches calc.mjs', () => {
  const shared = { ...BASE, expectedSnowEvents: 10, expectedIceEvents: 6, proposedSeasonal: 950 };

  const driveway = calculateSeason({ ...shared, sites: [TWO_CAR_DRIVEWAY] });
  assert.equal(money(driveway.walkAwaySeasonal), '$764.95');
  assert.equal(money(driveway.proposedSeasonal.profit), '$185.05');
  assert.equal(driveway.proposedSeasonal.margin.toFixed(1), '19.5');
  assert.equal(driveway.proposedSeasonal.belowBreakEven, false);

  const sidewalks = calculateSeason({ ...shared, sites: [SIDEWALKS_ONLY] });
  assert.equal(money(sidewalks.walkAwaySeasonal), '$725.05');
  assert.equal(money(sidewalks.proposedSeasonal.profit), '$224.95');
  assert.equal(sidewalks.proposedSeasonal.margin.toFixed(1), '23.7');

  const lot = calculateSeason({ ...shared, sites: [MEDIUM_LOT] });
  assert.equal(money(lot.walkAwaySeasonal), '$2,871.96');
  assert.equal(money(lot.proposedSeasonal.profit), '-$1,921.96');
  assert.equal(lot.proposedSeasonal.margin.toFixed(1), '-202.3');
  assert.equal(lot.proposedSeasonal.belowBreakEven, true);

  for (const text of ['$764.95', '$185.05', '19.5%', '$725.05', '$224.95', '23.7%', '$2,871.96', '$1,921.96', '202.3%']) {
    assert.ok(html.includes(text), `${text} missing from the page`);
  }
});

test('the same-driveway, three-winter worked example matches calc.mjs', () => {
  const flat = { ...BASE, expectedIceEvents: 6, sites: [TWO_CAR_DRIVEWAY], proposedSeasonal: 950 };

  const mild = calculateSeason({ ...flat, expectedSnowEvents: 8 });
  assert.equal(money(mild.walkAwaySeasonal), '$663.99');
  assert.equal(money(mild.proposedSeasonal.profit), '$286.01');
  assert.equal(mild.proposedSeasonal.margin.toFixed(1), '30.1');
  assert.equal(mild.proposedSeasonal.belowBreakEven, false);

  const planned = calculateSeason({ ...flat, expectedSnowEvents: 10 });
  assert.equal(money(planned.walkAwaySeasonal), '$764.95');
  assert.equal(money(planned.proposedSeasonal.profit), '$185.05');

  const heavy = calculateSeason({ ...flat, expectedSnowEvents: 14 });
  assert.equal(money(heavy.walkAwaySeasonal), '$966.86');
  assert.equal(money(heavy.proposedSeasonal.profit), '-$16.86');
  assert.equal(heavy.proposedSeasonal.margin.toFixed(1), '-1.8');
  assert.equal(heavy.proposedSeasonal.belowBreakEven, true);

  for (const text of ['$663.99', '$286.01', '30.1%', '$966.86', '$16.86']) {
    assert.ok(html.includes(text), `${text} missing from the page`);
  }
  assert.ok(html.includes('&minus;1.8%'), '-1.8% margin missing from the page (as the &minus; entity)');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-seasonal-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-seasonal-rate\.html/);
});

test('the comparison page links back to the calculator and to the named-product comparison', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="vs-aspire\.html"/);
});

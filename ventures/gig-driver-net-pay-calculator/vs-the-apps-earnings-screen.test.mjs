import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateSession } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-the-apps-earnings-screen.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or legal advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no gig platform by name', () => {
  // Deliberately a generic-method comparison (every gig platform's own
  // earnings screen), not a named-vendor one -- unlike this venture's own
  // vs-gridwise.html, which names Gridwise and carries its own affiliation
  // disclaimer. "Gridwise" itself is allowed here only as a cross-link to
  // that sibling page (checked separately below), never as the subject of
  // this page's own comparison.
  assert.doesNotMatch(html, /DoorDash|Uber|Instacart|Lyft|Grubhub|Stride/i);
});

test('the worked example matches calculateSession', () => {
  const result = calculateSession({
    grossPay: 220,
    milesDriven: 95,
    hoursActive: 6.5,
    mpg: 28,
    gasPrice: 3.4,
    maintenancePerMile: 0.08,
    insuranceMonthly: 120,
    otherFixedMonthly: 25,
    monthlyMiles: 1400,
    taxReservePercent: 25,
  });
  assert.equal(result.grossPerHour.toFixed(2), '33.85');
  assert.equal(result.vehicleCost.toFixed(2), '28.98');
  assert.equal(result.netPerHour.toFixed(2), '29.39');
  assert.equal(result.takeHomePerHour.toFixed(2), '22.04');
  const gap = Number(result.grossPerHour.toFixed(2)) - Number(result.takeHomePerHour.toFixed(2));
  assert.equal(gap.toFixed(2), '11.81');

  assert.match(html, /\$33\.85/);
  assert.match(html, /\$28\.98/);
  assert.match(html, /\$29\.39/);
  assert.match(html, /\$22\.04/);
  assert.match(html, /\$11\.81 less/);
  assert.match(html, /35% gap/);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-the-apps-earnings-screen\.html">/);
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

test('every FAQPage answer is on the page verbatim', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-the-apps-earnings-screen\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-the-apps-earnings-screen\.html/);
});

test('the comparison page links back to the calculator and to the sibling Gridwise page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/vs-gridwise\.html"/);
});

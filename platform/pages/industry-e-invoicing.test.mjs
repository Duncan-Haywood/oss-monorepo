// The e-invoicing industry page (industry-e-invoicing.mjs): every deadline
// cited to an official page with the day it was read, the paid product never
// sold as available, the free checker linked, not-tax-advice in three
// languages, and the build wiring (sitemap, an inbound link, llms.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderEInvoicingIndustryPage, DEADLINES, PROBLEMS, FAQ, PRODUCT, SOURCES_CHECKED,
  INDUSTRY_E_INVOICING_PATH, longDate, DESCRIPTION,
} from './industry-e-invoicing.mjs';
import { renderHubSitemap, renderCustomDevelopmentPage } from './build.mjs';
import { SITE_OWN_DIRS } from './check.mjs';

const base = 'https://example.test/';
const html = renderEInvoicingIndustryPage({ baseUrl: base });

// Hosts a deadline may rest on: the four governments' own sites.
const OFFICIAL = /^https:\/\/(www\.)?(bundesfinanzministerium\.de|economie\.gouv\.fr|impots\.gouv\.fr|einvoice\.belgium\.be|finance\.belgium\.be|(ksef\.)?podatki\.gov\.pl|gov\.pl)\//;

test('covers the four countries, and every deadline cites an official page and the day it was read', () => {
  assert.deepEqual([...new Set(DEADLINES.map((r) => r.country))].sort(), ['Belgium', 'France', 'Germany', 'Poland']);
  for (const r of DEADLINES) {
    assert.match(r.source.url, OFFICIAL, `${r.country} ${r.date}`);
    assert.match(r.read, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.via, 'says how the source was read');
    assert.ok(html.includes(`href="${r.source.url}"`), r.source.url);
    assert.ok(html.includes(`<time datetime="${r.date}">${longDate(r.date)}</time>`), r.date);
  }
  assert.ok(html.includes(`read ${longDate(SOURCES_CHECKED)}`));
});

test('the dates the bet rests on are the ones in the table', () => {
  const has = (code, date) => DEADLINES.some((r) => r.code === code && r.date === date);
  assert.ok(has('DE', '2025-01-01') && has('DE', '2027-01-01') && has('DE', '2028-01-01'));
  assert.ok(has('FR', '2026-09-01') && has('FR', '2027-09-01'));
  assert.ok(has('BE', '2026-01-01'));
  assert.ok(has('PL', '2026-02-01') && has('PL', '2026-04-01') && has('PL', '2027-01-01'));
  // Germany's 2027 step is the €800,000 threshold.
  assert.match(DEADLINES.find((r) => r.code === 'DE' && r.date === '2027-01-01').change, /800,000/);
});

test('names the four problems and links the free checker', () => {
  for (const id of ['rejected', 'unreadable', 'formats', 'many-clients']) assert.ok(PROBLEMS.some((p) => p.id === id), id);
  assert.match(html, /XRechnung/);
  assert.match(html, /ZUGFeRD/);
  assert.match(html, /Factur-X/);
  assert.match(html, /href="\.\.\/\.\.\/einvoice-preflight\/"/);
  for (const file of ['germany-e-invoice-mandate.html', 'france-e-invoice-mandate.html', 'belgium-e-invoice-mandate.html', 'poland-ksef-e-invoice-mandate.html']) {
    assert.ok(html.includes(`../../einvoice-preflight/${file}`), file);
  }
});

test('the paid product is in development, never offered for sale', () => {
  assert.match(PRODUCT.status, /in development/);
  assert.match(html, /early access/i);
  assert.match(html, /mailto:hello@marisstella\.app\?subject=/);
  // No price, no buy button, no testimonials.
  assert.ok(!/€\s?\d+\s*(\/|per|a)\s*(mo|month)/i.test(html), 'no price promised');
  assert.ok(!/\b(buy now|subscribe now|start (your )?free trial)\b/i.test(html));
  assert.ok(!/testimonial|trusted by|customers love/i.test(html));
});

test('not tax advice, in English, German and French, with lang-tagged summaries', () => {
  assert.match(html, /not tax advice/);
  assert.match(html, /<section class="ei-summary" lang="de"[\s\S]*Keine Steuerberatung/);
  assert.match(html, /<section class="ei-summary" lang="fr"[\s\S]*pas un conseil fiscal/);
  assert.match(html, /gelesen am 24\.11\.2026/);
});

test('indexable, canonical, FAQ data matches the visible FAQ', () => {
  assert.ok(!/content="noindex"/.test(html));
  assert.ok(DESCRIPTION.length <= 160, `${DESCRIPTION.length} characters`);
  assert.ok(html.includes(`<link rel="canonical" href="${base}${INDUSTRY_E_INVOICING_PATH}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity.length, FAQ.length);
  const visible = html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const q of ld.mainEntity) assert.ok(visible.includes(`<dt>${q.name}</dt>`), q.name);
});

test('carries the shared footer and chrome it is given', () => {
  const page = renderEInvoicingIndustryPage({ baseUrl: base, disclaimer: '<h2>No warranty</h2>', chromeScript: '<script src="x"></script>' });
  assert.match(page, /<h2>No warranty<\/h2>/);
  assert.match(page, /<script src="x"><\/script>/);
});

test('wired into the build: sitemap, an inbound link, a site-owned directory', () => {
  assert.ok(renderHubSitemap(base).includes(`<loc>${base}${INDUSTRY_E_INVOICING_PATH}</loc>`));
  assert.ok(renderCustomDevelopmentPage({ baseUrl: base, requests: [] }).includes(`href="../${INDUSTRY_E_INVOICING_PATH}"`));
  assert.ok(SITE_OWN_DIRS.has('industries'));
});

test('shows the checker\'s real still under the free checker section, and none without one', () => {
  const shots = [
    { slug: 'pay-application-generator', file: 'p.webp', caption: 'Other tool' },
    { slug: 'einvoice-preflight', file: 'e.webp', hero: 'e-hero.webp', heroWide: 'e-hero-1200.webp', caption: 'Checks an e-invoice' },
  ];
  const withStill = renderEInvoicingIndustryPage({ baseUrl: base, shots });
  const fig = withStill.match(/<figure class="ei-still">[\s\S]*?<\/figure>/);
  assert.ok(fig, 'figure rendered');
  assert.ok(withStill.indexOf(fig[0]) > withStill.indexOf('id="checker"') && withStill.indexOf(fig[0]) < withStill.indexOf('id="product"'));
  assert.match(fig[0], /src="\.\.\/\.\.\/showcase\/e-hero\.webp" srcset="\.\.\/\.\.\/showcase\/e-hero\.webp 600w, \.\.\/\.\.\/showcase\/e-hero-1200\.webp 1200w"/);
  assert.match(fig[0], /width="600" height="375"/);
  assert.match(fig[0], /alt="E-invoice Preflight with its broken example checked: Checks an e-invoice"/);
  assert.match(fig[0], /loading="lazy"/);
  assert.ok(!withStill.includes('p.webp'), 'other tools\' stills are not shown');
  assert.ok(!html.includes('ei-still"'), 'no figure without a still');
  assert.ok(!renderEInvoicingIndustryPage({ baseUrl: base, shots: [shots[0]] }).includes('<figure'));
});

test('the deadline table stacks into labelled cards on a phone', () => {
  assert.match(html, /<table role="table" class="ei-table stack">/);
  const rows = html.match(/<tr role="row">\s*<td[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, DEADLINES.length);
  for (const row of rows) assert.deepEqual([...row.matchAll(/data-label="([^"]*)"/g)].map((m) => m[1]), ['Country', 'From', 'What changes']);
});

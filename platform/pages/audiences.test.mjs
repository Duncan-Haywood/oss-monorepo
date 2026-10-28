// Tests for the "free tools for <who>" pages: membership rules, the thin-page
// guard, the copy budget, and the rendered page's search-facing tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIENCES,
  MIN_AUDIENCE_TOOLS,
  audienceGroups,
  audienceMatches,
  audiencePageId,
  audiencesFor,
} from './audiences.mjs';
import { injectChrome, renderAudiencePage, renderHub } from './build.mjs';

const byId = Object.fromEntries(AUDIENCES.map((a) => [a.id, a]));
const surface = (slug) => ({ slug, title: slug, description: `About ${slug}.`, pageCount: 1 });

test('ids are unique and slug-shaped, and every audience has its copy', () => {
  const ids = AUDIENCES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of AUDIENCES) {
    assert.match(a.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.id);
    for (const key of ['who', 'name', 'title', 'description', 'intro', 'starting']) {
      assert.ok(typeof a[key] === 'string' && a[key].trim(), `${a.id}: ${key}`);
    }
    assert.ok(a.match instanceof RegExp, `${a.id}: match`);
  }
});

test('titles and descriptions are unique and fit a search result', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const a of AUDIENCES) {
    // The build appends " | <site name>"; a title that already runs long is the
    // one search engines truncate mid-word.
    assert.ok(a.title.length <= 60, `${a.id}: title is ${a.title.length} chars`);
    assert.ok(a.description.length <= 160, `${a.id}: description is ${a.description.length} chars`);
    assert.ok(!titles.has(a.title), `${a.id}: duplicate title`);
    assert.ok(!descriptions.has(a.description), `${a.id}: duplicate description`);
    titles.add(a.title);
    descriptions.add(a.description);
  }
});

test('slug rules anchor on word boundaries where a bare word hides inside another', () => {
  // Each pair: a slug the audience must not claim because the keyword sits
  // inside an unrelated word.
  const traps = [
    ['pet-businesses', 'carpet-cleaning-bid-calculator'],
    ['pet-businesses', 'datadog-bill-estimator'],
    ['tutors-teachers', 'uk-statutory-sick-pay-calculator'],
    ['wedding-event-pros', 'youtube-revenue-rpm-analyzer'],
    ['farms', 'branch-protection-drift-check'],
    ['farms', 'franchise-unit-economics-calculator'],
    ['farms', 'auto-detailing-service-menu-picker'],
    ['restaurants-bars', 'fbar-8938-checker'],
    ['restaurants-bars', 'buymeacoffee-payout-to-journal'],
    ['roofers', 'basement-waterproofing-bid-calculator'],
    ['hvac', 'shopify-product-csv-check'],
    ['salons-beauty', 'kitchen-tile-backsplash-bid-calculator'],
    ['salons-beauty', 'wheelchair-ramp-bid-calculator'],
    ['amazon-sellers', 'fbar-8938-checker'],
    ['truckers', 'food-truck-event-margin-calculator'],
    ['childcare', 'dog-boarding-daycare-pricing'],
    ['painters', 'paintless-dent-repair-quote-calculator'],
    ['pool-hot-tub', 'restaurant-tip-pool-calculator'],
  ];
  for (const [id, slug] of traps) {
    assert.equal(audienceMatches(byId[id], slug), false, `${id} must not claim ${slug}`);
  }
  const hits = [
    ['roofers', 'metal-roof-bid-calculator'],
    ['pet-businesses', 'dog-grooming-price-calculator'],
    ['tutors-teachers', 'tutor-package-pricing-calculator'],
    ['farms', 'u-pick-farm-profit-planner'],
    ['restaurants-bars', 'pour-cost-calculator'],
    ['amazon-sellers', 'fba-aged-inventory-fee-analyzer'],
    ['etsy-sellers', 'etsy-profit-calculator'],
    ['landlords', 'security-deposit-return-calculator'],
  ];
  for (const [id, slug] of hits) {
    assert.equal(audienceMatches(byId[id], slug), true, `${id} should claim ${slug}`);
  }
});

test('an audience below the minimum is not published, and a tool can serve several', () => {
  const surfaces = ['gutter-cleaning-bid-calculator', 'roofing-bid-calculator', 'metal-roof-bid-calculator', 'flat-roof-bid-calculator'].map(surface);
  const groups = audienceGroups(surfaces);
  assert.deepEqual(groups.map((g) => g.audience.id), ['roofers']);
  assert.equal(groups[0].items.length, MIN_AUDIENCE_TOOLS);
  assert.deepEqual(audienceGroups(surfaces.slice(1)), []);
  // Below the bar for cleaning, so the gutter-clean tool links only to roofers.
  assert.deepEqual(audiencesFor('gutter-cleaning-bid-calculator', groups).map((a) => a.id), ['roofers']);
  const both = audienceGroups(surfaces, { min: 1 });
  assert.deepEqual(
    audiencesFor('gutter-cleaning-bid-calculator', both).map((a) => a.id).sort(),
    ['cleaning-businesses', 'roofers'],
  );
});

const BASE = 'https://example.invalid/site/';
const roofTools = ['roofing-bid-calculator', 'metal-roof-bid-calculator', 'flat-roof-bid-calculator', 'gutter-install-bid-calculator'].map(surface);

test('an audience page carries its own title, description, canonical, JSON-LD and starting note', () => {
  const groups = audienceGroups(roofTools);
  const html = renderAudiencePage({ audience: byId.roofers, items: roofTools, groups: [], baseUrl: BASE, audiences: groups });
  const url = `${BASE}c/${audiencePageId(byId.roofers)}/`;
  assert.match(html, new RegExp(`<title>${byId.roofers.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\||</title>)`));
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes('"@type":"CollectionPage"') || html.includes('"@type": "CollectionPage"'));
  assert.ok(html.includes('class="starting"'));
  for (const s of roofTools) assert.ok(html.includes(`data-tool="${s.slug}"`), s.slug);
  // It does not link itself as "another" audience.
  assert.ok(!html.includes(`href="../../c/for-roofers/"`));
  assert.match(html, /no warranty/i);
});

test('the hub links every published audience page with a data-category the checker follows', () => {
  const html = renderHub(roofTools, BASE);
  assert.ok(html.includes('data-category="for-roofers"'));
  assert.ok(html.includes('href="c/for-roofers/"'));
});

test("a tool page's footer links the audiences that claim it", () => {
  const page = '<!doctype html><html><head><title>x</title></head><body><main>tool</main></body></html>';
  const out = injectChrome(page, {
    slug: 'roofing-bid-calculator',
    toRoot: '../',
    total: 4,
    canonical: `${BASE}roofing-bid-calculator/`,
    isEntry: true,
    title: 'Roofing',
    audiences: [byId.roofers],
  });
  assert.ok(out.includes('href="../c/for-roofers/">More free tools for roofers →</a>'));
  const none = injectChrome(page, { slug: 'x', toRoot: '../', total: 4, canonical: `${BASE}x/`, isEntry: true, title: 'X' });
  assert.ok(!none.includes('pf-for'));
});

test('the root README links every audience page, so the repository points searchers at them too', async () => {
  const { readFile } = await import('node:fs/promises');
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  const linked = new Set([...readme.matchAll(/\/oss-monorepo\/c\/for-([a-z0-9-]+)\//g)].map((m) => m[1]));
  assert.deepEqual([...linked].sort(), AUDIENCES.map((a) => a.id).sort());
});

test('slug rules claim the UK section 24 and 1099-K tools for their audiences', () => {
  assert.ok(audienceMatches(byId.landlords, 'uk-landlord-section-24-calculator'));
  assert.ok(audienceMatches(byId.landlords, 'section-24-mortgage-interest-check'));
  assert.ok(!audienceMatches(byId.landlords, 'section-25-notice-check'));
  assert.ok(audienceMatches(byId.freelancers, '1099-k-threshold-checker'));
  assert.ok(!audienceMatches(byId.freelancers, '1100-k-threshold-checker'));
});

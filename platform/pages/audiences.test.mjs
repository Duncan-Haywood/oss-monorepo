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

test('intros stay short enough that "Start here" is on a phone\'s first screen', () => {
  // The intro is the lede; the tool list below it already names every tool.
  // Four household audiences (2026-11-17/18) ran 66 to 85 words by listing each
  // tool in prose, which at 390 px pushed the "Start here" cards past the first
  // screen (polish-2026-11-18-audience-intros.md). The trade pages run 21 to 44.
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  for (const a of AUDIENCES) {
    assert.ok(words(a.intro) <= 50, `${a.id}: intro is ${words(a.intro)} words (max 50)`);
    assert.ok(words(a.starting) <= 50, `${a.id}: starting note is ${words(a.starting)} words (max 50)`);
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

test('the starting note sits under "Start here" when the page has one, under the list when it does not', () => {
  // In the hero it pushed the first tool card below a 360x780 screen on 20 of
  // 31 pages (docs/reports/polish-2026-11-18-starting-under-start-here.md),
  // and below 320x640 on all five short pages (polish-2026-11-18-short-audience-pages.md).
  const note = 'class="starting"';
  const short = renderAudiencePage({ audience: byId.roofers, items: roofTools, groups: [], baseUrl: BASE });
  const hero = short.slice(short.indexOf('<header class="pf-hero">'), short.indexOf('</header>'));
  assert.ok(!hero.includes(note), 'four tools: no Start here row, and still not in the hero');
  assert.equal(short.split(note).length - 1, 1, 'short page: exactly once');
  const main = short.slice(short.indexOf('<main>'), short.indexOf('</main>'));
  assert.ok(main.lastIndexOf('class="card"') < main.indexOf(note), 'short page: after the last card, inside main');
  const many = [...roofTools, ...['skylight', 'siding', 'soffit', 'chimney'].map((w) => surface(`${w}-bid-calculator`))];
  const html = renderAudiencePage({ audience: byId.roofers, items: many, groups: [], baseUrl: BASE });
  const head = html.slice(html.indexOf('<header class="pf-hero">'), html.indexOf('</header>'));
  assert.ok(!head.includes(note), 'the hero no longer carries it');
  assert.equal(html.split(note).length - 1, 1, 'exactly once');
  const start = html.slice(html.indexOf('<section class="start-here"'));
  assert.ok(start.indexOf('</ol>') < start.indexOf(note) && start.indexOf(note) < start.indexOf('</section>'),
    'after the cards, inside the Start here section');
});

test('a short audience page spanning two categories has its sections but no jump chips', () => {
  const mixed = [...roofTools.slice(0, 3), surface('etsy-fee-calculator'), surface('ebay-fee-calculator')];
  const html = renderAudiencePage({ audience: byId.roofers, items: mixed, groups: [], baseUrl: BASE });
  assert.ok((html.match(/<section class="subgroup"/g) || []).length >= 2, 'still filed in sections');
  assert.ok(!html.includes('<nav class="jumps"'), 'no chips above a list this short');
  const many = [...mixed, ...['skylight', 'siding', 'soffit'].map((w) => surface(`${w}-bid-calculator`))];
  const big = renderAudiencePage({ audience: byId.roofers, items: many, groups: [], baseUrl: BASE });
  assert.ok(big.includes('<nav class="jumps"'), 'eight or more tools keep them');
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
  const linked = new Set([...readme.matchAll(/\/c\/for-([a-z0-9-]+)\//g)].map((m) => m[1]));
  assert.deepEqual([...linked].sort(), AUDIENCES.map((a) => a.id).sort());
});

test('slug rules claim the UK section 24 and 1099-K tools for their audiences', () => {
  assert.ok(audienceMatches(byId.landlords, 'uk-landlord-section-24-calculator'));
  assert.ok(audienceMatches(byId.landlords, 'section-24-mortgage-interest-check'));
  assert.ok(!audienceMatches(byId.landlords, 'section-25-notice-check'));
  assert.ok(audienceMatches(byId.freelancers, '1099-k-threshold-checker'));
  assert.ok(!audienceMatches(byId.freelancers, '1100-k-threshold-checker'));
});

test('the retirees page claims the drawdown-years tools and leaves saving-years and employer ones out', () => {
  for (const slug of [
    'rmd-calculator',
    'qcd-calculator',
    'medicare-irmaa-cliff-calculator',
    'social-security-claiming-age-calculator',
    'retirement-withdrawal-sequencer',
    'pension-lump-sum-vs-annuity-calculator',
    'uk-state-pension-ni-years-checker',
  ]) {
    assert.ok(audienceMatches(byId.retirees, slug), slug);
  }
  for (const slug of [
    'retirement-plan-startup-credit-calculator',
    'uk-pension-annual-allowance-calculator',
    'sep-ira-contribution-calculator',
    'inherited-ira-10-year-withdrawal-planner',
  ]) {
    assert.ok(!audienceMatches(byId.retirees, slug), slug);
  }
});

test('the household pages claim parents\' and job-leavers\' tools and leave the business ones out', () => {
  for (const slug of [
    'child-tax-credit-calculator',
    'dependent-care-fsa-vs-credit-calculator',
    'nanny-tax-calculator',
    'uk-statutory-maternity-pay-calculator',
    'uk-shared-parental-pay-planner',
    'uk-tax-free-childcare-calculator',
  ]) {
    assert.ok(audienceMatches(byId.parents, slug), slug);
  }
  for (const slug of ['childcare-center-break-even-calculator', 'kids-birthday-party-package-profit-calculator', 'babysitting-business-kit']) {
    assert.ok(!audienceMatches(byId.parents, slug), slug);
  }
  for (const slug of [
    'severance-package-calculator',
    'cobra-vs-marketplace-calculator',
    '401k-loan-vs-withdrawal-calculator',
    'uk-redundancy-pay-calculator',
    'au-redundancy-pay-calculator',
    'job-offer-total-comp-calculator',
  ]) {
    assert.ok(audienceMatches(byId['job-changers'], slug), slug);
  }
  for (const slug of ['which-job-first', 'handyman-minimum-job-calculator', 'pto-accrual-liability-calculator', 'rsu-withholding-gap-calculator']) {
    assert.ok(!audienceMatches(byId['job-changers'], slug), slug);
  }
});

test('the homeowners page claims household home-money tools and leaves contractor bids and landlord tools out', () => {
  for (const slug of [
    'mortgage-points-break-even-calculator',
    'mortgage-escrow-analysis-checker',
    'heloc-vs-cash-out-refinance-calculator',
    'property-tax-appeal-calculator',
    'solar-payback-calculator',
    'heat-pump-vs-furnace-calculator',
    'home-sale-exclusion-calculator',
    'rent-vs-buy-breakeven-calculator',
    'uk-mortgage-overpayment-calculator',
  ]) {
    assert.ok(audienceMatches(byId.homeowners, slug), slug);
  }
  for (const slug of [
    'solar-pv-bid-calculator',
    'furnace-bid-calculator',
    'standby-generator-install-price-calculator',
    'section-24-mortgage-interest-check',
    'house-hack-calculator',
    'rental-dscr-calculator',
    'home-inspection-fee-calculator',
  ]) {
    assert.ok(!audienceMatches(byId.homeowners, slug), slug);
  }
});

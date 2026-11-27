import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FRONT_DOORS, DOOR_ATTR, liveIndustries, pageDoor, pruneDoors, renderPageDoor, renderToolDoor, toolDoor,
} from './front-doors.mjs';
import { buildMap, industryForTool, INDUSTRIES, MAP_FILE, serialise } from './front-doors-map.mjs';
import { heroTitle, injectChrome, renderCategoryPage } from './build.mjs';
import { industriesWithProducts } from './business.mjs';

const root = new URL('../../', import.meta.url);
const INDUSTRY_SLUGS = ['construction', 'manufacturing', 'online-sellers', 'eu-e-invoicing', 'nonprofits'];

test('front-doors.json is what front-doors-map.mjs writes today', async () => {
  assert.equal(readFileSync(MAP_FILE, 'utf8'), serialise(await buildMap()), 'run node platform/pages/front-doors-map.mjs');
});

// Keyed by the slugs business.mjs builds industries/<slug>/ from, not a list
// of its own: until 2026-11-25 this file and the map both said `e-invoicing`
// while the page was `eu-e-invoicing`, so the e-invoicing door never rendered.
test('every industry in the map is a built industry page with a product', () => {
  const built = new Set(industriesWithProducts().map((ind) => ind.slug));
  for (const id of Object.keys(FRONT_DOORS.industries)) assert.ok(built.has(id), `front-doors-map.mjs industry ${id} is not an industry slug in business.mjs`);
});

test('every door points at one of the five industry pages, from a real venture', () => {
  assert.deepEqual(Object.keys(FRONT_DOORS.industries).sort(), [...INDUSTRY_SLUGS].sort());
  for (const [slug, id] of Object.entries(FRONT_DOORS.tools)) {
    assert.ok(INDUSTRY_SLUGS.includes(id), `${slug} -> ${id}`);
    assert.ok(existsSync(new URL(`ventures/${slug}/`, root)), `${slug} is not a venture`);
  }
  for (const id of Object.values(FRONT_DOORS.pages)) assert.ok(INDUSTRY_SLUGS.includes(id));
});

test('a paid product is never a front door to itself', () => {
  const t = JSON.parse(readFileSync(new URL('portfolio/monetization/transition.json', root), 'utf8'));
  for (const { venture } of t.proprietary) assert.equal(toolDoor(venture), null, venture);
});

test('copy states real status and claims no price or result', () => {
  for (const [id, { product, status, label, open }] of Object.entries(FRONT_DOORS.industries)) {
    // An open app may say exactly what its free plan is (business.mjs 'open-free', backed by the
    // app's plans.ts); nothing else may say "free".
    if (open) assert.match(status, /^Open — free on (one (job|platform)|Level 1 or 40 RFQs a month)$/, id);
    else assert.match(status, /early access/i, id);
    assert.ok(label && product.length <= 160, id);
    assert.doesNotMatch(`${product} ${open ? '' : status}`, /[$€£]|\b(free|best|#1|guarantee\w*|save \d)/i, id);
  }
  assert.deepEqual(Object.keys(FRONT_DOORS.industries).filter((id) => FRONT_DOORS.industries[id].open).sort(), ['construction', 'manufacturing', 'online-sellers']);
});

test('the rules: hand lists, whole-word tokens, category limits, exclusions', () => {
  const proprietary = new Set(['wall-framing-takeoff']);
  assert.equal(industryForTool('roofing-bid-calculator', { category: 'trades', subcategory: 'trades-roof', proprietary }), 'construction');
  assert.equal(industryForTool('wall-framing-takeoff', { category: 'trades', subcategory: 'trades-interior', proprietary }), null);
  assert.equal(industryForTool('lawn-care-bid-calculator', { category: 'trades', subcategory: 'trades-outdoor' }), null);
  assert.equal(industryForTool('locksmith-bid-calculator', { category: 'trades', subcategory: 'trades-openings' }), null);
  // A token in a personal-tax or CI tool is not a business customer.
  assert.equal(industryForTool('ir35-contractor-calculator', { category: 'uk-tax' }), null);
  assert.equal(industryForTool('amazon-s3-egress-check', { category: 'ci' }), null);
  assert.equal(industryForTool('ebay-fee-calculator', { category: 'marketplace' }), 'online-sellers');
  // The marketplace shelf as a whole is not resellers.
  assert.equal(industryForTool('str-host-payout-calculator', { category: 'marketplace' }), null);
  // Whole words only: "concrete" is not in "concretely".
  assert.equal(industryForTool('concretely-x', { category: 'backoffice' }), null);
  assert.equal(industryForTool('grant-deadline-tracker', { category: 'evidence' }), 'nonprofits');
  assert.ok(INDUSTRIES.construction.slugs.length > 0);
});

test('hand-reviewed top tools land where a person would put them', () => {
  const expect = {
    'roofing-bid-calculator': 'construction',
    'drywall-bid-calculator': 'construction',
    'retainage-cashflow-calculator': 'construction',
    'mechanics-lien-deadline-calculator': 'construction',
    'cnc-machining-quote-calculator': 'manufacturing',
    'ebay-fee-calculator': 'online-sellers',
    'etsy-profit-calculator': 'online-sellers',
    'eu-einvoicing-mandate-checker': 'eu-e-invoicing',
    'grant-deadline-tracker': 'nonprofits',
    'rmd-calculator': null,
  };
  for (const [slug, id] of Object.entries(expect)) assert.equal(toolDoor(slug), id, slug);
  assert.equal(pageDoor('trades'), 'construction');
  assert.equal(pageDoor('for-roofers'), 'construction');
  assert.equal(pageDoor('marketplace'), 'online-sellers');
  assert.equal(pageDoor('household'), null);
});

test('a tool door renders only for a mapped tool whose industry page is live', () => {
  const live = new Set(['construction']);
  const html = renderToolDoor({ slug: 'roofing-bid-calculator', toRoot: '../', live });
  assert.match(html, /href="\.\.\/industries\/construction\/"/);
  assert.match(html, new RegExp(`${DOOR_ATTR}="construction"`));
  assert.match(html, /Open — free on one job/);
  assert.match(html, /start free, or see what it does →/);
  assert.match(html, /this tool stays free/);
  const early = renderToolDoor({ slug: 'eu-einvoicing-mandate-checker', toRoot: '../', live: new Set(['eu-e-invoicing']) });
  assert.match(early, /In development — early access/);
  assert.match(early, /see what is being built →/);
  assert.equal(renderToolDoor({ slug: 'ebay-fee-calculator', toRoot: '../', live }), '', 'industry page not live');
  assert.equal(renderToolDoor({ slug: 'rmd-calculator', toRoot: '../', live: new Set(INDUSTRY_SLUGS) }), '', 'unmapped');
});

test('injectChrome puts the door first in the footer, and nothing when absent', () => {
  const page = '<!doctype html><html><head><title>t</title></head><body><h1>Roofing</h1></body></html>';
  const base = { slug: 'roofing-bid-calculator', toRoot: '../', total: 3, title: 'Roofing Bid Calculator' };
  const door = renderToolDoor({ slug: 'roofing-bid-calculator', toRoot: '../', live: new Set(['construction']) });
  const out = injectChrome(page, { ...base, door });
  const at = out.indexOf('class="pf-door"');
  assert.ok(at > 0 && at < out.indexOf('class="pf-ask"'));
  assert.equal(injectChrome(page, base).includes('pf-door'), false);
});

test('category pages: a door under the hero, pruned when its page is missing; "Free" leaves the h1, not the <title>', () => {
  const category = { id: 'trades', title: 'Trades', accent: '#333' };
  const items = [{ slug: 'roofing-bid-calculator', title: 'Roofing Bid Calculator', description: 'd' }];
  const html = renderCategoryPage({ category, items, groups: [{ category, items }], baseUrl: 'https://x/' });
  assert.match(html, /<p class="door" data-pf-door="construction">/);
  assert.match(html, /<title>Free contractor bid calculators/);
  assert.match(html, /<h1>Contractor bid calculators/);
  assert.match(html, /<p class="count">1 tool · free, no account · /);
  const pruned = pruneDoors(html, new Set());
  assert.ok(!pruned.includes(DOOR_ATTR));
  assert.equal(pruneDoors(html, new Set(['construction'])), html);
  // Removing the door leaves exactly the page that would have had none.
  const none = renderCategoryPage({ category: { id: 'household', title: 'Household' }, items, groups: [], baseUrl: 'https://x/' });
  assert.ok(!none.includes(DOOR_ATTR));
  assert.equal(pruned, html.replace(/\n {4}<p class="door"[^\n]*<\/p>/, ''));
});

test('heroTitle drops only a leading "Free"', () => {
  assert.equal(heroTitle('Free marketplace seller fee calculators'), 'Marketplace seller fee calculators');
  assert.equal(heroTitle('More free small-business calculators'), 'More free small-business calculators');
});

test('liveIndustries reads the built tree', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'doors-'));
  mkdirSync(path.join(dir, 'industries', 'nonprofits'), { recursive: true });
  writeFileSync(path.join(dir, 'industries', 'nonprofits', 'index.html'), '<!doctype html>');
  assert.deepEqual([...liveIndustries(dir)], ['nonprofits']);
  assert.equal(renderPageDoor({ pageId: 'household', toRoot: '../../' }), '');
});

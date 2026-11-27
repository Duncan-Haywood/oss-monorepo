// The manufacturing industry page (`industries/manufacturing/`): problems map
// to products and free tools, the products read as in development, nothing
// implies CMMC certification or DoD endorsement, and every linked tool ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildManufacturingPage, EARLY_ACCESS_HREF, FACTS, FREE_TOOLS, INDEXED, INDUSTRIES_DIR, LEAD_STILL,
  MANUFACTURING_PATH, PROBLEMS, PRODUCTS, renderManufacturingPage,
} from './industry-manufacturing.mjs';
import { CHROME_MODULE_FILE, CUSTOM_DEV_PATH } from './build.mjs';
import { INDUSTRIES_DIR as CHECK_INDUSTRIES_DIR, SITE_OWN_DIRS } from './check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const base = 'https://example.test/';
const html = renderManufacturingPage({ baseUrl: base });
const text = html.replace(/<[^>]+>/g, ' ');

test('every problem routes to a product or a free tool, and every route resolves', () => {
  for (const p of PROBLEMS) {
    const product = PRODUCTS.some((x) => x.problems.includes(p.id));
    const tool = FREE_TOOLS.some((t) => t.problem === p.id);
    assert.ok(product || tool, `${p.id} leads nowhere`);
  }
  const ids = new Set(PROBLEMS.map((p) => p.id));
  for (const x of PRODUCTS) for (const id of x.problems) assert.ok(ids.has(id), `${x.id} names unknown problem ${id}`);
  for (const t of FREE_TOOLS) assert.ok(t.problem === null || ids.has(t.problem), `${t.slug} names unknown problem ${t.problem}`);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${m[1]}"`), `#${m[1]} has no target`);
});

test('the job-shop problems the brief names are all here', () => {
  for (const re of [/RFQ/, /own rates/i, /CMMC Level 1\/2/, /SPRS/, /ISO 9001/, /AS9100/]) assert.match(text, re);
});

test('every free tool is a venture, linked when published and dropped when not', () => {
  for (const t of FREE_TOOLS) {
    assert.ok(existsSync(path.join(ROOT, 'ventures', t.slug, 'index.html')), `${t.slug} is not a venture`);
    assert.ok(html.includes(`href="../../${t.slug}/"`), `${t.slug} not linked`);
  }
  const [gone, ...kept] = FREE_TOOLS.map((t) => t.slug);
  const partial = renderManufacturingPage({ baseUrl: base, published: new Set(kept) });
  assert.ok(!partial.includes(`href="../../${gone}/"`), `${gone} linked though not published`);
  for (const slug of kept) assert.ok(partial.includes(`href="../../${slug}/"`), slug);
});

test('every tool the front doors send here is listed, so the door leads somewhere useful', () => {
  const doors = JSON.parse(readFileSync(path.join(HERE, 'front-doors.json'), 'utf8'));
  assert.ok(doors.industries.manufacturing, 'front-doors.json has no manufacturing industry');
  assert.equal(`${INDUSTRIES_DIR}/manufacturing/`, MANUFACTURING_PATH);
  const listed = new Set(FREE_TOOLS.map((t) => t.slug));
  // 3d-print-price-calculator is mapped for makers selling prints; not a job-shop tool.
  const skipped = new Set(['3d-print-price-calculator']);
  for (const [slug, id] of Object.entries(doors.tools)) {
    if (id === 'manufacturing' && !skipped.has(slug)) assert.ok(listed.has(slug), `${slug} is a manufacturing door but not on the page`);
  }
});

test('products are in development or open free, unpriced, and never claim certification or endorsement', () => {
  for (const p of PRODUCTS) {
    if (p.appUrl) {
      // An open product: its own host on the catalogue's domain, never workers.dev, and the paid plans unsold.
      assert.match(p.appUrl, /^https:\/\/[a-z-]+\.marisstella\.app\//);
      assert.match(p.status, /^Open: free/);
      assert.ok(html.includes(`href="${p.appUrl}"`), p.appUrl);
    } else {
      assert.match(p.status, /in development/i);
    }
  }
  assert.match(text, /Paid plans are not on sale yet/);
  // Every product open (both since 2026-11-27): no early-access offer is left on the page.
  if (PRODUCTS.some((p) => !p.appUrl)) {
    assert.match(text, /early access/i);
    assert.match(text, /Pricing is not set yet/);
  } else {
    assert.doesNotMatch(text, /Pricing is not set yet/);
  }
  assert.doesNotMatch(text, /\$\d+\s*(?:\/|a |per )mo/i);
  assert.doesNotMatch(text, /\b(?:get|become|guarantee[sd]?|achieve)\s+(?:CMMC\s+)?certifi/i);
  assert.doesNotMatch(text, /(?:DoD|Department of Defense)[- ](?:approved|endorsed|certified)/i);
  assert.match(text, /not a certification/);
  assert.match(text, /not a C3PAO/);
  assert.match(text, /nothing here is endorsed by the Department of Defense/);
  assert.doesNotMatch(text, /\b(?:available now|buy now|start your free trial)\b/i);
});

test('every fact carries a source link', () => {
  assert.ok(FACTS.length > 0);
  for (const f of FACTS) {
    assert.match(f.href, /^https:\/\//);
    assert.ok(html.includes(`href="${f.href.replace(/&/g, '&amp;')}"`), f.href);
  }
});

test('disclaimer, usage tracking, canonical and the noindex switch', () => {
  assert.match(html, /No warranty/);
  assert.ok(html.includes(`src="../../${CHROME_MODULE_FILE}"`), 'site chrome script (usage counter) missing');
  assert.ok(html.includes(`<link rel="canonical" href="${base}${MANUFACTURING_PATH}">`));
  assert.equal(/content="noindex"/.test(html), !INDEXED);
  assert.doesNotMatch(renderManufacturingPage({ baseUrl: base, indexed: true }), /content="noindex"/);
  assert.ok(EARLY_ACCESS_HREF.startsWith(CUSTOM_DEV_PATH));
  assert.match(html, /data-pfs-head/);
});

test('check.mjs treats industries/ as a site page, not a product', () => {
  assert.equal(CHECK_INDUSTRIES_DIR, INDUSTRIES_DIR);
  assert.ok(SITE_OWN_DIRS.has(INDUSTRIES_DIR));
  assert.ok(MANUFACTURING_PATH.startsWith(`${INDUSTRIES_DIR}/`));
});

test('writes industries/manufacturing/index.html', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'mfg-'));
  assert.equal(await buildManufacturingPage(out, base, { footer: '<p>site footer</p>', tail: '<script>tail</script>' }), MANUFACTURING_PATH);
  const written = readFileSync(path.join(out, 'industries', 'manufacturing', 'index.html'), 'utf8');
  assert.ok(written.includes('Software for machine shops'));
  assert.ok(written.includes('<p>site footer</p>') && written.includes('<script>tail</script>'));
});

test('real stills: the nesting sheet leads, the quote calculator sits in the quoting card', () => {
  const shots = [
    { slug: 'dxf-nesting', file: 'dxf-nesting.webp', caption: 'Nests parts', hero: 'dxf-nesting-hero.webp', heroWide: 'dxf-nesting-hero-1200.webp' },
    { slug: 'cnc-machining-quote-calculator', file: 'cnc-machining-quote-calculator.webp', caption: 'Costs a part' },
    { slug: 'not-listed-here', file: 'x.webp', caption: 'Other' },
  ];
  const page = renderManufacturingPage({ baseUrl: base, shots });
  const lead = page.indexOf('class="still lead-still"');
  assert.ok(lead > 0 && lead < page.indexOf('Common problems, and what solves them'), 'lead still sits above the problems');
  assert.match(page.slice(lead, page.indexOf('</figure>', lead)), /srcset="[^"]*dxf-nesting-hero-1200\.webp 1200w"/);
  assert.doesNotMatch(page.slice(lead, page.indexOf('</figure>', lead)), /loading="lazy"/, 'the first-screen still is eager');
  const card = page.slice(page.indexOf('id="jobshop-quote"'));
  assert.match(card.slice(0, card.indexOf('</section>')), /showcase\/cnc-machining-quote-calculator\.webp" width="960" height="600"[^>]*loading="lazy"/);
  assert.ok(!page.includes('x.webp'), 'a still of a tool this page does not list is not shown');
  for (const m of page.matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]{20,}"/, 'every still has alt text');
  // An unpublished tool's still drops with its link; no stills, no figure.
  const published = new Set(FREE_TOOLS.map((t) => t.slug).filter((slug) => slug !== LEAD_STILL));
  assert.ok(!renderManufacturingPage({ baseUrl: base, shots, published }).includes('dxf-nesting'));
  assert.ok(!html.includes('<figure'));
});

test('the stills the page asks for are captured in the showcase', () => {
  const manifest = JSON.parse(readFileSync(path.join(HERE, 'showcase', 'manifest.json'), 'utf8'));
  for (const slug of [LEAD_STILL, ...PRODUCTS.map((p) => p.still).filter(Boolean)]) {
    const shot = manifest.shots.find((s) => s.slug === slug);
    assert.ok(shot, `${slug} has no still in showcase/manifest.json`);
    for (const f of [shot.file, shot.hero, shot.heroWide].filter(Boolean)) assert.ok(existsSync(path.join(HERE, 'showcase', f)), f);
  }
});

test("the free plan line matches Job Shop Quote's own FREE_PLAN", () => {
  const src = readFileSync(new URL('../../ventures/jobshop-quote/apps/jobshop-quote/src/shared/plans.ts', import.meta.url), 'utf8');
  const free = src.slice(src.indexOf('key: "free"'), src.indexOf('key: "shop"'));
  const rfqs = Number(/rfqsPerMonth: (\d+)/.exec(free)[1]);
  const members = Number(/maxMembers: (\d+)/.exec(free)[1]);
  assert.match(free, /priceCents: 0,/);
  const jq = PRODUCTS.find((p) => p.id === 'jobshop-quote');
  assert.equal(jq.freePlan, `${rfqs} RFQs a month, ${members} users, no card`);
});

test("CMMC Workspace's free plan line matches its own plans.ts", () => {
  const src = readFileSync(new URL('../../ventures/cmmc/apps/cmmc/src/shared/plans.ts', import.meta.url), 'utf8');
  const free = src.slice(src.indexOf('key: "free"'), src.indexOf('key: "level2"'));
  assert.match(free, /priceCents: 0,/);
  assert.match(free, /maxMembers: 1,/);
  assert.match(free, /"Level 1: the 15 FAR 52\.204-21 safeguards"/);
  const cmmc = PRODUCTS.find((p) => p.id === 'cmmc');
  assert.equal(cmmc.freePlan, 'Level 1 (the 15 FAR 52.204-21 safeguards), 1 user, no card');
  assert.match(cmmc.note, /not switched on yet/, 'AI drafting is off in the hosted app');
});

test("links an open product's own site only when the build copied it in", () => {
  const linked = renderManufacturingPage({ productSites: new Set(['cmmc']) });
  assert.ok(linked.includes('href="../../cmmc/">Features and pricing</a>'));
  assert.ok(!renderManufacturingPage().includes('cmmc/">Features and pricing'), 'no link to a site the build did not write');
  assert.ok(linked.includes('>Start free in CMMC Workspace</a>'));
  assert.ok(linked.includes('>Start free in Job Shop Quote</a>'));
});

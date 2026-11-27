import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildConstructionPage,
  CONSTRUCTION_PATH,
  FACTS,
  PROBLEMS,
  PRODUCTS,
  renderConstructionPage,
  RESEARCH,
  STATUS_LABELS,
  toolHref,
  toolSlug,
} from './industry-construction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://example.test/';
const allSlugs = [...new Set([...PROBLEMS.flatMap((p) => p.tools.map(([s]) => s)), ...PRODUCTS.flatMap((p) => p.freeToday)])];

test('every linked tool is a real venture with a browser page', () => {
  for (const slug of allSlugs) {
    const page = slug.includes('/')
      ? existsSync(path.join(ROOT, 'ventures', slug))
      : ['index.html', 'site/index.html'].some((f) => existsSync(path.join(ROOT, 'ventures', slug, f)));
    assert.ok(page, `ventures/${slug} has no browser page`);
  }
});

test('a page inside a venture links to that page and lives or drops with its venture', () => {
  assert.equal(toolSlug('pay-app-guides/retainage-tracker.html'), 'pay-app-guides');
  assert.equal(toolHref('../../', 'pay-app-guides/retainage-tracker.html'), '../../pay-app-guides/retainage-tracker.html');
  assert.equal(toolHref('../../', 'pay-app-guides'), '../../pay-app-guides/');
  const html = renderConstructionPage({ baseUrl: BASE });
  assert.ok(html.includes('href="../../pay-app-guides/lien-waiver-log.html"'));
  const without = renderConstructionPage({ baseUrl: BASE, liveSlugs: new Set(allSlugs.map(toolSlug).filter((s) => s !== 'pay-app-guides')) });
  assert.ok(!without.includes('pay-app-guides/'), 'unpublished venture still linked');
});

test('no tool is listed twice', () => {
  const tools = PROBLEMS.flatMap((p) => p.tools.map(([s]) => s));
  assert.equal(new Set(tools).size, tools.length);
});

test('every research link is a real research project', () => {
  for (const r of RESEARCH) assert.ok(existsSync(path.join(ROOT, 'research', r.slug, 'README.md')), r.slug);
});

test('each problem points at a known product, and each product freeToday tool is described on the page', () => {
  const ids = new Set(PRODUCTS.map((p) => p.id));
  const described = new Set(PROBLEMS.flatMap((p) => p.tools.map(([s]) => s)));
  for (const p of PROBLEMS) assert.ok(ids.has(p.product), `${p.id} -> ${p.product}`);
  for (const p of PRODUCTS) for (const s of p.freeToday) assert.ok(described.has(s), `${p.id}: ${s}`);
});

test('no product claims to be on sale, and no price is quoted', () => {
  for (const p of PRODUCTS) {
    assert.ok(STATUS_LABELS[p.status], p.id);
    assert.notEqual(p.status, 'live', `${p.id} marked live: verify it is on sale before changing this test`);
  }
  const html = renderConstructionPage({ baseUrl: BASE });
  assert.doesNotMatch(html, /\$\s?\d/, 'a price appears on the page');
  assert.match(html, /in development/i);
});

test('every market fact carries an https source', () => {
  for (const f of FACTS) assert.match(f.source, /^https:\/\//);
  const html = renderConstructionPage({ baseUrl: BASE });
  for (const f of FACTS) assert.ok(html.includes(f.source));
});

test('page carries canonical, social tags, the passed disclaimer and the site header', () => {
  const html = renderConstructionPage({ baseUrl: BASE, disclaimer: '<h2>No warranty</h2>', footer: '<nav>foot</nav>' });
  assert.ok(html.includes(`<link rel="canonical" href="${BASE}${CONSTRUCTION_PATH}">`));
  for (const tag of ['og:url', 'og:image', 'twitter:card']) assert.ok(html.includes(tag), tag);
  assert.match(html, /No warranty/);
  assert.ok(html.includes('<nav>foot</nav>'));
  assert.ok(html.includes('href="../../pf-site.css"'), 'site stylesheet linked');
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)[1];
  assert.ok(desc.length <= 160, `description is ${desc.length} chars`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
});

test('tools the build did not publish are not linked', () => {
  const live = new Set(allSlugs.filter((s) => s !== 'xer-schedule-check'));
  const html = renderConstructionPage({ baseUrl: BASE, liveSlugs: live });
  assert.ok(!html.includes('href="../../xer-schedule-check/"'));
  assert.ok(html.includes('href="../../pay-application-generator/"'));
});

test('research that was not published is left out', () => {
  const html = renderConstructionPage({ baseUrl: BASE, researchSlugs: new Set() });
  assert.ok(!html.includes('research/build-data/'));
  assert.ok(!html.includes('Construction research'));
  assert.ok(renderConstructionPage({ baseUrl: BASE }).includes('href="../../research/build-data/"'));
});

test('FAQ JSON-LD parses and matches the visible answers', () => {
  const html = renderConstructionPage({ baseUrl: BASE });
  const raw = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)[1];
  const ld = JSON.parse(raw);
  assert.equal(ld['@type'], 'FAQPage');
  for (const q of ld.mainEntity) assert.ok(html.includes(q.name.replace(/'/g, '&#39;')), q.name);
});

test('buildConstructionPage writes industries/construction/index.html', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'ic-'));
  try {
    const rel = await buildConstructionPage(out, { baseUrl: BASE });
    assert.equal(rel, CONSTRUCTION_PATH);
    assert.match(readFileSync(path.join(out, CONSTRUCTION_PATH, 'index.html'), 'utf8'), /<h1>/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('every pay-app-guides page in its own nav is linked from this page', async () => {
  // The guides venture grows a page most days; before this test six of them (paid-short,
  // joint checks, the cash forecast, stored materials, front-loading, retainage caps) never
  // reached the bet #1 landing page. nav.mjs GROUPS is the venture's own list of pages.
  const { GROUPS } = await import('../../ventures/pay-app-guides/nav.mjs');
  const linked = new Set(PROBLEMS.flatMap((p) => p.tools.map(([s]) => s)));
  for (const [, pages] of GROUPS) {
    for (const [file] of pages) {
      const tool = file === 'index.html' ? 'pay-app-guides' : `pay-app-guides/${file}`;
      assert.ok(linked.has(tool), `${tool} is in pay-app-guides/nav.mjs but not on the construction page`);
    }
  }
});

test('real stills of the free tools: the pay-app one leads, others sit in their product card', () => {
  const shots = [
    { slug: 'pay-application-generator', file: 'pay-application-generator.webp', hero: 'pay-application-generator-hero.webp', heroWide: 'pay-application-generator-hero-1200.webp', caption: 'Rolls a schedule <of> values' },
    { slug: 'wall-framing-takeoff', file: 'wall-framing-takeoff.webp', caption: 'Draws every stud' },
    { slug: 'not-on-this-page', file: 'x.webp', caption: 'x' },
  ];
  const html = renderConstructionPage({ baseUrl: BASE, shots });
  const lead = html.indexOf('class="ic-still ic-lead-still"');
  assert.ok(lead > 0 && lead < html.indexOf('The jobs that eat the week'), 'lead still sits above the problems');
  // The close crop, with its 1,200 px twin.
  assert.match(html, /<img src="\.\.\/\.\.\/showcase\/pay-application-generator-hero\.webp" srcset="[^"]*pay-application-generator-hero-1200\.webp 1200w" sizes="[^"]+" width="600" height="375" alt="Pay application generator with its worked example loaded: Rolls a schedule &lt;of&gt; values"/);
  assert.equal(html.split('showcase/pay-application-generator-hero.webp').length - 1, 2, 'the lead still (src and srcset) is not repeated in its card');
  const card = html.slice(html.indexOf('id="product-residential-takeoff"'));
  assert.match(card.slice(0, card.indexOf('</article>')), /showcase\/wall-framing-takeoff\.webp" width="960" height="600"[^>]*loading="lazy"/, 'no crop: the full still');
  assert.ok(!html.includes('x.webp'), 'a still of a tool this page does not list is not shown');
  // An unpublished tool's still drops with it.
  const live = new Set(allSlugs.map(toolSlug).filter((s) => s !== 'pay-application-generator'));
  const without = renderConstructionPage({ baseUrl: BASE, shots, liveSlugs: live });
  assert.ok(!without.includes('class="ic-still ic-lead-still"') && !without.includes('pay-application-generator'));
  // No stills, no figure.
  assert.ok(!renderConstructionPage({ baseUrl: BASE }).includes('<figure'));
});

test('early access goes somewhere private: the edge form, or the inbox by email; never the public feedback form', async () => {
  const { CONSENT_TEXT } = await import('./early-access-consent.mjs');
  const on = renderConstructionPage({ baseUrl: BASE, earlyAccessUrl: 'https://edge.example' });
  assert.match(on, /<form class="ea-form"/);
  assert.ok(on.includes('"https://edge.example/early-access"'), 'posts to the Worker route');
  assert.ok(on.includes(CONSENT_TEXT.replace(/'/g, '&#39;')), 'shows the consent words the Worker stores');
  assert.match(on, /<option value="payapps">Pay-app suite<\/option>/);
  assert.match(on, /<option value="takeoff">Residential takeoff<\/option>/);
  assert.match(on, /name="website"[^>]*tabindex="-1"/, 'honeypot field');
  assert.match(on, /<noscript>.*mailto:hello@marisstella\.app/s, 'no-script fallback');
  const off = renderConstructionPage({ baseUrl: BASE });
  assert.ok(!off.includes('ea-form"'), 'no early-access form without an edge origin');
  assert.match(off, /href="mailto:hello@marisstella\.app\?subject=Early%20access/);
  for (const html of [on, off]) {
    assert.ok(!html.includes('feedback/?type=idea'), 'not the public feedback form');
    assert.ok(!/published in the project/.test(html));
  }
});

test('built pay-app modules show as built and in testing, never as planned or available', () => {
  const html = renderConstructionPage({ baseUrl: BASE });
  const card = /<article class="ic-product" id="product-pay-apps">([\s\S]*?)<\/article>/.exec(html)[1];
  assert.match(card, /Built, in testing \(not open yet\): QuickBooks Online sync/);
  assert.doesNotMatch(card, /Planned: QuickBooks/);
  assert.match(card, /In development · early access/);
  // Each built module must be in the app's ROADMAP "Done" list.
  const roadmap = readFileSync(path.join(ROOT, 'ventures/payapps/apps/payapps/ROADMAP.md'), 'utf8');
  const done = roadmap.slice(roadmap.indexOf('## Done'), roadmap.indexOf('## Next'));
  for (const heading of ['QuickBooks Online', 'Job costing, part 1', 'RFI log', 'Submittal log', 'Estimates, part 1', 'Daily reports, part 1', 'Insurance certificates']) {
    assert.ok(done.includes(`- ${heading}`), `${heading} is in ROADMAP Done`);
  }
});

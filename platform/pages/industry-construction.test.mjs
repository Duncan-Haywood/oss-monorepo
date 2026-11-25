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

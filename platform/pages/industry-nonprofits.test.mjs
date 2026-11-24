import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACTS,
  GRANT_AUTOPILOT,
  NONPROFITS_PATH,
  PROBLEMS,
  TOOL_BLURBS,
  nonprofitToolSlugs,
  renderNonprofitsPage,
} from './industry-nonprofits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://marisstella.app/';

test('every linked free tool is a real venture with a browser entry point and a blurb', () => {
  const slugs = nonprofitToolSlugs();
  assert.ok(slugs.length >= 5);
  for (const slug of slugs) {
    const dir = path.join(ROOT, 'ventures', slug);
    assert.ok(
      existsSync(path.join(dir, 'index.html')) || existsSync(path.join(dir, 'site', 'index.html')),
      `${slug} has no published page`,
    );
    assert.ok(TOOL_BLURBS[slug], `${slug} has no blurb`);
  }
});

test('covers the four common problems, each answered by Grant Autopilot', () => {
  assert.deepEqual(PROBLEMS.map((p) => p.id), ['finding', 'rewriting', 'deadlines', 'budget']);
  const html = renderNonprofitsPage({ baseUrl: BASE });
  for (const p of PROBLEMS) assert.match(html, new RegExp(`id="${p.id}"`));
});

test('prices are the published ones, verbatim', () => {
  const html = renderNonprofitsPage({ baseUrl: BASE });
  for (const price of ['$5 a month', '$54 a year', '$20 a month', '$216 a year', '$100 a month', '$1,080 a year']) {
    assert.ok(html.includes(price), price);
  }
  assert.match(html, /No free trial/);
  assert.match(html, /30-day money-back guarantee/);
  assert.equal(GRANT_AUTOPILOT.plans.length, 3);
});

test('no outcome claims about winning grants', () => {
  const text = renderNonprofitsPage({ baseUrl: BASE }).replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\b(win|won|guarantee[sd]? (?:an? )?(?:award|grant|funding)|increase your (?:funding|win))/i);
  assert.match(text, /no tool can promise an award/);
});

test('every outside fact links its source', () => {
  const html = renderNonprofitsPage({ baseUrl: BASE });
  for (const f of Object.values(FACTS)) {
    assert.match(f.url, /^https:\/\//);
    assert.ok(html.includes(f.url), f.url);
  }
});

test('a tool missing from the build is left out, not linked dead', () => {
  const html = renderNonprofitsPage({ baseUrl: BASE, published: new Set(['grant-deadline-tracker']) });
  assert.ok(html.includes('href="../../grant-deadline-tracker/"'));
  assert.ok(!html.includes('href="../../volunteer-shift-scheduler/"'));
});

test('carries the canonical URL, the site header, the footer and the counter script passed in', () => {
  const html = renderNonprofitsPage({ baseUrl: BASE, footer: '<p>FOOTER-X</p>', tail: '<script data-pf-slug="industry-nonprofits"></script>' });
  assert.ok(html.includes(`<link rel="canonical" href="${BASE}${NONPROFITS_PATH}">`));
  assert.match(html, /data-pfs-head/);
  assert.ok(html.includes('FOOTER-X'));
  assert.ok(html.includes('data-pf-slug="industry-nonprofits"'));
  assert.ok(html.includes('href="../../grants/"'));
});

test('build.mjs writes the page and lists it in the hub sitemap', () => {
  const build = readFileSync(path.join(ROOT, 'platform', 'pages', 'build.mjs'), 'utf8');
  assert.match(build, /buildNonprofitsPage\(outDir/);
  assert.match(build, /industryPages,\n\s*\),/);
});

test('check.mjs treats Worker-served /grants/ links as live and nothing else', async () => {
  const { isWorkerServed, SITE_OWN_DIRS } = await import('./check.mjs');
  assert.ok(isWorkerServed('grants/'));
  assert.ok(isWorkerServed('grants/pricing'));
  assert.ok(isWorkerServed('grants'));
  assert.ok(!isWorkerServed('grant-deadline-tracker/'));
  assert.ok(!isWorkerServed('grantsx/'));
  assert.ok(SITE_OWN_DIRS.has('industries'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('page carries the no-warranty clause and a local-only privacy line', () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never which repo you scanned/i);
});

test('page wires scoring, usage, and app scripts', () => {
  assert.match(page, /id="scan-form"/);
  assert.match(page, /src="scoring\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(app, /recordUsage/);
  assert.match(app, /scan_completed/);
  assert.match(app, /summary_copied/);
  assert.match(app, /formatScoreSummary/);
});

test('page does not recommend turning Sponsors on', () => {
  assert.match(page, /never tells you/);
  assert.doesNotMatch(page, /you should |must enable /i);
});

test('offers a worked example so a first visit does not start on an empty box', () => {
  assert.match(page, /id="example-repo"/);
  // Scoring ourselves rather than a stranger's repo is a deliberate choice;
  // if the example ever points elsewhere that should be a conscious edit.
  assert.match(page, /this tool's own repo/i);
});

test('index links to the sponsors-readiness-checklist SEO/AI-discovery page', () => {
  assert.match(page, /github-sponsors-readiness-checklist\.html/);
});

const docsPage = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the readiness-checklist page answers the search question with a worked table', () => {
  const html = docsPage('github-sponsors-readiness-checklist.html');
  assert.match(html, /10 signals, ranked by weight/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the readiness-checklist table matches scoring.js\'s own weights, so it cannot drift out of sync', () => {
  const html = docsPage('github-sponsors-readiness-checklist.html');
  const { CHECKS } = require('./scoring.js');
  for (const check of CHECKS) {
    assert.match(html, new RegExp(`>${check.weight}<`), `missing weight ${check.weight} for ${check.id}`);
    assert.ok(html.includes(check.label), `missing label for ${check.id}`);
  }
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /sponsor-ready\/<\/loc>/);
  assert.match(sitemap, /github-sponsors-readiness-checklist\.html/);
});

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: the same solo earner monetising published work, but
// affiliate links on a blog rather than sponsorship of a repo — and the
// disclosure obligation the other tool checks is the one this audience meets
// next. Rotating chrome may never pair the two, so link explicitly.
test('index links one hop to the affiliate-disclosure-checker sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/affiliate\-disclosure\-checker\/"/,
    'index must link ../affiliate-disclosure-checker/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /affiliate disclosure checker/i);
});

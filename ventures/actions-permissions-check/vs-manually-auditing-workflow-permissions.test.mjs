import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  scanFiles,
  classificationCounts,
  summaryLine,
  hasUnresolvedRisk,
  EXPLICIT,
  WRITE_ALL,
  UNSPECIFIED,
} from './classify.mjs';

const html = fs.readFileSync(new URL('./vs-manually-auditing-workflow-permissions.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The exact three-file worked example the page walks through. Kept here
// rather than only in the HTML so the page's claimed figures are asserted
// against classify.mjs's real output, not transcribed by hand.
const CI_YML = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint
`;

const RELEASE_YML = `name: Release
on:
  push:
    tags: ['v*']
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - run: npm publish
`;

const DEPLOY_YML = `name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - run: ./deploy.sh
`;

const WORKED_EXAMPLE = [
  { name: 'ci.yml', text: CI_YML },
  { name: 'release.yml', text: RELEASE_YML },
  { name: 'deploy.yml', text: DEPLOY_YML },
];

test('worked example: 3 files, 5 jobs, 7 findings', () => {
  const findings = scanFiles(WORKED_EXAMPLE);
  assert.equal(findings.length, 7);
  const jobFindings = findings.filter((f) => f.scope.startsWith('job:'));
  assert.equal(jobFindings.length, 5);
});

test('worked example: ci.yml has two unspecified job findings and no workflow-level finding', () => {
  const findings = scanFiles(WORKED_EXAMPLE).filter((f) => f.file === 'ci.yml');
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.classification === UNSPECIFIED));
  assert.ok(findings.every((f) => f.scope.startsWith('job:')));
});

test('worked example: release.yml is workflow-level write-all, job:build silently inherits it, job:publish narrows explicitly', () => {
  const findings = scanFiles(WORKED_EXAMPLE).filter((f) => f.file === 'release.yml');
  const workflow = findings.find((f) => f.scope === 'workflow');
  const build = findings.find((f) => f.scope === 'job:build');
  const publish = findings.find((f) => f.scope === 'job:publish');
  assert.equal(workflow.classification, WRITE_ALL);
  assert.equal(build.classification, WRITE_ALL);
  assert.match(build.detail, /inherited from the workflow-level permissions/);
  assert.equal(publish.classification, EXPLICIT);
  assert.match(publish.detail, /contents: read/);
  assert.match(publish.detail, /packages: write/);
});

test('worked example: deploy.yml workflow-level grant looks safe but job:deploy widens it', () => {
  const findings = scanFiles(WORKED_EXAMPLE).filter((f) => f.file === 'deploy.yml');
  const workflow = findings.find((f) => f.scope === 'workflow');
  const job = findings.find((f) => f.scope === 'job:deploy');
  assert.equal(workflow.classification, EXPLICIT);
  assert.equal(workflow.detail, 'contents: read');
  assert.equal(job.classification, EXPLICIT);
  assert.match(job.detail, /deployments: write/);
});

test('worked example: classificationCounts and summaryLine match the figures quoted on the page', () => {
  const findings = scanFiles(WORKED_EXAMPLE);
  const counts = classificationCounts(findings);
  assert.deepEqual(counts, { unspecified: 2, 'write-all': 2, explicit: 3 });
  assert.equal(summaryLine(findings), '4 risky findings (unspecified or write-all), 3 already explicit.');
  assert.equal(hasUnresolvedRisk(findings), true);
});

test('the page states the exact figures the worked example produces', () => {
  assert.match(html, /3 files, 5 jobs, 7 findings, 4 flagged as write-all or unspecified, 3 explicit/);
  assert.match(html, /7 findings across 3 files and 5 jobs: 4 risky findings \(unspecified or write-all\), 3 already\s*\n?\s*explicit/);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a security audit/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-manually-auditing-workflow-permissions\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-manually-auditing-workflow-permissions\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-manually-auditing-workflow-permissions\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that this checker uploads nothing and makes no network call', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /makes no network call/);
});

test('the page never claims a clean scan means the workflow is secure', () => {
  const prose = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+secure\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    assert.ok(denied, `unqualified security claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`);
  }
});

test('does not name a competing product (generic-method page, no trademark disclaimer required)', () => {
  // This page compares against a manual habit, not a named tool, so it is
  // registered in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying the "not affiliated with ..." sentence vs-openssf-scorecard.html
  // carries. Positive assertion that it stays that way: a later edit that
  // quietly names a real competing product here would need the trademark
  // disclaimer and the clauses.mjs exemption removed in the same change.
  assert.doesNotMatch(html, /not affiliated with/i);
});

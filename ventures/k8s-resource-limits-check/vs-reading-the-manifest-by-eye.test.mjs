import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { analyzeSources, summaryLine } from './engine.mjs';

const html = fs.readFileSync(new URL('./vs-reading-the-manifest-by-eye.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('names no vendor or competing product as the point of comparison', () => {
  // Compares against the generic habit of reading a manifest by eye during
  // review -- not a company or product this could be mistaken for. The
  // single cross-link to this venture's own vs-polaris.html (which does
  // name Polaris/Fairwinds and carries the trademark disclaimer) is
  // expected and does not make this page a named-product comparison
  // itself. Registered as disclaimer-exempt in clauses.mjs on that basis.
  assert.doesNotMatch(html, /kubescore|kube-score|kubent|kubeaudit|datree|kyverno|opa gatekeeper/i);
  // Excludes the "vs-polaris.html" href itself, which also matches a bare
  // /polaris/i scan -- only the visible link text is the comparison surface.
  assert.equal((html.match(/(?<!vs-)polaris(?!\.html)/gi) ?? []).length, 1, 'expected exactly one cross-link mention of Polaris, not a comparison against it');
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-reading-the-manifest-by-eye\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the worked example figures match engine.mjs against the bundled example manifest', () => {
  // Same worked example index.html's "Load worked example" button uses,
  // pinned here directly against engine.mjs so the page's claimed numbers
  // cannot drift from what the tool itself would report.
  const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: checkout-api
        resources:
          requests:
            memory: 512Mi
          limits:
            cpu: 500m
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: cache
  namespace: data
spec:
  template:
    spec:
      containers:
      - name: cache
        resources:
          requests:
            cpu: 2
            memory: 4Gi
          limits:
            cpu: 1
            memory: 4Gi
`;

  const result = analyzeSources([{ name: 'manifest.yaml', text: manifest }]);

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.workloads, ['Deployment/checkout-api', 'StatefulSet/data.cache']);
  assert.equal(result.verdict, 'at-risk');
  assert.deepEqual(result.counts, { risk: 2, warn: 3, info: 2 });
  assert.equal(summaryLine(result), '2 workloads: 2 containers left unbounded or invalid, plus 3 to review.');

  const checkoutMemoryLimit = result.findings.find(
    (f) => f.id === 'no-memory-limit' && f.resource === 'Deployment/checkout-api',
  );
  assert.ok(checkoutMemoryLimit, 'expected checkout-api to be missing a memory limit despite having a memory request');

  const cacheExceeds = result.findings.find(
    (f) => f.id === 'requests-exceed-limits' && f.resource === 'StatefulSet/data.cache',
  );
  assert.ok(cacheExceeds, 'expected cache to be flagged for a CPU request above its own CPU limit');
  assert.match(cacheExceeds.impact, /CPU request \(2\) is above the CPU limit \(1\)/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-reading-the-manifest-by-eye\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-reading-the-manifest-by-eye\.html/);
});

test('the comparison page links back to the checker and to the other comparison/guide pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="vs-polaris\.html"/);
  assert.match(html, /href="why-a-missing-resource-limit-takes-down-a-node\.html"/);
});

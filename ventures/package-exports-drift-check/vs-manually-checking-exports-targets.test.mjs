import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parsePackageJson, extractExportEntries, classifyExportEntries, normalizePath, parseFileList, diffExports, summarize } from './engine.mjs';

const html = fs.readFileSync(new URL('./vs-manually-checking-exports-targets.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing product', () => {
  // This page compares against reading the exports map by eye -- a habit
  // every package.json author already has, not a company or product this
  // could be mistaken for -- so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. The page's own first paragraph
  // says so explicitly, and this test pins that sentence.
  assert.match(html, /Names no specific product or company/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-manually-checking-exports-targets\.html">/);
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

test('the worked example matches the engine on the exact map and file listing described', () => {
  const pkg = parsePackageJson(JSON.stringify({
    name: 'widget-kit',
    exports: {
      '.': { import: './esm/index.js', require: './cjs/index.js', types: './types/index.d.ts' },
      './button': { import: './esm/button.js', require: './cjs/button.js', types: './types/button.d.ts' },
      './modal': { import: './esm/modal.js', require: './cjs/modal.js', types: './types/modal.d.ts' },
      './theme': './cjs/theme.js',
      './package.json': './package.json',
    },
  }));
  const entries = extractExportEntries(pkg.exports);
  assert.equal(entries.length, 11);
  const { literal, wildcard, external } = classifyExportEntries(entries);
  assert.equal(literal.length, 11);
  assert.equal(wildcard.length, 0);
  assert.equal(external.length, 0);

  const fileSet = parseFileList([
    'package.json', 'README.md',
    'esm/index.js', 'cjs/index.js', 'types/index.d.ts',
    'esm/button.js', 'cjs/button.js', 'types/button.d.ts',
    'esm/modal.js', 'types/modal.d.ts',
    'cjs/theme.js',
  ].join('\n'));

  const report = diffExports({ literal, fileExists: (t) => fileSet.has(normalizePath(t)) });
  assert.equal(report.matched.length, 10);
  assert.equal(report.missing.length, 1);
  assert.equal(report.missing[0].target, './cjs/modal.js');

  const { status, text } = summarize(report, { wildcardCount: 0, externalCount: 0 });
  assert.equal(status, 'missing');
  assert.match(text, /1 export target\(s\) named in package\.json do not exist/);

  assert.match(html, /cjs\/modal\.js/);
  assert.match(html, /Eleven literal targets across five subpaths/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-manually-checking-exports-targets\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-manually-checking-exports-targets\.html/);
});

test('the comparison page links back to the tool, the guide, and vs-publint', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="\.\/why-package-json-exports-fields-drift-from-what-you-actually-publish\.html"/);
  assert.match(html, /href="\.\/vs-publint\.html"/);
});

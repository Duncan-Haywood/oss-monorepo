import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-coverage-floor.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing platform in its own title or comparison', () => {
  // This page compares against a generic manual habit (a flat
  // --cov-fail-under-style coverage floor), not a named product, so it is
  // listed in platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // rather than carrying a "not affiliated" clause -- there is no company to
  // disclaim a relationship with. The "More:" footnote legitimately
  // cross-links to this venture's own vs-codecov.html sibling page, so the
  // check is scoped to the title and the h1/comparison body rather than the
  // whole document.
  assert.doesNotMatch(html, /<title>[^<]*Codecov/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Codecov/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-coverage-floor\.html">/);
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

test('the worked example matches compareCoverage/summarizeCompare on the actual reports described', async () => {
  const { compareCoverage, summarizeCompare } = await import('./compare.mjs');

  function cobertura(files) {
    let totalCovered = 0;
    let totalValid = 0;
    const classesXml = files
      .map((f) => {
        const lines = f.hits.map((h, i) => `<line number="${i + 1}" hits="${h}"/>`).join('');
        totalCovered += f.hits.filter((h) => h > 0).length;
        totalValid += f.hits.length;
        return `<class name="${f.name}" filename="${f.name}"><lines>${lines}</lines></class>`;
      })
      .join('');
    const rate = (totalCovered / totalValid).toFixed(4);
    return `<?xml version="1.0"?><coverage lines-valid="${totalValid}" lines-covered="${totalCovered}" line-rate="${rate}"><packages><package name="app"><classes>${classesXml}</classes></package></packages></coverage>`;
  }

  const authBase = Array(20).fill(1);
  const utilsBase = Array(80).fill(0).map((_, i) => (i < 72 ? 1 : 0));
  const baseline = cobertura([{ name: 'auth.py', hits: authBase }, { name: 'utils.py', hits: utilsBase }]);

  const authCur = Array(20).fill(0).map((_, i) => (i < 4 ? 1 : 0));
  const utilsCur = Array(80).fill(0).map((_, i) => (i < 77 ? 1 : 0));
  const current = cobertura([{ name: 'auth.py', hits: authCur }, { name: 'utils.py', hits: utilsCur }]);

  const result = compareCoverage(baseline, current);
  assert.equal(result.baseline.covered, 92);
  assert.equal(result.current.covered, 81);
  assert.ok(Math.abs(result.dropPct - 11) < 1e-6);

  const authFile = result.files.find((f) => f.filename === 'auth.py');
  const utilsFile = result.files.find((f) => f.filename === 'utils.py');
  assert.equal(authFile.verdict, 'dropped');
  assert.equal(authFile.currentRate, 0.2);
  assert.equal(utilsFile.verdict, 'improved');

  const summary = summarizeCompare(result);
  assert.equal(summary.status, 'dropped');
  assert.equal(summary.text, 'Line coverage dropped 11.00 points (92.00% → 81.00%), past the 0 point allowance. 1 file(s) got worse.');

  assert.match(html, /auth\.py/);
  assert.match(html, /utils\.py/);
  assert.match(html, /20\/20 lines, 100%/);
  assert.match(html, /4\/20 lines, 20%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-coverage-floor\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-coverage-floor\.html/);
});

test('the comparison page links back to the tool, the guide, and vs-codecov', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="why-did-my-pr-drop-coverage\.html"/);
  assert.match(html, /href="vs-codecov\.html"/);
});

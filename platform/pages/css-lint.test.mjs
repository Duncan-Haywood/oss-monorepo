// A length with no unit (`margin:1 auto`) is dropped by the browser without a word. These tests
// keep the shared chrome and every page in the tree free of it (css-lint.mjs says why).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unitlessLengths, styleBlocks } from './css-lint.mjs';
import { SITE_HEADER_CSS, VENTURE_CHROME_CSS, renderSiteStyle } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

test('flags a bare non-zero number on a length property', () => {
  assert.deepEqual(unitlessLengths('a{margin:1 auto}'), [{ prop: 'margin', value: '1 auto', token: '1' }]);
  assert.deepEqual(unitlessLengths('.b{padding:0;margin:1}').map((h) => h.token), ['1']);
  assert.deepEqual(unitlessLengths('a{top:-2}').map((h) => h.token), ['-2']);
  assert.deepEqual(unitlessLengths('a{width:.5 !important}').map((h) => h.token), ['.5']);
  assert.deepEqual(unitlessLengths('a{gap:4px 8}').map((h) => h.token), ['8']);
});

test('leaves zero, units, unitless properties and function arguments alone', () => {
  for (const css of [
    'a{margin:0;padding:0 auto}',
    'a{margin:4px auto;padding:1em 2rem;width:100%}',
    'a{line-height:1.4;flex:1 1 auto;font-weight:400;z-index:2;opacity:.5}',
    'a{width:calc(100% / 3);margin:var(--m, 4)}',
    'a{grid-template-columns:repeat(3,1fr)}',
    '/* margin:1 */ a{margin:0}',
    'a{--pad:4}',
  ]) assert.deepEqual(unitlessLengths(css), [], css);
});

test('reads the <style> blocks of a page', () => {
  const html = '<style>a{margin:0}</style><p style="x">t</p><style media="print">b{padding:3}</style>';
  assert.deepEqual(unitlessLengths(styleBlocks(html)).map((h) => h.token), ['3']);
});

test('the shared site chrome has no unitless lengths', () => {
  assert.deepEqual(unitlessLengths(SITE_HEADER_CSS), []);
  assert.deepEqual(unitlessLengths(VENTURE_CHROME_CSS), []);
  assert.deepEqual(unitlessLengths(renderSiteStyle()), []);
});

// Every hand-written page and stylesheet in the tree, style attributes included. Clean on
// 2026-11-11 across about 3,750 files, so any hit is new.
const SKIP = new Set(['node_modules', '.git', 'dist', '_site', 'build', 'coverage']);
function* pages(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (/\.(html|css)$/.test(e.name)) yield p;
  }
}

test('no page or stylesheet in the tree gives a length a bare number', () => {
  const bad = [];
  let seen = 0;
  for (const top of ['ventures', 'research', 'platform', 'docs', 'portfolio']) {
    for (const file of pages(path.join(REPO, top))) {
      seen++;
      const text = readFileSync(file, 'utf8');
      const css = file.endsWith('.css') ? text : styleBlocks(text);
      const attrs = file.endsWith('.html') ? [...text.matchAll(/\sstyle="([^"]*)"/g)].map((m) => `;${m[1]}`).join('\n') : '';
      for (const h of unitlessLengths(`${css}\n${attrs}`)) bad.push(`${path.relative(REPO, file)}: ${h.prop}:${h.value}`);
    }
  }
  assert.ok(seen > 1000, `only ${seen} pages found: is the walk broken?`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} unitless length(s); add px/em/% (only 0 may go bare)`);
});

// The walk above reads files on disk; the CSS that platform/pages modules write into every built
// page (rates.mjs, jobs.mjs, share.mjs ...) lives in template literals and was linted only for
// site-nav.mjs. Red team 2026-11-13: `.pf-rates{padding:8px 14px 0}` -> `14px 1` in rates.mjs
// passed every test. This scans every template literal in every module here instead.
test('no CSS a platform/pages module emits gives a length a bare number', () => {
  const bad = [];
  let literals = 0;
  for (const name of readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.includes('.test.'))) {
    const src = readFileSync(path.join(HERE, name), 'utf8');
    for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      literals++;
      const text = m[1].replace(/\$\{[^}]*\}/g, 'X');
      // A quote in the value means JavaScript string concatenation (lab.mjs builds an embed
      // snippet that way), never a CSS length.
      for (const h of unitlessLengths(text)) if (!/['"]/.test(h.value)) bad.push(`${name}: ${h.prop}:${h.value}`);
    }
  }
  assert.ok(literals > 200, `only ${literals} template literals found: is the scan broken?`);
  assert.deepEqual(bad, [], 'add px/em/% (only 0 may go bare)');
});

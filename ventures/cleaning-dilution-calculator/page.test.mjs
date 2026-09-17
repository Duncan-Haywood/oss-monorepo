import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// --------------------------------------------------------------------------
// An invalid input used to make `calculateDilution` throw, and the page
// wrote that error message straight into `#perGallon` -- the same element
// that otherwise shows the headline dollar figure in giant bold type. A
// visitor who cleared a field saw a full sentence rendered as if it were a
// price, with no error styling and no `role="alert"`, while every other
// result field went blank. Every other calculator in this repo signals a
// bad input with a dedicated, `role="alert"` error element instead of
// overwriting a result field, so this page should do the same. Pinned here
// because this page's calculation logic lives in an inline <script>, which
// no other test file reads.
// --------------------------------------------------------------------------

function readPage() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, 'index.html'), 'utf8');
}

test('index.html has a dedicated, hidden-by-default alert element for calculation errors', () => {
  const html = readPage();
  assert.match(html, /<p class="error" id="error" role="alert" hidden><\/p>/);
});

test('a calculation error is written to #error, not to a result field', () => {
  const html = readPage();
  const script = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1];
  assert.ok(script, 'expected an inline module script');
  const catchBlock = script.match(/catch\(error\)\{([^}]*)\}/)?.[1];
  assert.ok(catchBlock, 'expected a catch(error) block in the calculation handler');
  assert.match(catchBlock, /\$\('error'\)\.textContent=error\.message/);
  assert.match(catchBlock, /\$\('error'\)\.hidden=false/);
  // The headline figure must not be overwritten with the error text.
  assert.doesNotMatch(catchBlock, /\$\('perGallon'\)\.textContent=error\.message/);
});

test('a successful calculation re-hides the error element', () => {
  const html = readPage();
  const script = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1];
  const tryBlock = script.match(/function update\(count=false\)\{try\{([^]*?)\}catch\(error\)/)?.[1];
  assert.ok(tryBlock, 'expected a try block in the calculation handler');
  assert.match(tryBlock, /\$\('error'\)\.hidden=true/);
});

// Regression: sitemap.xml was missing how-much-does-diluted-cleaning-solution-cost.html,
// a real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest sibling: same cleaning subcategory, but a carpet stop rather than
// chemical cost. Without a crawlable link here, a crawler entering on the
// dilution calculator never reaches the carpet tool in one hop — same one-way
// orphan class as #3709 / #3729 / #3743.
test('index links one hop to the carpet-cleaning-bid-calculator sibling', () => {
  const html = readPage();
  assert.match(
    html,
    /href="\.\.\/carpet-cleaning-bid-calculator\/"/,
    'index must link ../carpet-cleaning-bid-calculator/ so crawlers reach the carpet calculator in one hop',
  );
});

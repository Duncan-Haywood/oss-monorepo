import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

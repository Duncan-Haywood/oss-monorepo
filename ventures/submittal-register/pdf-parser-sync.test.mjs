// pdf-parser.mjs and inflate-browser.mjs (and this test) are vendored, byte for byte, into
// four ventures. A fix to one copy (these parse untrusted uploads) must reach
// the others, so every one of the four carries this same test: whichever copy
// changes, its own suite fails until the copies agree again. A sibling that
// is absent (a fork that kept one venture) is skipped. Found by
// `dupehound --suggest-guards` (ventures/dupehound/guards/oss-monorepo.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const SIBLINGS = ['bank-statement-pdf-to-csv', 'drawing-set-index', 'pdf-accessibility-tag-check', 'submittal-register'];
const ventures = new URL('../', import.meta.url);

for (const file of ['pdf-parser.mjs', 'inflate-browser.mjs', 'pdf-parser-sync.test.mjs']) {
  test(`${file} matches every sibling venture's copy`, () => {
    const here = readFileSync(new URL(file, import.meta.url), 'utf8');
    const stale = SIBLINGS.filter((v) => existsSync(new URL(`${v}/${file}`, ventures)))
      .filter((v) => readFileSync(new URL(`${v}/${file}`, ventures), 'utf8') !== here);
    assert.deepEqual(stale, [], `${file} differs in: ${stale.join(', ')}; copy the fixed file to all four`);
  });
}

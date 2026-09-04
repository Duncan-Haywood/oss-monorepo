// The page's own wiring, as opposed to the shared modules it vendors.
//
// `proposal.test.mjs` covers `proposal.mjs`, and `platform/proposal/verify.mjs`
// drives the printed sheet in a real browser. What neither covers is the three
// things this venture had to change to adopt the proposal at all: the house
// conventions the generator detects, the language pair the scope quotes, and
// the currency the client's quote is priced in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the page keeps the conventions the proposal generator detects', () => {
  // Each of these is what `inspect()` in platform/proposal/adopt.mjs looks for.
  // Renaming one back to the spelling this page used before adoption — `$`,
  // `record`, `data` — would not break anything visible, and the next
  // `adopt.mjs translator-project-quote` would silently refuse to regenerate.
  assert.match(page, /function el\(id\)/);
  assert.match(page, /function count\(event\)/);
  assert.match(page, /function readInput\(\)/);
  assert.match(page, /calculate\(readInput\(\)\)/,
    'the generator prices the job through this exact call');
});

test('the language pair is saved with the draft but kept out of the link', () => {
  // It names the work on the printed quote and changes no figure. In `ids` it
  // would be coerced to NaN by `loadQuote`; in the share link it would be a
  // twelfth input that `share.mjs`'s allowlist does not carry, which is the
  // shape of a bug this repository has shipped before.
  assert.match(page, /const textIds = \["source_lang", "target_lang"\]/);
  assert.match(page, /function draftValues\(\)/);
  assert.match(page, /localStorage\.setItem\(storageKey, JSON\.stringify\(draftValues\(\)\)\)/);
  // The proposal panel's terms ride in the link alongside the priced inputs
  // (see the `termIds`/`termValues` note above them and
  // `platform/proposal/term-ids.test.mjs`), but the link never carries the
  // language pair -- it stays in `draftValues()` only.
  assert.match(page, /encodeInputs\(\{ \.\.\.fieldValues\(\), \.\.\.termValues\(\) \}\)/,
    'the link carries the priced inputs and the proposal terms, not the language pair');
  assert.doesNotMatch(page, /encodeInputs\(draftValues\(\)\)/);
  // Restored on load, or a refresh loses what was typed.
  assert.match(page, /for \(const id of \[\.\.\.ids, \.\.\.textIds, \.\.\.termIds\]\)/);
  assert.match(page, /\[\.\.\.ids, \.\.\.textIds\]\.forEach/);
});

test('both language fields exist and are optional', () => {
  for (const id of ['source_lang', 'target_lang']) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} must be on the page`);
  }
  // No `required`: a translator who does not want the language line on the
  // quote leaves them blank and `scopeLines` drops that line.
  assert.doesNotMatch(page, /id="source_lang"[^>]*required/);
});

test("the client's quote is priced in the currency the translator chose", () => {
  // The whole reason `money()` grew a currency parameter. Without this the
  // sheet reads "$580.00" on a quote the client pays in euros.
  assert.match(page, /currency: el\('currency'\)\?\.value\?\.trim\(\) \|\| '\$'/);
});

test('the printed quote is described where a reader and a crawler can find it', () => {
  assert.match(page, /printable client quote/,
    'the feature list is what an AI assistant reads to answer "can it do X"');
  assert.match(page, /Can I send the client a quote, not just a number\?/);
  // Google requires an FAQPage entry to be visible on the page, so the
  // question has to appear twice: once in the JSON-LD, once as a heading.
  assert.equal(
    page.split('Can I send the client a quote, not just a number?').length - 1,
    2,
    'the FAQ answer must be both marked up and on the page',
  );
});

test('the disclaimers a user-facing surface here must carry are intact', () => {
  assert.match(page, /No warranty\./);
  assert.match(page, /Best-effort hosting, no SLA\./);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

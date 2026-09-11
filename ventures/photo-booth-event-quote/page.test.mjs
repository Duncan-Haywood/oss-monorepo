import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the proposed-price checker', () => {
  assert.match(html, /recordEvent\('quote-priced'\)/);
  assert.match(html, /recordEvent\('proposed-price-checked'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>proposed-price-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable quote', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="eventHours" type="number" min="0.5" step="0.25" value="${DEFAULTS.eventHours}"`));
  assert.match(html, new RegExp(`id="costPerPrint" type="number" min="0" step="0.01" value="${DEFAULTS.costPerPrint}"`));
  assert.ok(result.profit > 0);
});

test('the proposed-price checker is hidden until a price is entered', () => {
  assert.match(html, /id="proposedResult" hidden/);
});

test('a proposed price below breakeven and a check against calc.mjs directly agree', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 100 });
  assert.ok(r.proposed.belowBreakEven);
});

test('the print-volume warning banner exists and is hidden by default', () => {
  assert.match(html, /id="printWarning" class="warn" hidden/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the quote result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateQuote[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateQuote() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// Closest sibling: same "price the gig, not just the sticker" shape for an
// independent operator, but an ongoing chair rather than a one-off event
// booking. Without a crawlable link here, a crawler entering on the photo
// booth quote calculator never reaches the booth rent vs commission
// calculator in one hop.
// Commercial photography licensing is the adjacent pricing decision for the
// same reader: a one-off event booking vs. a licensing scope. Without this
// link a crawler entering on this page never reaches that calculator.
test('index links one hop to the commercial-photo-license-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/commercial-photo-license-calculator\/"/,
    'index must link ../commercial-photo-license-calculator/ so crawlers reach the commercial photo license calculator in one hop',
  );
});

test('index links one hop to the booth-rent-vs-commission sibling', () => {
  assert.match(
    html,
    /href="\.\.\/booth-rent-vs-commission\/"/,
    'index must link ../booth-rent-vs-commission/ so crawlers reach the booth rent vs commission calculator in one hop',
  );
});


// The share link is the only thing on this page that leaves the browser, and
// three separate claims have to stay true together: the button exists, the
// restore path writes every field rather than patching the ones the link
// carried, and the page's own privacy copy says so. A page that gained the
// feature and kept the old "nothing you type is saved anywhere" wording would
// be making a claim about the visitor's data that is no longer accurate.
test('the page offers a shareable link and restores one through formValues', () => {
  assert.match(html, /id="copyLink"/);
  assert.match(html, /import \{ SHARE_FIELDS, encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /formValues\(fromLink\)/, 'a decoded link must be applied through formValues so an omitted field is cleared');
  assert.match(html, /recordEvent\('link-copied'\)/);
  assert.match(html, /<code>link-copied<\/code>/, 'the privacy copy must list every event the page records');
});

test('the privacy copy and the FAQ both disclose that the link carries the numbers', () => {
  // Visible copy and the FAQPage JSON-LD have to agree -- CLAUDE.md records a
  // merge where they diverged and the structured data described a page that
  // no longer existed.
  const disclosures = html.match(/carries your numbers inside the URL|writes your numbers into the URL itself/g) || [];
  assert.ok(disclosures.length >= 2, 'both the privacy section and the FAQ (visible + JSON-LD) must disclose the link');
  assert.doesNotMatch(
    html,
    /nothing you type is saved anywhere[^.]*\.\s*Usage counting/,
    'the old unqualified claim must not survive alongside a share link',
  );
});

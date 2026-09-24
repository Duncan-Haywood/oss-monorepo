import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTintBid, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateTintBid, naiveFlatQuote, and pricingGap from calc.mjs', () => {
  assert.match(html, /import \{ calculateTintBid, naiveFlatQuote, pricingGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for the quote, reset, and sponsor link', () => {
  assert.match(html, /count\('bid_calculated'\)/);
  assert.match(html, /count\('reset'\)/);
  assert.match(html, /count\('sponsor_link_clicked'\)/);
  assert.match(html, /<code>bid_calculated<\/code>, <code>reset<\/code>, <code>sponsor_link_clicked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable quote', () => {
  const result = calculateTintBid(DEFAULTS);
  assert.match(html, new RegExp(`id="frontDoorWindows" type="number" min="0" max="2" step="1" value="${DEFAULTS.frontDoorWindows}"`));
  assert.match(html, new RegExp(`id="installerRate" type="number" min="0" step="1" value="${DEFAULTS.installerRate}"`));
  assert.match(html, new RegExp(`id="naiveFlatRate" type="number" min="0" step="5" value="${DEFAULTS.naiveFlatRate}"`));
  assert.ok(result.finalPrice > result.directCost - result.filmCost - result.laborCost - result.boothOverhead - result.mobileFee);
  assert.ok(result.finalPrice > 0);
});

test('the rear windshield checkbox defaults to checked, matching DEFAULTS.rearWindshield = 1', () => {
  assert.equal(DEFAULTS.rearWindshield, 1);
  assert.match(html, /id="rearWindshield" type="checkbox" checked/);
});

test('the remove-old-tint checkbox defaults to unchecked, matching DEFAULTS.removeOldTint = false', () => {
  assert.equal(DEFAULTS.removeOldTint, false);
  assert.match(html, /id="removeOldTint" type="checkbox">/);
});

test('the no-warranty disclaimer is on the page, naming what this is not advice about', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /It is not legal, safety, or automotive advice/);
});

test('the disclaimer names the VLT / tint-darkness law gap explicitly', () => {
  assert.match(html, /does not check your state's window tint darkness \(VLT%\) law/);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /id="sponsorLink"/);
});

test('the privacy line says nothing is uploaded and names the counted events', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /never saved or sent anywhere/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results and shows an announced error region', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function update\(shouldCount = false\) \{[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('verdict'\)\.hidden = true/, 'the verdict is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('inputs are grouped in labelled fieldsets for accessibility', () => {
  assert.match(html, /<fieldset><legend>Windows to tint<\/legend>/);
  assert.match(html, /<fieldset><legend>Film &amp; removal<\/legend>/);
  assert.match(html, /<fieldset><legend>Labor &amp; overhead<\/legend>/);
  assert.match(html, /<fieldset><legend>Pricing<\/legend>/);
});

test('every visible input has a <label for> or is nested inside a <label>', () => {
  const ids = [...html.matchAll(/<input id="(\w+)"/g)].map(m => m[1]);
  const selectIds = [...html.matchAll(/<select id="(\w+)"/g)].map(m => m[1]);
  for (const id of [...ids, ...selectIds]) {
    const nested = new RegExp(`<label[^>]*>[^<]*<(?:input|select) id="${id}"`);
    assert.match(html, nested, `${id} has no associated <label>`);
  }
});

test('the FAQ structured data matches the visible copy', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const entry of ld.mainEntity) {
    assert.ok(visible.includes(`<h3>${entry.name}</h3>`), `structured-data question is not on the page: ${entry.name}`);
  }
});

test('the SoftwareApplication structured data is present and free', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"SoftwareApplication"[\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'SoftwareApplication');
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.offers.price, '0');
});

test('robots.txt allows crawling and points at the sitemap', () => {
  const robots = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap:/);
});

test('every page in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.html'))) {
    if (name === 'index.html') {
      assert.match(sitemap, /window-tinting-bid-calculator\/<\/loc>/);
      continue;
    }
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('no network calls anywhere on the page: no fetch/XHR/sendBeacon/WebSocket/EventSource/dynamic import', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(html, /sendBeacon/);
  assert.doesNotMatch(html, /new WebSocket/);
  assert.doesNotMatch(html, /new EventSource/);
  assert.doesNotMatch(html, /\bimport\s*\(/);
});

test('the index page names no specific commercial product or competitor, so it needs no not-affiliated clause', () => {
  assert.doesNotMatch(html, /not affiliated with/i);
});

// vs-a-flat-per-vehicle-size-price.html compares against a generic pricing
// method (a flat per-vehicle price by size class), not a named product, so
// it carries no not-affiliated clause either -- see its own test file and
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT.
test('the venture has exactly one vs-*.html comparison page, and it is the generic-method one', () => {
  const files = readdirSync(new URL('./', import.meta.url)).filter(name => name.startsWith('vs-') && name.endsWith('.html'));
  assert.deepEqual(files, ['vs-a-flat-per-vehicle-size-price.html']);
});

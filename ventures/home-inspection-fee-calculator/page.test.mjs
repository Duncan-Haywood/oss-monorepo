import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./how-to-price-a-home-inspection.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input or select on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote, weeklyIncomeGap, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, weeklyIncomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the weekly-goal calculators', () => {
  assert.match(html, /recordEvent\('quote-priced'\)/);
  assert.match(html, /recordEvent\('weekly-goal-check'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>weekly-goal-check<\/code>/);
});

test('the default job matches calc.mjs DEFAULTS and produces a positive price', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="squareFootage" type="number" min="0" step="50" value="${DEFAULTS.squareFootage}"`));
  assert.ok(result.finalPrice > 0);
});

test('the crawlspace foundation option is selected by default, matching calc.mjs DEFAULTS', () => {
  assert.match(html, /<option value="crawlspace" selected>Crawlspace<\/option>/);
  assert.equal(DEFAULTS.foundationType, 'crawlspace');
});

test('the rush-report checkbox is present and unchecked by default', () => {
  assert.match(html, /id="rushReport" type="checkbox"/);
  assert.doesNotMatch(html, /id="rushReport" type="checkbox" checked/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not legal, licensing, insurance, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line says nothing is uploaded and names what is saved', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /are saved locally on this device/);
  assert.doesNotMatch(html, /nothing you type is saved anywhere/);
});

test('the price result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateQuote[\s\S]*?catch \(e\) \{([\s\S]*?)\n {2}\}\n\}/);
  assert.ok(catchBlock, 'updateQuote() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the tool links to the pricing guide page', () => {
  assert.match(html, /href="how-to-price-a-home-inspection\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
});

test('the guide page worked example matches calc.mjs exactly', () => {
  const r = calculateQuote({
    squareFootage: 2800, stories: 2, foundationType: 'crawlspace', homeAgeYears: 45,
    roundTripMiles: 30, mileageRate: 0.7, baseHourlyRate: 95,
    rushReport: true, rushFeePct: 15,
    radon: true, radonFee: 150,
    sewerScope: true, sewerScopeFee: 175,
    termiteWdo: false, termiteWdoFee: 90,
    moldTest: false, moldTestFee: 125,
    overheadPerJob: 35, targetMarginPct: 25,
  });
  assert.equal(r.onSiteHours, 4.75);
  assert.ok(Math.abs(r.finalPrice - 1199.9166666667) < 1e-3);
  assert.match(guideHtml, /4\.75 hrs/);
  assert.match(guideHtml, /\$451\.25/);
  assert.match(guideHtml, /\$67\.69/);
  assert.match(guideHtml, /\$21\.00/);
  assert.match(guideHtml, /\$150\.00/);
  assert.match(guideHtml, /\$175\.00/);
  assert.match(guideHtml, /\$899\.94/);
  assert.match(guideHtml, /\$1,199\.92/);
  assert.match(guideHtml, /\$299\.98/);
});

test('every visible FAQ question and answer on both pages also appears in their FAQPage block', () => {
  for (const doc of [html, guideHtml]) {
    const questions = [...doc.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.ok(questions.length >= 3, `expected at least 3 visible questions, saw ${questions.length}`);
    const schema = doc.slice(doc.indexOf('"@type":"FAQPage"'));
    for (const question of questions) {
      assert.ok(schema.includes(JSON.stringify(question).slice(1, -1)), `visible question is missing from the FAQPage block: ${question}`);
    }
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('both JSON-LD blocks on the index page parse as valid JSON', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2, 'expected a SoftwareApplication block and a FAQPage block');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), `invalid JSON-LD: ${body.slice(0, 80)}...`);
  }
});

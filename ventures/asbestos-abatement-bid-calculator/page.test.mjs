import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAbatementBid, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page has a title, meta description, and robots tag', () => {
  assert.match(html, /<title>Asbestos Abatement Bid Calculator/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
});

test('the page carries SoftwareApplication and FAQPage JSON-LD', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const app = scripts.find((s) => s['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication JSON-LD is missing');
  assert.equal(app.offers.price, '0');
  const faq = scripts.find((s) => s['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD is missing');
  assert.ok(faq.mainEntity.length >= 3, 'FAQPage should carry at least 3 questions');
});

test('every FAQPage question and answer is a verbatim substring of the visible page text', () => {
  const faqScript = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/);
  assert.ok(faqScript, 'FAQPage JSON-LD script not found');
  const faq = JSON.parse(faqScript[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim in visible text: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim in visible text: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page imports the calc.mjs API surface and usage.mjs', () => {
  assert.match(html, /import \{ calculateAbatementBid, naiveFlatRateQuote, pricingGap, DEFAULTS \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ recordEvent, toggleUsage, usageAllowed \} from '\.\/usage\.mjs'/);
});

test('the page wires usage counting for the quote, reset, and the sponsor link', () => {
  assert.match(html, /count\('quote_calculated'\)/);
  assert.match(html, /count\('reset'\)/);
  assert.match(html, /count\('sponsor_link_clicked'\)/);
  assert.match(html, /<code>quote_calculated<\/code>, <code>reset<\/code>/);
  assert.match(html, /<code>share_link_copied<\/code>, <code>sponsor_link_clicked<\/code>/);
});

test('the page wires the share link: import, button, and usage counting', () => {
  assert.match(html, /import \{ encodeShare, decodeShare \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyShare"/);
  assert.match(html, /count\('share_link_copied'\)/);
});

test('every scalar, select, and checkbox input from calc.mjs has a matching id on the page', () => {
  const ids = [
    'containmentClass', 'squareFootage', 'containmentAreas', 'crewSize', 'crewHourlyRatePerWorker',
    'supervisorHourlyRate', 'airMonitoringSamples', 'airMonitoringCostPerSample', 'wasteVolumeCubicYards',
    'disposalFeePerCubicYard', 'requiresPermit', 'permitFee', 'rushJob', 'rushSurchargePercentPct',
    'targetMarginPercentPct', 'minimumJobFee', 'naiveRatePerSquareFoot',
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the default inputs on the page reproduce the DEFAULTS quote', () => {
  const q = calculateAbatementBid(DEFAULTS);
  assert.ok(Number.isFinite(q.finalPrice) && q.finalPrice > 0);
  assert.match(html, new RegExp(`id="squareFootage" type="number" min="1" step="1" value="${DEFAULTS.squareFootage}"`));
  assert.match(html, new RegExp(`id="containmentAreas" type="number" min="1" step="1" value="${DEFAULTS.containmentAreas}"`));
  assert.match(html, new RegExp(`id="crewSize" type="number" min="1" step="1" value="${DEFAULTS.crewSize}"`));
});

test('the no-warranty disclaimer and the not-an-inspection disclaimer are both on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not asbestos inspection, environmental, engineering, or legal advice/);
  assert.match(html, /not an asbestos inspection/);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the privacy section names all three stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /never saved or sent anywhere/);
});

test('an opt-out control (id="optout") calling toggleUsage is present', () => {
  assert.match(html, /id="optout" type="button"/);
  assert.match(html, /toggleUsage\(false\)/);
});

test('the results panel announces recalculation to screen readers', () => {
  assert.match(html, /<section id="results" class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/\} catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('verdict'\)\.hidden = true/, 'the verdict hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every input and select carries a visible <label> for accessibility', () => {
  const ids = [
    'squareFootage', 'containmentAreas', 'crewSize', 'crewHourlyRatePerWorker', 'supervisorHourlyRate',
    'airMonitoringSamples', 'airMonitoringCostPerSample', 'wasteVolumeCubicYards', 'disposalFeePerCubicYard',
    'permitFee', 'rushSurchargePercentPct', 'targetMarginPercentPct', 'minimumJobFee',
    'naiveRatePerSquareFoot', 'containmentClass',
  ];
  for (const id of ids) {
    const re = new RegExp(`<label[^>]*>[^<]*<(?:input|select) id="${id}"`);
    assert.match(html, re, `${id} does not sit inside a <label> with visible text`);
  }
  for (const id of ['requiresPermit', 'rushJob']) {
    const re = new RegExp(`<label class="checkboxLabel"><input id="${id}"`);
    assert.match(html, re, `${id} checkbox does not sit inside a labelled wrapper`);
  }
});

// Reciprocal of the assertion in ventures/popcorn-ceiling-bid-calculator/page.test.mjs.
// That page's asbestos-test checkbox says a positive result means abatement is a
// separately licensed activity it does not price -- this link is the one-hop
// path a crawler (or a contractor) needs to reach the tool that does.
test('the calculator links one hop to its popcorn-ceiling-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/popcorn-ceiling-bid-calculator\/"/,
    'index must link ../popcorn-ceiling-bid-calculator/ so crawlers reach it in one hop',
  );
});

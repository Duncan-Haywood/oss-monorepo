import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSurveyBid, pricingGap, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the page has a title, meta description, and robots tag', () => {
  assert.match(html, /<title>Land Survey Bid Calculator/);
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
  assert.match(html, /import \{ calculateSurveyBid, naivePerAcreQuote, pricingGap, DEFAULTS \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ recordEvent, toggleUsage, usageAllowed \} from '\.\/usage\.mjs'/);
});

test('the page wires usage counting for the quote, reset, and the sponsor link', () => {
  assert.match(html, /count\('quote_calculated'\)/);
  assert.match(html, /count\('reset'\)/);
  assert.match(html, /count\('sponsor_link_clicked'\)/);
  assert.match(html, /<code>quote_calculated<\/code>, <code>reset<\/code>, <code>sponsor_link_clicked<\/code>/);
});

test('every scalar and select input from calc.mjs has a matching id on the page', () => {
  const ids = [
    'parcelAcres', 'cornersToLocate', 'cornersToSet', 'terrain', 'recordResearchHours',
    'crewSize', 'crewHourlyRatePerPerson', 'officeHourlyRate', 'draftingHourlyRate',
    'draftingBaseHours', 'draftingMinutesPerCorner', 'travelMilesRoundTrip', 'averageSpeedMph',
    'minimumTravelHours', 'mileageRatePerMile', 'rushJob', 'rushSurchargePercentPct',
    'targetMarginPercentPct', 'minimumJobFee', 'naivePerAcreRate',
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the default inputs on the page reproduce the DEFAULTS quote', () => {
  const q = calculateSurveyBid(DEFAULTS);
  assert.ok(Number.isFinite(q.finalPrice) && q.finalPrice > 0);
  assert.match(html, new RegExp(`id="parcelAcres" type="number" min="0.01" step="any" value="${DEFAULTS.parcelAcres}"`));
  assert.match(html, new RegExp(`id="cornersToLocate" type="number" min="0" step="1" value="${DEFAULTS.cornersToLocate}"`));
  assert.match(html, new RegExp(`id="cornersToSet" type="number" min="0" step="1" value="${DEFAULTS.cornersToSet}"`));
  assert.match(html, new RegExp(`id="crewSize" type="number" min="1" step="1" value="${DEFAULTS.crewSize}"`));
});

test('the no-warranty disclaimer and the not-a-legal-determination disclaimer are both on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not surveying, engineering, or legal advice/);
  assert.match(html, /not a legal boundary determination/);
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

// The reciprocal of the assertion in
// ventures/drone-mapping-job-calculator/page.test.mjs. Both tools price a
// "survey" -- one on the ground with a physical crew, one from the air -- and
// the reciprocal link is what keeps this venture off the crawlable-orphan
// list on its first commit rather than as a spell to close later.
test('the calculator links one hop to its drone-mapping-job-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/drone-mapping-job-calculator\/"/,
    'index must link ../drone-mapping-job-calculator/ so crawlers reach it in one hop',
  );
});

// The comparison page is this venture's organic-discovery surface for the
// "typical per-acre survey rate" / "how far off is a per-acre quote" query --
// guide-coverage.mjs flagged this venture as the one live surface with no
// secondary page beside its entry page.
test('index links to the vs-flat-per-acre-rate comparison page', () => {
  assert.match(html, /href="\.\/vs-flat-per-acre-rate\.html"/);
});

test('the comparison page links back to the calculator and its FAQPage JSON-LD matches the visible text', () => {
  const vs = page('vs-flat-per-acre-rate.html');
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vs.replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&minus;/g, '−');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test('the comparison page carries the disclaimers and names no specific product', () => {
  const vs = page('vs-flat-per-acre-rate.html');
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  assert.match(vs, /names no specific product/i);
});

test('the comparison page does not repeat a question the index page already answers', () => {
  const faqOf = (name) => {
    const src = page(name);
    const block = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b['@type'] === 'FAQPage');
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const overlap = [...faqOf('vs-flat-per-acre-rate.html')].filter((q) => faqOf('index.html').has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(', ')}`);
});

// The two worked examples in the table are the page's whole argument, so they
// are pinned to calc.mjs's own output rather than typed independently -- if
// the pricing model ever changes, this fails instead of the page quietly
// going wrong while it keeps citing round numbers.
test('the comparison page\'s worked examples match calc.mjs output exactly', () => {
  const vs = page('vs-flat-per-acre-rate.html');
  const small = pricingGap({
    parcelAcres: 2, cornersToLocate: 1, cornersToSet: 3, terrain: 'heavy',
    recordResearchHours: 6, crewSize: 2, crewHourlyRatePerPerson: 45,
    officeHourlyRate: 85, draftingHourlyRate: 55, draftingBaseHours: 2,
    draftingMinutesPerCorner: 20, travelMilesRoundTrip: 40, averageSpeedMph: 40,
    minimumTravelHours: 0.5, mileageRatePerMile: 0.67, rushJob: false,
    rushSurchargePercent: 0.25, targetMarginPercent: 0.35, minimumJobFee: 850,
    naivePerAcreRate: 120,
  });
  const large = pricingGap({
    parcelAcres: 20, cornersToLocate: 4, cornersToSet: 0, terrain: 'open',
    recordResearchHours: 1, crewSize: 2, crewHourlyRatePerPerson: 45,
    officeHourlyRate: 85, draftingHourlyRate: 55, draftingBaseHours: 2,
    draftingMinutesPerCorner: 20, travelMilesRoundTrip: 40, averageSpeedMph: 40,
    minimumTravelHours: 0.5, mileageRatePerMile: 0.67, rushJob: false,
    rushSurchargePercent: 0.25, targetMarginPercent: 0.35, minimumJobFee: 850,
    naivePerAcreRate: 120,
  });
  assert.ok(small.underpriced, 'the small/tricky example should be underpriced by the naive rate');
  assert.equal(Math.round(small.finalPrice), 2211);
  assert.equal(small.naiveQuote, 240);
  assert.equal(Math.round(small.percentGap * 100), 821);
  assert.match(vs, /\$2,211/);
  assert.match(vs, /\$240/);
  assert.match(vs, /821%/);

  assert.ok(!large.underpriced, 'the large/clean example should be overpriced by the naive rate');
  assert.equal(Math.round(large.finalPrice), 850);
  assert.equal(large.naiveQuote, 2400);
  assert.equal(Math.round(large.percentGap * 100), -65);
  assert.match(vs, /\$850/);
  assert.match(vs, /\$2,400/);
  assert.match(vs, /65% overpriced/);
});

test('every input and select carries a visible <label> for accessibility', () => {
  const ids = [
    'parcelAcres', 'cornersToLocate', 'cornersToSet', 'terrain', 'recordResearchHours',
    'crewSize', 'crewHourlyRatePerPerson', 'officeHourlyRate', 'draftingHourlyRate',
    'draftingBaseHours', 'draftingMinutesPerCorner', 'travelMilesRoundTrip', 'averageSpeedMph',
    'minimumTravelHours', 'mileageRatePerMile', 'rushJob', 'rushSurchargePercentPct',
    'targetMarginPercentPct', 'minimumJobFee', 'naivePerAcreRate', 'surveyType',
  ];
  for (const id of ids) {
    const re = new RegExp(`<label[^>]*>[^<]*<(?:input|select) id="${id}"`);
    assert.match(html, re, `${id} does not sit inside a <label> with visible text`);
  }
});

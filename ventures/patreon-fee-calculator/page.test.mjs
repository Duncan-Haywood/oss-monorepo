import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, planComparison, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./why-your-1-dollar-tier-pays-you-less-than-you-think.html', import.meta.url), 'utf8');

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, planComparison, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, planComparison, PLANS, PLAN_KEYS, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the month and plan-comparison calculators', () => {
  assert.match(html, /recordEvent\('month-priced'\)/);
  assert.match(html, /recordEvent\('plan-compared'\)/);
  assert.match(html, /<code>month-priced<\/code>, <code>plan-compared<\/code>/);
});

test('the default inputs match calc.mjs DEFAULTS and produce a positive take-home', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="tier1Patrons" type="number" min="0" step="1" value="${DEFAULTS.tier1Patrons}"`));
  assert.ok(result.takeHome > 0);
});

test('a plan comparison computed from the page defaults matches planComparison directly', () => {
  const c = planComparison(DEFAULTS);
  assert.equal(c.currentPlan, 'standard');
  assert.equal(c.lossIfMovedToStandard, 0);
  close(c.byPlan.legacyLite.takeHome, 470.925);
});

test('the no-warranty disclaimer is on the page, including the Patreon-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not a payout tracker, a payout-timing estimator/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types and says nothing is ever uploaded', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /<code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page ships a save-and-share draft feature', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="draftStatus"/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /applyInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
  assert.match(body, /applyInputs\(DEFAULT_INPUTS\)/, 'Reset to defaults must restore the page\'s own shipped values');
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function update[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('payout'\)\.hidden = true/, 'the payout hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the tool links to the micropayment-threshold guide page', () => {
  assert.match(html, /href="why-your-1-dollar-tier-pays-you-less-than-you-think\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This (tool|page)/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly for the $3.00 vs $3.01 cliff', () => {
  const atThreshold = calculate({ tier1Patrons: 1, tier1Amount: 3, tier2Patrons: 0, tier2Amount: 0, tier3Patrons: 0, tier3Amount: 0, otherMonthlyIncome: 0, plan: 'standard' });
  const justAbove = calculate({ tier1Patrons: 1, tier1Amount: 3.01, tier2Patrons: 0, tier2Amount: 0, tier3Patrons: 0, tier3Amount: 0, otherMonthlyIncome: 0, plan: 'standard' });
  close(atThreshold.processingFee, 0.25);
  close(justAbove.processingFee, 0.38729);
  assert.ok(justAbove.takeHome < atThreshold.takeHome);
  assert.match(guideHtml, /\$0\.25/);
  assert.match(guideHtml, /\$0\.38729/);
});

test('every visible FAQ question and answer on the guide page also appears in its FAQPage block', () => {
  const questions = [...guideHtml.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.ok(questions.length >= 4, `expected at least 4 visible questions, saw ${questions.length}`);
  const schema = guideHtml.slice(guideHtml.indexOf('"@type":"FAQPage"'));
  for (const question of questions) {
    assert.ok(schema.includes(JSON.stringify(question).slice(1, -1)), `visible question is missing from the FAQPage block: ${question}`);
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

// Closest creator-economy / platform-revenue-split siblings, per
// platform/pages/build.mjs's `marketplace` category grouping. Related-tool
// chrome rotates inside the subcategory, so without an explicit one-hop a
// crawler on this page may never land on either tool.
test('index links one hop to the twitch-payout-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/twitch-payout-calculator\/"/,
    'index must link ../twitch-payout-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /Twitch payout calculator/i);
});

test('index links one hop to the podcast-sponsorship-rate-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/podcast-sponsorship-rate-calculator\/"/,
    'index must link ../podcast-sponsorship-rate-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /podcast sponsorship rate calculator/i);
});

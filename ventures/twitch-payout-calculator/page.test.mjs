import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, payoutGap, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./does-a-mobile-subscription-pay-me-less.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, payoutGap, plusPlan, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, payoutGap, plusPlan, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the month and gap calculators', () => {
  assert.match(html, /recordEvent\('month-priced'\)/);
  assert.match(html, /recordEvent\('gap-checked'\)/);
  assert.match(html, /<code>month-priced<\/code>, <code>gap-checked<\/code>/);
});

test('the default inputs match calc.mjs DEFAULTS and produce a positive payout', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="tier1Subs" type="number" min="0" step="1" value="${DEFAULTS.tier1Subs}"`));
  assert.ok(result.totalPayout > 0);
});

test('a payout gap computed from the page defaults matches payoutGap directly', () => {
  const result = calculate(DEFAULTS);
  const gap = payoutGap(DEFAULTS.targetMonthlyPayout, result.totalPayout, result.tier1PayoutPerSub);
  assert.equal(gap.meetsTarget, false);
  assert.equal(gap.additionalTier1SubsNeeded, 405);
});

test('the no-warranty disclaimer is on the page, including the Twitch-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not an ad-revenue estimator, a payout tracker/);
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

test('the tool links to the mobile-payout guide page', () => {
  assert.match(html, /href="does-a-mobile-subscription-pay-me-less\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This (tool|page)/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly for a 50% split Tier 1 sub', () => {
  const r = calculate({ ...DEFAULTS, tier1Subs: 1, tier2Subs: 0, tier3Subs: 0, bitsCheered: 0, otherMonthlyIncome: 0 });
  assert.match(guideHtml, /\$2\.995|\$2\.99\b/);
  close(r.subPayout, 2.995);
});

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

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

// Closest creator-economy siblings, per platform/pages/build.mjs's
// `solo-earner` category grouping. Related-tool chrome rotates inside the
// subcategory, so without an explicit one-hop a crawler on this page may
// never land on either tool.
test('index links one hop to the podcast-sponsorship-rate-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/podcast-sponsorship-rate-calculator\/"/,
    'index must link ../podcast-sponsorship-rate-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /podcast sponsorship rate calculator/i);
});

test('index links one hop to the brand-deal-rate-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/brand-deal-rate-calculator\/"/,
    'index must link ../brand-deal-rate-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /brand deal rate calculator/i);
});

// patreon-fee-calculator ships in the same PR with no inbound sibling link of
// its own -- this outbound link from an already-linked tool is what keeps it
// off platform/pages/siblings.mjs's orphan list from its first commit, per
// siblings-budget.json's own "shipped with an inbound sibling link from its
// first commit" pattern.
test('index links one hop to the patreon-fee-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/patreon-fee-calculator\/"/,
    'index must link ../patreon-fee-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /patreon fee calculator/i);
});

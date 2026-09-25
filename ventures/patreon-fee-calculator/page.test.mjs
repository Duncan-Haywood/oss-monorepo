import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, payoutGap, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./does-per-creation-billing-cost-more-in-fees.html', import.meta.url), 'utf8');
const vsHtml = readFileSync(new URL('./vs-doing-the-math-yourself.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input or select on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} field is missing from the page`);
  }
});

test('the page imports calculate, payoutGap, DEFAULTS, and the presets from calc.mjs', () => {
  assert.match(html, /import \{ calculate, payoutGap, DEFAULTS, PLAN_PRESETS, BILLING_PRESETS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the month and gap calculators', () => {
  assert.match(html, /recordEvent\('month-priced'\)/);
  assert.match(html, /recordEvent\('gap-checked'\)/);
  assert.match(html, /<code>month-priced<\/code>, <code>gap-checked<\/code>/);
});

test('the default inputs match calc.mjs DEFAULTS and produce a positive payout', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="tier1Patrons" type="number" min="0" step="1" value="${DEFAULTS.tier1Patrons}"`));
  assert.match(html, new RegExp(`id="tier1Pledge" type="number" min="0" step="0.01" value="${DEFAULTS.tier1Pledge}"`));
  assert.ok(result.netPayout > 0);
});

test('a payout gap computed from the page defaults matches payoutGap directly', () => {
  const result = calculate(DEFAULTS);
  const gap = payoutGap(DEFAULTS.targetMonthlyPayout, result.netPayout, result.tier1NetPerPatron);
  assert.equal(gap.meetsTarget, false);
  assert.equal(gap.additionalTier1PatronsNeeded, Math.ceil(gap.gap / result.tier1NetPerPatron));
});

test('the no-warranty disclaimer is on the page, including the Patreon-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not a payout tracker/);
});

test('the page states it is not affiliated with Patreon', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Patreon/i);
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

test('planTier and billingFrequency selects are populated from the calculator\'s own presets, not a restated option list', () => {
  assert.match(html, /fillSelect\('planTier', PLAN_PRESETS\)/);
  assert.match(html, /fillSelect\('billingFrequency', BILLING_PRESETS\)/);
  assert.doesNotMatch(html, /<option value="lite">/, 'plan options must be written by fillSelect at runtime, not hand-authored in the markup');
});

test('the tool links to the per-creation-billing guide page', () => {
  assert.match(html, /href="does-per-creation-billing-cost-more-in-fees\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This (tool|page)/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
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

// Closest sibling by mechanism (platform fee + per-charge processing fee
// deducted from a creator's payout, then a gap-to-target check), even though
// build.mjs's slug-based category rules file the two under different
// categories. See platform/pages/siblings-budget.json and the reciprocal
// link + test added to twitch-payout-calculator in this same change.
test('index links one hop to the twitch-payout-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/twitch-payout-calculator\/"/,
    'index must link ../twitch-payout-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /twitch payout calculator/i);
});

test('index links one hop to the brand-deal-rate-calculator and newsletter-sponsorship-rate-calculator siblings', () => {
  assert.match(html, /href="\.\.\/brand-deal-rate-calculator\/"/);
  assert.match(html, /href="\.\.\/newsletter-sponsorship-rate-calculator\/"/);
});

test('the tool links to the doing-the-math-yourself generic-method comparison page', () => {
  assert.match(html, /href="vs-doing-the-math-yourself\.html"/);
});

test('the generic-method comparison page links back to the calculator and carries the required clauses', () => {
  assert.match(vsHtml, /<a href="\.\/">/);
  assert.match(vsHtml, /No warranty\.<\/strong> This (tool|page)/);
  assert.match(vsHtml, /not tax, financial, or business advice/);
  assert.match(vsHtml, /not affiliated with, endorsed by, or sponsored by Patreon/i);
});

test('the comparison page\'s worked numbers reproduce from calc.mjs DEFAULTS, not invented figures', () => {
  const money = (v) => `\\$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const result = calculate(DEFAULTS);
  const naiveNetPayout = result.grossRevenue - result.platformFee;
  const overestimate = naiveNetPayout - result.netPayout;
  const fixedFeeTotal = result.totalCharges * 0.30;
  assert.equal(result.grossRevenue, 1400);
  assert.equal(result.totalCharges, 330);
  assert.match(vsHtml, new RegExp(money(naiveNetPayout)));
  assert.match(vsHtml, new RegExp(money(result.netPayout)));
  assert.match(vsHtml, new RegExp(money(overestimate)));
  assert.match(vsHtml, new RegExp(money(fixedFeeTotal)));
});

test('every visible FAQ question and answer on the comparison page also appears in its FAQPage block', () => {
  const questions = [...vsHtml.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.ok(questions.length >= 4, `expected at least 4 visible questions, saw ${questions.length}`);
  const schema = vsHtml.slice(vsHtml.indexOf('"@type":"FAQPage"'));
  for (const question of questions) {
    assert.ok(schema.includes(JSON.stringify(question).slice(1, -1)), `visible question is missing from the FAQPage block: ${question}`);
  }
});

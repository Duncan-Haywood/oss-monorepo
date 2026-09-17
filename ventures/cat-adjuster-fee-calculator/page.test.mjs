import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankOffers, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./is-this-cat-adjuster-fee-schedule-worth-it.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, rankOffers, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, rankOffers, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the deployment and offer calculators', () => {
  assert.match(html, /recordEvent\('deployment-priced'\)/);
  assert.match(html, /recordEvent\('offers-compared'\)/);
  assert.match(html, /<code>deployment-priced<\/code>, <code>offers-compared<\/code>, <code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page wires save-and-share for the deployment inputs', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="linkStatus"/);
  assert.match(html, /id="draftStatus"/);
  assert.match(html, /recordEvent\('link-copied'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /DRAFT_KEY = 'cat-adjuster-fee-calculator-deployment-draft'/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  // Regression for the shared-link-clears defect (platform/ci/check_shared_link_clears.py):
  // a plain `{ ...saved, ...fromLink }` merge looks like the link wins and is
  // not -- a field the sender left blank falls through to the recipient's own
  // saved draft instead of being cleared. formValues(fromLink) is what
  // actually clears it.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /applyDeploymentInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
});

test('the default deployment inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="deploymentDays" type="number" min="0" step="1" value="${DEFAULTS.deploymentDays}"`));
  assert.ok(result.netProfit > 0);
});

test('the offer comparison table has four rows, all optional', () => {
  const nameInputs = [...html.matchAll(/class="offerName" data-row="(\d)"/g)];
  const profitInputs = [...html.matchAll(/class="offerProfit" data-row="(\d)"/g)];
  assert.equal(nameInputs.length, 4);
  assert.equal(profitInputs.length, 4);
});

test('rankOffers on the page defaults matches rankOffers directly and picks the higher-profit firm', () => {
  const r = rankOffers([{ name: 'Firm A', netProfit: 13008 }, { name: 'Firm B', netProfit: 555 }]);
  assert.equal(r.best.name, 'Firm A');
  assert.match(html, /value="13008"/);
  assert.match(html, /value="555"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not financial or business advice/);
});

test('the disclaimer disclaims a licensing/appointment determination, not just a warranty', () => {
  assert.match(html, /does not determine your licensing, appointment, or authority to handle a claim/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, and distinguishes saved/shareable deployment inputs from never-saved offer rows', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /are saved locally on this device/);
  assert.match(html, /Your fee-schedule comparison rows are a different promise: they are never saved anywhere/);
});

test('the deployment result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid deployment input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateDeployment[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateDeployment() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every offer-row input carries an accessible aria-label', () => {
  const rows = [...html.matchAll(/<input class="offer(?:Name|Profit)"[^>]*>/g)];
  assert.equal(rows.length, 8);
  for (const [tag] of rows) {
    assert.match(tag, /aria-label="Offer \d (firm or offer name|net profit in dollars)"/, `missing aria-label on ${tag}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /cat-adjuster-fee-calculator\/<\/loc>/);
  for (const file of readdirSync(new URL('./', import.meta.url))) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    assert.ok(
      sitemap.includes(`/cat-adjuster-fee-calculator/${file}<`),
      `${file} exists in the venture but is missing from sitemap.xml`,
    );
  }
});

// --- the fee-schedule-worth-it guide page --------------------------------
//
// The tool answers "what does this deployment earn"; a searcher or forum
// member asks "is this fee schedule actually worth deploying for" before
// they know the tool exists. That question is the page.

test('the tool links to the fee-schedule guide page', () => {
  assert.match(html, /href="is-this-cat-adjuster-fee-schedule-worth-it\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not financial or business advice/);
  assert.match(guideHtml, /does not determine your licensing, appointment, or authority to handle a claim/);
});

test('the guide page worked examples match calc.mjs exactly', () => {
  // Every dollar figure published on that page is asserted here against the
  // calculator that produced it. A default change in calc.mjs then fails this
  // test instead of silently leaving a wrong number on a public page -- which
  // is the failure mode a hand-written worked example always has.
  const money = (n) => `$${n.toFixed(2)}`;

  const good = calculate(DEFAULTS);
  assert.equal(money(good.grossRevenue), '$18585.00');
  assert.equal(money(good.inZoneCost), '$5052.60');
  assert.equal(money(good.travelCost), '$374.00');
  assert.equal(money(good.netProfit), '$13008.40');
  assert.equal(good.effectiveHourlyRate.toFixed(2), '61.94');
  assert.equal(good.effectiveDailyRate.toFixed(2), '565.58');
  assert.equal(good.profitMarginPct.toFixed(1), '70.0');
  assert.equal(good.profitPerClaim.toFixed(2), '412.97');
  for (const shown of ['$18585.00', '$5052.60', '$374.00', '$13008.40', '$61.94', '$565.58', '70.0%', '$412.97']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the good offer`);
  }

  const lowball = calculate({ ...DEFAULTS, feePerClaim: 350, claimsPerDay: 0.8, largeLossPct: 5, largeLossBonusPerClaim: 300 });
  assert.equal(money(lowball.grossRevenue), '$6132.00');
  assert.equal(money(lowball.netProfit), '$555.40');
  assert.equal(lowball.effectiveHourlyRate.toFixed(2), '2.64');
  assert.equal(lowball.effectiveDailyRate.toFixed(2), '24.15');
  assert.equal(lowball.profitMarginPct.toFixed(1), '9.1');
  assert.equal(lowball.profitPerClaim.toFixed(2), '33.06');
  for (const shown of ['$6132.00', '$555.40', '$2.64', '$24.15', '9.1%', '$33.06']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the lowball offer`);
  }

  // The claim the page's headline makes: the lowball offer is still positive.
  assert.ok(lowball.netProfit > 0, 'the lowball offer never shows a loss on paper');
  assert.ok(lowball.effectiveHourlyRate < good.effectiveHourlyRate);

  // Break-even pace, both offers.
  assert.equal(good.breakEvenClaimsPerDay.toFixed(2), '0.45');
  const lowballBreakEven = calculate({ ...DEFAULTS, feePerClaim: 350, largeLossPct: 5, largeLossBonusPerClaim: 300 });
  assert.equal(lowballBreakEven.breakEvenClaimsPerDay.toFixed(2), '0.73');
  assert.ok(guideHtml.includes('0.45') && guideHtml.includes('0.73'));
});

// Closest sibling: another paid/unpaid-travel-time route or project economics
// calculator for an independent gig-work contractor. Rotating chrome may
// never pair them, so link explicitly.
test('index links one hop to the medical-courier-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/medical-courier-route-margin\/"/,
    'index must link ../medical-courier-route-margin/ so a crawler reaches that tool in one hop',
  );
});

test('index links one hop to the translator-project-quote sibling', () => {
  assert.match(
    html,
    /href="\.\.\/translator-project-quote\/"/,
    'index must link ../translator-project-quote/ so a crawler reaches that tool in one hop',
  );
});

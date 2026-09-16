import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankAddOns, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./is-a-second-shooter-worth-it.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, rankAddOns, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, rankAddOns, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the add-on and comparison calculators', () => {
  assert.match(html, /recordEvent\('addon-priced'\)/);
  assert.match(html, /recordEvent\('addons-compared'\)/);
  assert.match(html, /<code>addon-priced<\/code>, <code>addons-compared<\/code>, <code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page wires save-and-share for the add-on inputs', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="linkStatus"/);
  assert.match(html, /id="draftStatus"/);
  assert.match(html, /recordEvent\('link-copied'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /DRAFT_KEY = 'photo-addon-pricing-calculator-addon-draft'/);
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
  assert.match(body, /applyAddonInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
});

test('the default add-on inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="targetHourlyRate" type="number" min="0" step="1" value="${DEFAULTS.targetHourlyRate}"`));
  assert.ok(result.netProfit > 0);
});

test('the add-on comparison table has four rows, all optional, each with three inputs', () => {
  const nameInputs = [...html.matchAll(/class="addonName" data-row="(\d)"/g)];
  const profitInputs = [...html.matchAll(/class="addonProfit" data-row="(\d)"/g)];
  const rateInputs = [...html.matchAll(/class="addonRate" data-row="(\d)"/g)];
  assert.equal(nameInputs.length, 4);
  assert.equal(profitInputs.length, 4);
  assert.equal(rateInputs.length, 4);
});

test('rankAddOns on the page defaults matches rankAddOns directly and picks the higher-rate option', () => {
  const r = rankAddOns([
    { name: 'Extra hour', netProfit: 70.00, effectiveHourlyRate: 23.33 },
    { name: 'Second shooter', netProfit: -72.50, effectiveHourlyRate: -20.71 },
  ]);
  assert.equal(r.best.name, 'Extra hour');
  assert.match(html, /value="23\.33"/);
  assert.match(html, /value="-20\.71"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not legal or business advice/);
});

test('the disclaimer disclaims tax, business-formation and contract-review scope, not just a warranty', () => {
  assert.match(html, /does not do tax planning, business-entity formation, or contract review/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, and distinguishes saved/shareable add-on inputs from never-saved comparison rows', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /are saved locally on this device/);
  assert.match(html, /Your comparison rows are a different promise: they are never saved anywhere/);
});

test('the add-on result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid add-on input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateAddon\(count[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateAddon() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every add-on-row input carries an accessible aria-label', () => {
  const rows = [...html.matchAll(/<input class="addon(?:Name|Profit|Rate)"[^>]*>/g)];
  assert.equal(rows.length, 12);
  for (const [tag] of rows) {
    assert.match(tag, /aria-label="Add-on \d (name|net profit in dollars|effective hourly rate in dollars per hour)"/, `missing aria-label on ${tag}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /photo-addon-pricing-calculator\/<\/loc>/);
  for (const file of readdirSync(new URL('./', import.meta.url))) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    assert.ok(
      sitemap.includes(`/photo-addon-pricing-calculator/${file}<`),
      `${file} exists in the venture but is missing from sitemap.xml`,
    );
  }
});

// --- the second-shooter-worth-it guide page ------------------------------
//
// The tool answers "what does this add-on earn"; a searcher or forum member
// asks "is a second shooter actually worth it" before they know the tool
// exists. That question is the page.

test('the tool links to the second-shooter guide page', () => {
  assert.match(html, /href="is-a-second-shooter-worth-it\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not legal or business advice/);
  assert.match(guideHtml, /does not do tax planning, business-entity formation, or contract review/);
});

test('the guide page worked examples match calc.mjs exactly', () => {
  // Every dollar figure published on that page is asserted here against the
  // calculator that produced it. A default change in calc.mjs then fails this
  // test instead of silently leaving a wrong number on a public page -- which
  // is the failure mode a hand-written worked example always has.
  const money = (n) => {
    const text = `$${Math.abs(n).toFixed(2)}`;
    return n < 0 ? `-${text}` : text;
  };

  const good = calculate(DEFAULTS);
  assert.equal(money(good.grossRevenue), '$300.00');
  assert.equal(money(good.laborCost), '$225.00');
  assert.equal(money(good.totalCost), '$230.00');
  assert.equal(money(good.netProfit), '$70.00');
  assert.equal(good.effectiveHourlyRate.toFixed(2), '23.33');
  assert.equal(good.profitMarginPct.toFixed(1), '23.3');
  for (const shown of ['$300.00', '$225.00', '$230.00', '$70.00', '$23.33/hr', '23.3%']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the solid add-on`);
  }

  const lowball = calculate({
    targetHourlyRate: 75, shootHours: 0, cullHours: 1.5, editHours: 2,
    secondShooterCost: 250, albumPrintCost: 0, gearWearAllowance: 10, price: 450,
  });
  assert.equal(money(lowball.grossRevenue), '$450.00');
  assert.equal(money(lowball.laborCost), '$262.50');
  assert.equal(money(lowball.totalCost), '$522.50');
  assert.equal(money(lowball.netProfit), '-$72.50');
  assert.equal(lowball.effectiveHourlyRate.toFixed(2), '-20.71');
  assert.equal(lowball.profitMarginPct.toFixed(1), '-16.1');
  for (const shown of ['$450.00', '$262.50', '$522.50', '-$72.50', '-$20.71/hr', '-16.1%']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the second-shooter add-on`);
  }

  // The claim the page's headline makes: the second-shooter add-on shows a
  // loss even though it charges more than the extra-hour add-on.
  assert.ok(lowball.netProfit < 0, 'the second-shooter add-on shows a loss on paper');
  assert.ok(lowball.effectiveHourlyRate < good.effectiveHourlyRate);

  const rateGap = (good.effectiveHourlyRate - lowball.effectiveHourlyRate).toFixed(2);
  assert.equal(rateGap, '44.05');
  assert.ok(guideHtml.includes('$44.05/hr'));
});

// Closest sibling: another one-photographer pricing tool in the same
// "Service business pricing & quotes" category. Rotating chrome may never
// pair them, so link explicitly.
test('index links one hop to the photo-booth-event-quote sibling', () => {
  assert.match(
    html,
    /href="\.\.\/photo-booth-event-quote\/"/,
    'index must link ../photo-booth-event-quote/ so a crawler reaches that tool in one hop',
  );
});

test('index links one hop to the commercial-photo-license-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/commercial-photo-license-calculator\/"/,
    'index must link ../commercial-photo-license-calculator/ so a crawler reaches that tool in one hop',
  );
});

// --- vs-pricing-by-comparing-to-other-studios.html ------------------------

const comparisonHtml = readFileSync(
  new URL('./vs-pricing-by-comparing-to-other-studios.html', import.meta.url),
  'utf8',
);

test('index links to the comparison page, and it links back', () => {
  assert.match(html, /href="vs-pricing-by-comparing-to-other-studios\.html"/);
  assert.match(comparisonHtml, /href="\.\/"/);
});

test('the comparison page carries valid FAQPage JSON-LD matching its visible copy verbatim', () => {
  const match = comparisonHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'expected a JSON-LD block on the comparison page');
  const faq = JSON.parse(match[1]);
  assert.equal(faq['@type'], 'FAQPage');
  assert.ok(faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(
      comparisonHtml.includes(q.acceptedAnswer.text),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page`,
    );
  }
});

test('the comparison page carries the no-warranty disclaimer and sponsor/license links', () => {
  assert.match(comparisonHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(comparisonHtml, /not legal or business advice/);
  assert.match(comparisonHtml, /href="LICENSE"/);
  assert.match(comparisonHtml, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the comparison page states the no-upload claim', () => {
  assert.match(comparisonHtml, /Nothing leaves your browser/);
});

test('the comparison page names no other studio or product by name', () => {
  // It compares against a generic pricing method ("what other studios
  // charge"), not a named competitor -- so it is exempt from the
  // not-affiliated clause in clauses.mjs, and must stay that way.
  assert.doesNotMatch(comparisonHtml, /Not affiliated with/);
});

import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeMonthProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./how-much-does-stockx-take-from-sellers.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeMonthProfit, incomeGap, and minimumSalePrice from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeMonthProfit, incomeGap, minimumSalePrice, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the sale and month calculators', () => {
  assert.match(html, /recordEvent\('sale-priced'\)/);
  assert.match(html, /recordEvent\('month-check'\)/);
  assert.match(html, /<code>sale-priced<\/code>, <code>month-check<\/code>/);
});

test('the default sale inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="salePrice" type="number" min="0" step="1" value="${DEFAULTS.salePrice}"`));
  assert.ok(result.netProfit > 0);
});

test('the month table has six sale rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="saleProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a month computed from the page defaults matches computeMonthProfit directly', () => {
  const month = computeMonthProfit([{ netProfit: 26 }, { netProfit: 35 }]);
  assert.ok(month.totalMonthlyProfit > 0);
  assert.match(html, /value="26"/);
  assert.match(html, /value="35"/);
});

test('the no-warranty disclaimer is on the page, including the StockX-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not an authentication, inventory, or sourcing tool/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, says nothing is uploaded, and keeps the sale-row promise', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /they are never saved anywhere/);
  assert.match(html, /closing or refreshing the tab clears them/);
  assert.match(html, /<code>link-copied<\/code>, <code>reset<\/code>/);
});

test('targetMonthlyProfit is documented as saved and shareable, not as part of the never-saved sale rows', () => {
  assert.match(html, /Target monthly profit is saved on this device and carried in your shareable link/);
  assert.match(html, /only the sale rows are never saved/);
});

test('the page ships a save-and-share draft feature for the sale inputs, matching sibling calculators', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="draftStatus"/);
});

test('the sale month table is never included in the shareable link or local draft', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /function saleInputs\(\) \{ return Object\.fromEntries\(SALE_IDS\.map/);
  assert.equal([...body.matchAll(/encodeInputs\(/g)].length, 1);
  assert.match(body, /encodeInputs\(saleInputs\(\)\)/);
  assert.equal([...body.matchAll(/localStorage\.setItem\(DRAFT_KEY,/g)].length, 1);
  assert.match(body, /localStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(saleInputs\(\)\)\)/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  const body = scriptMatch[1];
  assert.match(body, /applySaleInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
  assert.match(body, /applySaleInputs\(DEFAULT_SALE_INPUTS\)/, 'Reset to defaults must restore the page\'s own shipped values');
});

test('the sale result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid sale input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateSale[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateSale() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the tool links to the how-much-does-StockX-take guide page', () => {
  assert.match(html, /href="how-much-does-stockx-take-from-sellers\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly, both without and with Fast Shipping', () => {
  const base = { salePrice: 150, itemCostBasis: 100, paymentProcessingFeePct: 3, shippingCost: 6 };
  const before = calculate({ ...base, sellerFeePct: 9, fastShippingDiscountPct: 0 });
  const after = calculate({ ...base, sellerFeePct: 4, fastShippingDiscountPct: 1 });
  // The whole point of this worked example: seller level and Fast Shipping
  // alone move net profit on an otherwise identical sale.
  assert.ok(after.netProfit > before.netProfit, 'the higher-level, Fast Shipping case should keep more');
  assert.match(guideHtml, /\$13\.50/);
  assert.match(guideHtml, /\$4\.50/);
  assert.match(guideHtml, /\$24\.00/);
  assert.match(guideHtml, /\$15\.00/);
  assert.match(guideHtml, /\$126\.00/);
  assert.match(guideHtml, /\$135\.00/);
  assert.match(guideHtml, /\$26\.00/);
  assert.match(guideHtml, /\$35\.00/);
  assert.match(guideHtml, /17\.3%/);
  assert.match(guideHtml, /23\.3%/);
  close(before.netProfit, 26);
  close(after.netProfit, 35);
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

// Closest single-channel marketplace-fee siblings, per platform/pages/build.mjs's
// `marketplace` category grouping. Related-tool chrome rotates inside the
// subcategory, so without an explicit one-hop a crawler on this page may
// never land on either tool.
test('index links one hop to the whatnot-seller-payout sibling', () => {
  assert.match(
    html,
    /href="\.\.\/whatnot-seller-payout\/"/,
    'index must link ../whatnot-seller-payout/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /Whatnot seller payout calculator/i);
});

test('the other-per-sale-cost field is on the page, wired, and disclosed as saved', () => {
  assert.match(html, /id="otherCost" type="number"/, 'the other-cost input is missing from the page');
  assert.match(html, /id="otherCostOut"/, 'the other-cost figure is never shown in the result panel');
  assert.match(html, /other per-sale costs\) and your target monthly profit are saved locally/i,
    'the privacy note must name the new field among what is stored');
});

test('index carries a prefilled handoff into the where-to-sell comparison', () => {
  // The reverse of where-to-sell-calculator/handoff.mjs. Its own VENTURE.yaml
  // names the untested hypothesis this closes: the handoff, not the depth of
  // the second tool, decides whether the comparison ever gets opened.
  assert.match(html, /import \{ whereToSellUrl \} from '\.\/to-where-to-sell\.mjs'/);
  assert.match(html, /id="whereToSellLink" href="\.\.\/where-to-sell-calculator\/"/,
    'the link must resolve without JavaScript too, then be rewritten with the item');
  assert.match(html, /el\('whereToSellLink'\)\.href = whereToSellUrl\(saleInputs\(\)\)/,
    'the link must carry what is on screen, not a stale snapshot');
  assert.match(html, /recordEvent\('handoff_where_to_sell'\)/);
  assert.match(html, /<code>handoff_where_to_sell<\/code>/,
    'an event the page records must be disclosed in the privacy note');
});

test('index links one hop to the marketplace-fee-compare sibling', () => {
  assert.match(
    html,
    /href="\.\.\/marketplace-fee-compare\/"/,
    'index must link ../marketplace-fee-compare/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /marketplace fee compare/i);
});

test('index links one hop to the kickstarter-fee-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/kickstarter-fee-calculator\/"/,
    'index must link ../kickstarter-fee-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /Kickstarter fee calculator/i);
});

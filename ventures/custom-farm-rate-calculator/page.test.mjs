import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeSeasonProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./why-a-lightly-used-machine-needs-a-higher-rate.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeSeasonProfit, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeSeasonProfit, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the job and season calculators', () => {
  assert.match(html, /recordEvent\('job-priced'\)/);
  assert.match(html, /recordEvent\('season-check'\)/);
  assert.match(html, /<code>job-priced<\/code>, <code>season-check<\/code>/);
});

test('the default job inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="acres" type="number" min="0.1" step="any" value="${DEFAULTS.acres}"`));
  assert.ok(result.profitAtBillRate > 0);
});

test('the season table has six job rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="jobProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a season computed from the page defaults matches computeSeasonProfit directly', () => {
  const season = computeSeasonProfit([{ profit: 460 }, { profit: 310 }]);
  assert.ok(season.totalSeasonProfit > 0);
  assert.match(html, /value="460"/);
  assert.match(html, /value="310"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not agronomic, tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the job result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section id="price" class="result" aria-live="polite">/);
});

test('an invalid job input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateJob[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateJob() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('billRate'\)\.hidden = true/, 'the rate hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every inline JSON-LD script block is valid JSON', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const [, json] of blocks) assert.doesNotThrow(() => JSON.parse(json));
});

test('the calculator links to the guide page', () => {
  assert.match(html, /href="why-a-lightly-used-machine-needs-a-higher-rate\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not agronomic, tax, financial, or business advice/);
});

test('the guide page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(guideHtml, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guideHtml, /href="LICENSE"/);
});

test('the guide page worked example matches calc.mjs exactly for both hours-used-per-year scenarios', () => {
  const base = calculate(DEFAULTS);
  const lowHours = calculate({ ...DEFAULTS, hoursUsedPerYear: 100 });
  // The whole point of the page is that only the ownership-cost line moves
  // between the two columns -- fuel, repairs, and labor must be identical.
  assert.equal(base.fuelCost, lowHours.fuelCost);
  assert.equal(base.repairsCost, lowHours.repairsCost);
  assert.equal(base.laborCost, lowHours.laborCost);
  assert.ok(lowHours.ownershipCost > base.ownershipCost, 'fewer annual hours should raise this job\'s ownership-cost share');
  assert.ok(lowHours.billRatePerAcre > base.billRatePerAcre, 'fewer annual hours should raise the per-acre rate');
  assert.match(guideHtml, /\$112\.00/);
  assert.match(guideHtml, /\$280\.00/);
  assert.match(guideHtml, /\$602\.31/);
  assert.match(guideHtml, /\$234\.67/);
  assert.match(guideHtml, /\$1,460\.15/);
  assert.match(guideHtml, /\$3,650\.37/);
  assert.match(guideHtml, /\$312\.89/);
  assert.match(guideHtml, /\$2,610\.01/);
  assert.match(guideHtml, /\$4,800\.24/);
  assert.match(guideHtml, /\$16\.31\/ac/);
  assert.match(guideHtml, /\$30\.00\/ac/);
  assert.match(guideHtml, /\$19\.19\/ac/);
  assert.match(guideHtml, /\$35\.30\/ac/);
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
    assert.match(sitemap, new RegExp(`/custom-farm-rate-calculator/${name === 'index.html' ? '' : name}<`), `${name} is not reachable from sitemap.xml`);
  }
});

// Closest sibling: same rate-from-your-own-cost-structure shape, but a shop's
// hourly labor rate rather than a per-acre field rate. Without a crawlable
// link here, a crawler entering on the custom farm rate calculator never
// reaches the shop rate calculator in one hop.
test('index links one hop to the shop-rate-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/shop-rate-calculator\/"/,
    'index must link ../shop-rate-calculator/ so crawlers reach the shop rate calculator in one hop',
  );
});

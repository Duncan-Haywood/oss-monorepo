import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeSeasonProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

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

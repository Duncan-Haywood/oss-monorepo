import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, DEFAULTS } from './calc.mjs';
import { decodeInputs, buildShareUrl } from './share.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page wires draft persistence and a shareable link without a build step', () => {
  assert.match(html, /import\{decodeInputs,buildShareUrl,FIELD_IDS\}from'\.\/share\.mjs'/);
  assert.match(html, /id="share"/);
  assert.match(html, /id="shareStatus"/);
  assert.match(html, /buildShareUrl\(location\.href,currentInputs\(\)\)/);
  assert.match(html, /decodeInputs\(location\.hash\)/);
  assert.match(html, /localStorage\.getItem\(DRAFT_KEY\)/);
  assert.match(html, /localStorage\.setItem\(DRAFT_KEY,JSON\.stringify\(inputs\)\)/);
  assert.match(html, /recordEvent\('share-link'\)/);
  assert.match(html, /recordEvent\('estimate'\)/);
});

test('the optional current-price field is wired to its own result box and event', () => {
  assert.match(html, /id="currentPrice"/);
  assert.match(html, /id="currentBox"/);
  assert.match(html, /recordEvent\('current-price-checked'\)/);
  assert.match(html, /<code>current-price-checked<\/code>/);
});

test('a shared link takes priority over a saved draft, which takes priority over the defaults', () => {
  assert.match(html, /const initial=\{\.\.\.DEFAULTS,\.\.\.draft,\.\.\.linked\}/);
});

test('the privacy line names both stored event types and says nothing is uploaded', () => {
  assert.match(html, /private local draft/);
  assert.match(html, /nothing is uploaded/);
  assert.match(html, /<code>estimate<\/code>, <code>share-link<\/code>/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('every default field the page collects is one share.mjs round-trips', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the default 40-account route matches the figure the page starts with', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`value="${DEFAULTS.accounts}"`));
  assert.ok(result.minimumMonthlyPrice > 0);
});

test('a link built from the page defaults decodes back to those same defaults', () => {
  const url = buildShareUrl('https://example.com/pool-route-pricing/', DEFAULTS);
  const hash = url.split('#')[1];
  assert.deepEqual(decodeInputs(hash), DEFAULTS);
});

test('an invalid input clears every stale result instead of leaving it next to a silent error', () => {
  // Before this fix, update()'s catch block only overwrote #price with the
  // error sentence. Route revenue, labor hours, labor cost, chemicals,
  // overhead, total cost, and the entire "at your current price" box kept
  // showing the last valid calculation. A visitor who missed the one-line
  // message in #price could easily read those stale figures as the answer
  // for the invalid inputs now on screen.
  const catchMatch = html.match(/\}catch\(e\)\{([\s\S]*?)\n\}\}/);
  assert.ok(catchMatch, 'update() catch block not found');
  const body = catchMatch[1];
  assert.match(body, /el\('price'\)\.textContent\s*=\s*e\.message/, 'the error message is never shown');
  for (const id of ['revenue', 'hours', 'labor', 'chemicals', 'overheadResult', 'cost', 'currentRevenue', 'currentProfit', 'currentMargin', 'currentVerdict']) {
    assert.match(
      body,
      new RegExp(`el\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /el\('currentBox'\)\.hidden\s*=\s*true/, 'the stale "at your current price" box is not hidden on a rejected input');
});

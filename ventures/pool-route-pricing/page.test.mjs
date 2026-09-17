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

test('the page carries the standard sponsor link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only the dollar hero (#price) with the error sentence and left
  // revenue, labor hours, labor cost, chemicals, overhead, total cost, and
  // the whole "at your current price" box showing the last valid
  // calculation. A visitor could easily miss the message and read those
  // stale figures as the answer for what is now on screen.
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/\}catch\(e\)\{([\s\S]*?)\n\}\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden\s*=\s*true/, 'the hero is not hidden on a rejected input');
  for (const id of ['revenue', 'hours', 'labor', 'chemicals', 'overheadResult', 'cost', 'currentRevenue', 'currentProfit', 'currentMargin', 'currentVerdict']) {
    assert.match(
      body,
      new RegExp(`el\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /el\('currentBox'\)\.hidden\s*=\s*true/, 'the stale current-price box is never hidden');
  assert.match(body, /el\('errors'\)\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the result panel announces recalculation to screen readers', () => {
  // The panel re-renders in place on every keystroke (price, revenue, labor
  // hours, chemicals, overhead, total cost) with no page navigation and no
  // focus change. Without aria-live, a screen-reader user who edits an input
  // gets no indication the numbers just changed -- the same gap already
  // fixed in which-job-first, cam-reconciliation-check, seller-net-sheet,
  // ltl-freight-class-estimator, chargeback-evidence-packet, and
  // subscription-price-impact.
  assert.match(html, /<section class="result" aria-live="polite">/);
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

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: the same recurring stop-based route business priced per
// site after drive time and materials — inspection stops there, pool accounts
// here. Rotating chrome may never pair them, so link explicitly.
test('index links one hop to the fire-extinguisher-inspection-route-margin sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/fire\-extinguisher\-inspection\-route\-margin\/"/,
    'index must link ../fire-extinguisher-inspection-route-margin/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /fire\-extinguisher/i);
});

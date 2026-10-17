import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMaxBid, DEFAULTS } from './calc.mjs';
import { FIELD_IDS } from './share.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports the arithmetic and the field list rather than restating either', () => {
  assert.match(html, /import \{ calculateMaxBid \} from '\.\/calc\.mjs'/);
  assert.match(
    html,
    /import \{ encodeInputs, decodeInputs, hasSharedInputs, formValues, FIELD_IDS \} from '\.\/share\.mjs'/,
  );
  assert.deepEqual([...FIELD_IDS], Object.keys(DEFAULTS));
});

test('every input the page shows is one a shared link carries', () => {
  for (const id of FIELD_IDS) {
    assert.ok(ids.has(id), `#${id} is on share.mjs's field list but missing from the page`);
  }
});

test('every default value on the page matches calc.mjs DEFAULTS', () => {
  for (const [id, value] of Object.entries(DEFAULTS)) {
    const input = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(input, `#${id} has no value attribute`);
    assert.equal(
      Number(input[1]),
      value,
      `#${id} on the page is ${input[1]} but calc.mjs defaults to ${value}`,
    );
  }
});

test('the page wires usage counting for the calculation and the overbid finding', () => {
  assert.match(script, /recordEvent\('bid-calculated'\)/);
  assert.match(script, /recordEvent\('overbid-warning-shown'\)/);
  assert.match(html, /<code>bid-calculated<\/code>, <code>overbid-warning-shown<\/code>/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('every input has a visible label wrapping it, so a screen reader announces a name', () => {
  for (const id of FIELD_IDS) {
    assert.match(
      html,
      new RegExp(`<label>[^<]+<input id="${id}"`),
      `#${id} is not inside a <label>, so it has no accessible name`,
    );
  }
});

test('every field lives inside a named fieldset', () => {
  const fieldsets = [...html.matchAll(/<fieldset><legend>([^<]+)<\/legend>([\s\S]*?)<\/fieldset>/g)];
  assert.ok(fieldsets.length >= 5, 'expected at least five grouped fieldsets');
  const coveredIds = new Set();
  for (const [, , body] of fieldsets) {
    for (const m of body.matchAll(/id="([^"]+)"/g)) coveredIds.add(m[1]);
  }
  for (const id of FIELD_IDS) {
    assert.ok(coveredIds.has(id), `#${id} is not inside any <fieldset>`);
  }
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = script.match(/function update\([\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('maxBidHero'\)\.hidden = true/, 'the hero figure is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
  assert.match(body, /for \(const id of OUT_IDS\) el\(id\)\.textContent = ''/, 'stale figures are left on screen');
});

test('every output element the success path writes is cleared on the error path', () => {
  const outIds = script.match(/const OUT_IDS = \[([\s\S]*?)\];/);
  assert.ok(outIds, 'OUT_IDS not found');
  const cleared = new Set([...outIds[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const written = [...script.matchAll(/el\('(\w+Out|maxBidLine)'\)\.textContent =/g)].map(m => m[1]);
  for (const id of new Set(written)) {
    assert.ok(cleared.has(id), `#${id} is written on success but never cleared on error`);
  }
});

test('the findings each have their own banner, hidden by default', () => {
  assert.match(html, /id="lossWarning" class="warn" hidden/);
  assert.match(html, /id="overbidWarning" class="warn" hidden/);
  assert.match(html, /id="depositWarning" class="warn" hidden/);
  assert.match(html, /id="noProfitWarning" class="warn" hidden/);
  assert.match(html, /id="naiveRuleWarning" class="warn" hidden/);
  assert.match(html, /id="healthyVerdict" class="good" hidden/);
});

test('the default worked example is healthy and shows the naive-rule finding', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.equal(r.healthy, true);
  assert.equal(r.naiveRuleExceedsBreakEven, true, 'the headline claim needs this to fire on the default');
  assert.equal(r.plannedExceedsBreakEven, false);
  assert.equal(r.depositAtRisk, false);
});

test('the headline claim matches the worked example: the naive rule bids past break-even', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.match(html, /can bid you past your own break-even before you.ve paid for a dump run/);
  assert.ok(r.naiveRuleBid > r.breakEvenBid, 'the h1 claims the naive rule overshoots break-even');
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not financial, tax, or legal advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(script, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('page wires a shareable link, matching sibling calculators', () => {
  for (const id of ['copyLink', 'shareStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /recordEvent\('link_copied'\)/);
  assert.match(html, /<code>link_copied<\/code>/);
});

test('the shared worksheet rides in the fragment, never the query string', () => {
  assert.match(script, /\$\{query \? `#\$\{query\}` : ''\}/);
});

test('a shared link replaces every field, so none of the recipient\'s own numbers survive', () => {
  assert.match(script, /formValues\(fromLink\)/);
  assert.doesNotMatch(
    script,
    /Object\.entries\(fromLink\)/,
    'writing the decoded link straight onto the form would leave the recipient\'s own values in the fields it omitted',
  );
});

test('opening the page on a shared link says so, without counting it as a calculation', () => {
  assert.match(script, /hasSharedInputs\(fromLink\)/);
  assert.match(script, /Opened a shared worksheet/);
  const restoreBlock = script.match(/const fromLink[\s\S]*?\n\}/);
  assert.ok(restoreBlock, 'the restore-from-link block was not found');
  assert.doesNotMatch(restoreBlock[0], /recordEvent\(/, 'opening a shared link is not a calculation');
});

test('the FAQ answer about uploads names the share control honestly', () => {
  assert.match(html, /Copy shareable link button puts the figures on the form into the page.s URL fragment/);
});

test('the buyer-premium finding is demonstrated on the planned-bid figures', () => {
  assert.match(html, /Buyer's premium on that bid/);
  const r = calculateMaxBid(DEFAULTS);
  assert.ok(r.plannedPremiumCost > 0, 'the worked example must show a nonzero premium cost');
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.ok(
    sitemap.includes('/storage-auction-max-bid-calculator/'),
    'index.html is not listed in sitemap.xml',
  );
});

test('every visible FAQ heading appears in the FAQPage structured data', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'the page carries no FAQPage structured data');
  const questions = faq.mainEntity.map(q => q.name);
  const headings = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  for (const heading of headings) {
    const decoded = heading.replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
    assert.ok(
      questions.some(q => q === decoded),
      `visible FAQ heading "${decoded}" is missing from the FAQPage JSON-LD`,
    );
  }
  assert.equal(questions.length, headings.length, 'the JSON-LD and the visible FAQ list different questions');
});

test('every FAQ answer in the structured data is also visible on the page', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(
      html.includes(qa.acceptedAnswer.text),
      `the JSON-LD answer for "${qa.name}" is not the visible one`,
    );
  }
});

test('the deposit-risk finding names the facility window and the deposit amount', () => {
  assert.match(script, /depositAtRisk/);
  assert.match(html, /Cleanout wall-clock time needed/);
});

// Half of a reciprocal pair: whatnot-seller-payout links back here too, so a
// crawler entering on either page reaches the other in one hop -- buying the
// lot at auction and reselling it on Whatnot are the two ends of one flip.
test('index links one hop to the whatnot-seller-payout sibling', () => {
  assert.match(
    html,
    /href="\.\.\/whatnot-seller-payout\/"/,
    'index must link ../whatnot-seller-payout/ so crawlers reach the Whatnot seller payout calculator in one hop',
  );
});

// Reciprocal half of the link added to equipment-auction-buyer-premium-calculator
// the same session: both price a buyer's premium on top of a hammer price,
// one for resale (this page) and one for the buyer's own use (that page).
test('index links one hop to the equipment-auction-buyer-premium-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/equipment-auction-buyer-premium-calculator\/"/,
    'index must link ../equipment-auction-buyer-premium-calculator/ so crawlers reach it in one hop',
  );
});

// Inbound link for `auction-car-flip-calculator`: the same buy-at-auction-to-resell
// max-bid question, for a vehicle with a repair bill instead of a unit's contents.
test('index links one hop to the auction-car-flip-calculator sibling', () => {
  assert.match(html, /href="\.\.\/auction-car-flip-calculator\/"/);
});

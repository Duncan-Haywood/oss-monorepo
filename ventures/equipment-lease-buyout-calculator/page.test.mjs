import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1];

test('a rejected input clears every derived figure instead of leaving a stale comparison', () => {
  // Without this, a rejected input overwrote only #message and left
  // #perMonthBuyout, #perMonthReplace, #breakEven and #premium showing the
  // previous lease's comparison. Nothing on the page says those figures are
  // stale, so they read as the answer for the numbers now in the form.
  assert.ok(script, 'app script not found');
  const catchBlock = script.match(/\} catch \(error\) \{([\s\S]*?)\n {4}\}/);
  assert.ok(catchBlock, 'render() catch block not found');
  const body = catchBlock[1];
  for (const id of ['perMonthBuyout', 'perMonthReplace', 'breakEven', 'premium']) {
    assert.match(body, new RegExp(`'${id}'`), `#${id} is not cleared on a rejected input`);
  }
  assert.match(body, /#notes'\)\.textContent = ''/, 'the per-lease notes are left on screen');
  assert.match(body, /#message'\)\.textContent = error\.message/, 'the error message is never shown');
});

test('the notes list is built with textContent, never innerHTML', () => {
  // verdictNotes() interpolates user-entered numbers into its sentences. They
  // are validated as finite numbers before they get there, but assigning any
  // of it through innerHTML would make that validation the only thing
  // standing between a typed value and the DOM.
  assert.ok(script, 'app script not found');
  assert.doesNotMatch(script, /innerHTML/, 'index.html assigns innerHTML somewhere');
  assert.match(script, /item\.textContent = note/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const htmlFiles = readdirSync(new URL('./', import.meta.url)).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the page carries the no-warranty clause and names what it is not advice about', () => {
  assert.match(html, /No warranty\./, 'missing the no-warranty clause');
  assert.match(html, /not financial, accounting, or legal advice/, 'does not say what it is not advice about');
});

test('the break-even price and fair-market-value comparison are both on screen', () => {
  // The product's central point: a payoff-letter number means nothing without
  // a break-even to compare it to and a fair-market-value check. If a
  // redesign drops either metric, the FAQ's claim about them becomes false
  // without any test failing.
  assert.match(html, /id="breakEven"/);
  assert.match(html, /id="premium"/);
  assert.match(html, /break-even buyout price/);
});

test('the page offers the usage opt-out and the optional sponsor link', () => {
  assert.match(html, /id="disable"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /never changes what the tool does/);
});

test('the tool makes no network request', () => {
  // The privacy line promises "there is no network request in the page at
  // all", which is a stronger claim than "we do not upload your data" and is
  // worth a guard rather than a habit.
  assert.ok(script, 'app script not found');
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

// Closest sibling: same equipment-cost decision shape for an independent
// operator, but pricing rental bookings rather than a lease buyout vs.
// return-and-replace. Related-tool chrome rotates inside the subcategory, so
// without an explicit one-hop a crawler on this page may never land on that tool.
test('index links one hop to the equipment-rental-break-even sibling', () => {
  assert.match(
    html,
    /href="\.\.\/equipment-rental-break-even\/"/,
    'index must link ../equipment-rental-break-even/ so crawlers reach the equipment rental calculator in one hop',
  );
  assert.match(html, /equipment rental break-even calculator/i);
});

// Second sibling, added 2026-09-12 in the commit that graduated it. Same
// capital decision one level up: this page prices ONE asset's lease buyout
// against return-and-replace, that page decides WHICH of several vehicles or
// machines to act on at all, against a fixed budget. The orphan budget in
// platform/pages/siblings-budget.json is 0, so the inbound link ships with
// the new tool rather than being closed later off a worklist.
test('index links one hop to the fleet-repair-or-replace-planner sibling', () => {
  assert.match(
    html,
    /href="\.\.\/fleet-repair-or-replace-planner\/"/,
    'index must link ../fleet-repair-or-replace-planner/ so crawlers reach the fleet planner in one hop',
  );
  assert.match(html, /fleet repair-or-replace planner/i);
});

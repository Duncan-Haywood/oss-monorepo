// Structural assertions about the published pages.
//
// The class of bug these catch is the one this repository keeps paying for: a
// figure written into prose that the arithmetic no longer produces. Every
// quoted number here is recomputed from calc.mjs and compared, rather than
// pinned to a literal. Change the defaults on the form and these fail, naming
// the sentence that went stale.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LAYER_COUNT, LAYER_FIELDS, GLOBAL_INPUT_IDS, calculateTax } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const comparison = readFileSync(new URL('./vs-tracking-it-in-a-spreadsheet.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
];

/** The form's own default values, read out of the markup rather than restated. */
function rowsFromPage() {
  const rows = [];
  for (let r = 1; r <= LAYER_COUNT; r += 1) {
    const row = {};
    for (const field of LAYER_FIELDS) {
      const match = index.match(new RegExp(`class="${field}" data-row="${r}"[^>]*\\svalue="([^"]*)"`));
      assert.ok(match, `row ${r} is missing its ${field} cell`);
      row[field] = match[1];
    }
    rows.push(row);
  }
  return rows;
}

function globalFromPage(id) {
  const match = index.match(new RegExp(`id="${id}"[^>]*\\svalue="([^"]*)"`));
  assert.ok(match, `#${id} is declared in calc.mjs but absent from the page`);
  return match[1];
}

const RESULT = calculateTax({
  rows: rowsFromPage(),
  ...Object.fromEntries(GLOBAL_INPUT_IDS.map((id) => [id, globalFromPage(id)])),
});

/** How the pages write money: two decimals, thousands separated, no sign. */
const money = (value) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test('the page collects every input the calculator declares, and its defaults compute', () => {
  assert.equal(RESULT.ok, true, `the page's own defaults must work the tax: ${JSON.stringify(RESULT.errors)}`);
});

test('the entry table has exactly the rows and columns calc.mjs expects', () => {
  const inputs = [...index.matchAll(/<input class="([A-Za-z]+)" data-row="(\d+)"/g)];
  assert.equal(inputs.length, LAYER_COUNT * LAYER_FIELDS.length);
  for (let r = 1; r <= LAYER_COUNT; r += 1) {
    for (const field of LAYER_FIELDS) {
      assert.equal(
        inputs.filter((m) => m[1] === field && Number(m[2]) === r).length, 1,
        `row ${r} should have exactly one ${field} cell`,
      );
    }
  }
});

test('every table input carries an accessible name', () => {
  const cells = [...index.matchAll(/<input class="[A-Za-z]+" data-row="\d+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cells.length, LAYER_COUNT * LAYER_FIELDS.length);
  for (const cell of cells) {
    const named = cell.match(/aria-label="([^"]+)"/);
    assert.ok(named, `a table input has no aria-label: ${cell}`);
    assert.ok(named[1].length > 5, `aria-label is too thin to be useful: ${named[1]}`);
  }
});

test('the non-table inputs are exactly the ones calc.mjs reads', () => {
  for (const id of GLOBAL_INPUT_IDS) assert.ok(index.includes(`id="${id}"`), `#${id} is missing from the page`);
  const numeric = [...index.matchAll(/<input id="([A-Za-z]+)" type="number"/g)].map((m) => m[1]);
  assert.deepEqual(numeric.sort(), [...GLOBAL_INPUT_IDS].sort());
});

test('every result field the script writes to exists in the markup', () => {
  const targets = [...index.matchAll(/el\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
  const declared = new Set([...index.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(targets.length > 10);
  for (const id of new Set(targets)) {
    assert.ok(declared.has(id), `the script writes to #${id}, which the markup does not declare`);
  }
});

test('both pages quote the taxable base and the total tax', () => {
  for (const [name, html] of PAGES) {
    assert.ok(html.includes(money(RESULT.taxableBase)), `${name} should quote the taxable base ${money(RESULT.taxableBase)}`);
    assert.ok(html.includes(money(RESULT.totalTax)), `${name} should quote total tax ${money(RESULT.totalTax)}`);
  }
});

test('both pages quote the headline split: what the platform collects vs. what the host remits', () => {
  assert.ok(RESULT.platformCollected > 0, 'the example must keep its point: the platform collects part of the tax');
  assert.ok(RESULT.hostMustRemit > 0, 'and the host must still remit the rest');
  for (const [name, html] of [...PAGES, ['vs-tracking-it-in-a-spreadsheet', comparison]]) {
    assert.ok(html.includes(money(RESULT.platformCollected)), `${name} should quote the ${money(RESULT.platformCollected)} the platform collects`);
    assert.ok(html.includes(money(RESULT.hostMustRemit)), `${name} should quote the ${money(RESULT.hostMustRemit)} the host must remit`);
  }
});

test('the comparison page quotes the same worked example', () => {
  assert.ok(comparison.includes(money(RESULT.taxableBase)));
  assert.ok(comparison.includes(money(RESULT.totalTax)));
});

test('both pages carry the no-warranty clause and the determinations this must not be read as making', () => {
  for (const [name, html] of [...PAGES, ['vs-tracking-it-in-a-spreadsheet', comparison]]) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, accounting, or financial advice/, name);
    assert.match(html, /accept no liability/, name);
    assert.match(html, /it is not a filing|it files nothing/, `${name} must say it files nothing`);
    assert.match(html, /qualified tax professional/, name);
  }
});

test('both pages promise, and keep, that nothing is uploaded', () => {
  for (const [name, html] of [...PAGES, ['vs-tracking-it-in-a-spreadsheet', comparison]]) {
    assert.match(html, /Nothing leaves your browser|nothing you enter is sent to a server/, name);
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not make network requests`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, name);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} must not load a third-party script`);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, `${name} must not load a remote image`);
  }
});

test('the usage counter is opt-out-able and never records a figure', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\)/);
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(events), new Set(['tax_worked', 'tax_rejected', 'example_cleared', 'link_copied']));
});

test('both pages link the sibling tool and the sponsor page', () => {
  assert.match(index, /\.\.\/str-host-payout-calculator\//, 'index should link its nearest sibling');
  for (const [name, html] of [...PAGES, ['vs-tracking-it-in-a-spreadsheet', comparison]]) {
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, `${name} should carry the optional sponsor link`);
  }
});

test('the two pages point at each other', () => {
  assert.match(index, /href="\.\/vs-tracking-it-in-a-spreadsheet\.html"/);
  assert.match(comparison, /href="\.\/"/);
});

test('the FAQ markup and the FAQ structured data say the same things', () => {
  const ld = index.match(/"@type":"FAQPage","mainEntity":(\[[\s\S]*\])\}<\/script>/);
  assert.ok(ld, 'the page should carry FAQPage structured data');
  const questions = JSON.parse(ld[1]);
  const faq = index.match(/<section id="faq">([\s\S]*?)<\/section>/);
  assert.ok(faq, 'the page should carry a visible FAQ section');
  const headings = [...faq[1].matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.equal(questions.length, headings.length, 'every structured-data question needs a visible heading');
  for (const q of questions) {
    const name = q.name.replace(/&/g, '&amp;');
    assert.ok(
      headings.some((h) => h.replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—') === name),
      `structured data asks "${q.name}" but no visible heading does`,
    );
  }
});

test('every claim the structured data makes about the example is one the arithmetic makes', () => {
  const ld = index.match(/"@type":"FAQPage","mainEntity":(\[[\s\S]*\])\}<\/script>/);
  const blob = JSON.parse(ld[1]).map((q) => q.acceptedAnswer.text).join(' ');
  for (const figure of [money(RESULT.taxableBase), money(RESULT.totalTax), money(RESULT.platformCollected), money(RESULT.hostMustRemit)]) {
    assert.ok(blob.includes(figure), `the FAQ answers quote ${figure}, which the calculator must still produce`);
  }
});

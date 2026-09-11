// Structural assertions about the two published pages.
//
// The class of bug these catch is the one this repository keeps paying for: a
// figure written into prose that the arithmetic no longer produces. Both pages
// quote the worked example in words and in a table, so every quoted number
// here is recomputed from `calc.mjs` and compared, rather than pinned to a
// literal. Change the defaults on the form and these fail, naming the sentence
// that went stale.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROW_COUNT, ROW_FIELDS, GLOBAL_INPUT_IDS, round2, calculateReturn } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./how-to-calculate-ifta-quarterly-tax.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
  ['how-to-calculate-ifta-quarterly-tax', article],
];

/** The form's own default values, read out of the markup rather than restated. */
function rowsFromPage() {
  const rows = [];
  for (let r = 1; r <= ROW_COUNT; r += 1) {
    const row = {};
    for (const field of ROW_FIELDS) {
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

const RESULT = calculateReturn({
  rows: rowsFromPage(),
  interestAnnualPercent: globalFromPage('interestAnnualPercent'),
  monthsLate: globalFromPage('monthsLate'),
});

/** How the pages write money: two decimals, thousands separated, no sign. */
const money = (value) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gal = money;
const whole = (value) => Math.round(value).toLocaleString('en-US');
/**
 * A gallon count reads "3,890.00" in the schedule tables and "3,890 gallons"
 * in a sentence. Both are the same figure; requiring one spelling everywhere
 * would make the prose worse to satisfy the test, so the test accepts either
 * and still fails the moment the figure itself moves.
 */
const quotesGallons = (html, value) => html.includes(gal(value))
  || (Number.isInteger(value) && html.includes(whole(value)));
const line = (code) => RESULT.lines.find((l) => l.jurisdiction === code);

test('the page collects every input the calculator declares, and its defaults compute', () => {
  assert.equal(RESULT.ok, true, `the page's own defaults must work the return: ${JSON.stringify(RESULT.errors)}`);
});

test('the entry table has exactly the rows and columns calc.mjs expects', () => {
  const inputs = [...index.matchAll(/<input class="([A-Za-z]+)" data-row="(\d+)"/g)];
  assert.equal(inputs.length, ROW_COUNT * ROW_FIELDS.length);
  for (let r = 1; r <= ROW_COUNT; r += 1) {
    for (const field of ROW_FIELDS) {
      assert.equal(
        inputs.filter((m) => m[1] === field && Number(m[2]) === r).length, 1,
        `row ${r} should have exactly one ${field} cell`,
      );
    }
  }
});

test('every table input carries an accessible name', () => {
  // The specific failure this repository has already shipped once: a route
  // table of bare number inputs, announced to a screen reader as "edit,
  // number" and nothing else. A <th> is not an accessible name for an input.
  const cells = [...index.matchAll(/<input class="[A-Za-z]+" data-row="\d+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cells.length, ROW_COUNT * ROW_FIELDS.length);
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

test('both pages quote the fleet figures the calculator produces', () => {
  for (const [name, html] of PAGES) {
    assert.ok(html.includes(whole(RESULT.totalMiles)), `${name} should quote total miles ${whole(RESULT.totalMiles)}`);
    assert.ok(quotesGallons(html, RESULT.totalGallons), `${name} should quote total gallons ${gal(RESULT.totalGallons)}`);
    assert.ok(html.includes(RESULT.mpg.toFixed(2)), `${name} should quote the fleet MPG ${RESULT.mpg.toFixed(2)}`);
  }
});

test('both pages quote the headline: a credit on the tax line, a bill on the return', () => {
  assert.ok(RESULT.taxDue < 0, 'the example must keep its point: the fuel tax nets to a credit');
  assert.ok(RESULT.grandTotal > 0, 'and the return must still owe money');
  for (const [name, html] of PAGES) {
    assert.ok(html.includes(money(RESULT.taxDue)), `${name} should quote the ${money(RESULT.taxDue)} tax credit`);
    assert.ok(html.includes(money(RESULT.grandTotal)), `${name} should quote the ${money(RESULT.grandTotal)} owed`);
    assert.ok(html.includes(money(RESULT.surchargeDue)), `${name} should quote the ${money(RESULT.surchargeDue)} surcharge`);
  }
});

test('both pages quote the understatement a netted surcharge would produce', () => {
  const netted = round2(RESULT.lines.reduce((n, l) => n + round2(l.netTaxableGallons * l.surchargeRate), 0));
  const understated = round2(RESULT.surchargeDue - netted);
  assert.ok(understated > 0, 'the example must keep a surcharge that netting would understate');
  for (const [name, html] of PAGES) {
    assert.ok(html.includes(money(netted)), `${name} should quote the wrongly-netted ${money(netted)}`);
    assert.ok(html.includes(money(understated)), `${name} should quote the ${money(understated)} shortfall`);
  }
});

test('the guide quotes every row of the schedule it prints', () => {
  for (const l of RESULT.lines) {
    assert.ok(article.includes(gal(l.taxableGallons)), `guide should quote ${l.jurisdiction} taxable gallons ${gal(l.taxableGallons)}`);
    assert.ok(article.includes(gal(l.netTaxableGallons)), `guide should quote ${l.jurisdiction} net taxable ${gal(l.netTaxableGallons)}`);
    assert.ok(article.includes(money(l.taxDue)), `guide should quote ${l.jurisdiction} tax ${money(l.taxDue)}`);
    if (l.surchargeRate > 0) {
      assert.ok(article.includes(money(l.surchargeDue)), `guide should quote ${l.jurisdiction} surcharge ${money(l.surchargeDue)}`);
    }
    assert.ok(article.includes(money(l.rowTotal)), `guide should quote ${l.jurisdiction} row total ${money(l.rowTotal)}`);
  }
});

test('the Michigan and Illinois walk-throughs still describe what happens', () => {
  const mi = line('MI');
  const il = line('IL');
  assert.equal(mi.taxPaidGallons, 0, 'the guide calls Michigan the state fuelled nowhere');
  assert.ok(il.netTaxableGallons < 0, 'the guide calls Illinois the state in credit');
  assert.ok(article.includes(gal(mi.taxableGallons)) && article.includes(money(mi.taxDue)));
  assert.ok(article.includes(gal(il.taxPaidGallons)) && article.includes(money(il.taxDue)));
});

test('the Kentucky example keeps the property the guide draws from it', () => {
  const ky = line('KY');
  assert.ok(ky.netTaxableGallons < 0, 'Kentucky must be in credit on its tax line');
  assert.ok(ky.surchargeDue > 0, 'and owe its surcharge in full — the guide says so in words');
  assert.ok(article.includes(gal(Math.abs(ky.netTaxableGallons))));
});

test('both pages carry the no-warranty clause and the determinations this must not be read as making', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, accounting, or financial advice/, name);
    assert.match(html, /accept no liability/, name);
    // A tax worksheet must be unmistakably not a filing, and must not be read
    // as deciding any of the four things only a base jurisdiction decides.
    assert.match(html, /it is not a filing/, `${name} must say it files nothing`);
    assert.match(html, /base jurisdiction/, name);
    assert.match(html, /qualified tax professional/, name);
    assert.match(html, /official IFTA rate table/, `${name} must send the reader to the real rates`);
  }
});

test('both pages promise, and keep, that nothing is uploaded', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /Nothing leaves your browser/, name);
    // The claim is only true if the page makes no request. Any of these would
    // break it, and a promise the code contradicts is worse than no promise.
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not make network requests`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, name);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} must not load a third-party script`);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, `${name} must not load a remote image`);
  }
});

test('the usage counter is opt-out-able and never records a figure', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\)/);
  // Only event names reach the counter, and they are literals in the source.
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(events), new Set(['return_worked', 'return_rejected', 'example_cleared']));
});

test('both pages link the sibling tools and the sponsor page', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /\.\.\/owner-operator-cpm-calculator\//, `${name} should link its nearest sibling`);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, `${name} should carry the optional sponsor link`);
  }
  assert.match(index, /\.\.\/gig-driver-net-pay-calculator\//);
  assert.match(index, /\.\.\/freight-accessorial-auditor\//);
});

test('the two pages point at each other', () => {
  assert.match(index, /href="\.\/how-to-calculate-ifta-quarterly-tax\.html"/);
  assert.match(article, /href="\.\/"/);
});

test('the FAQ markup and the FAQ structured data say the same things', () => {
  const ld = index.match(/"@type":"FAQPage","mainEntity":(\[[\s\S]*\])\}<\/script>/);
  assert.ok(ld, 'the page should carry FAQPage structured data');
  const questions = JSON.parse(ld[1]);
  // Scoped to the FAQ section: the result panel carries an <h3> of its own,
  // and counting it here would make this test fail for the wrong reason.
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
  assert.ok(quotesGallons(blob, RESULT.totalGallons), `the FAQ answers quote ${gal(RESULT.totalGallons)} gallons`);
  for (const figure of [
    whole(RESULT.totalMiles), RESULT.mpg.toFixed(2),
    money(RESULT.taxDue), money(RESULT.grandTotal), money(RESULT.surchargeDue),
  ]) {
    assert.ok(blob.includes(figure), `the FAQ answers quote ${figure}, which the calculator must still produce`);
  }
});

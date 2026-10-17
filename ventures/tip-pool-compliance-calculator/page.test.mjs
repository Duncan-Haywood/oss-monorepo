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

import { ROLE_COUNT, ROLE_FIELDS, GLOBAL_INPUT_IDS, checkPool } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const comparison = readFileSync(new URL('./vs-guessing-from-a-staff-meeting.html', import.meta.url), 'utf8');
const managerGuide = readFileSync(new URL('./can-managers-be-in-a-tip-pool.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
];

/** The form's own default values, read out of the markup rather than restated. */
function rowsFromPage() {
  const rows = [];
  for (let r = 1; r <= ROLE_COUNT; r += 1) {
    const row = {};
    for (const field of ROLE_FIELDS) {
      if (field === 'category') {
        const selectMatch = index.match(new RegExp(`class="category" data-row="${r}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(selectMatch, `row ${r} is missing its category select`);
        const selected = selectMatch[1].match(/<option value="([^"]*)" selected>/);
        row.category = selected ? selected[1] : 'front';
        continue;
      }
      if (field === 'inPool') {
        const boxMatch = index.match(new RegExp(`class="inPool" data-row="${r}"[^>]*>`));
        assert.ok(boxMatch, `row ${r} is missing its in-pool checkbox`);
        row.inPool = /checked/.test(boxMatch[0]);
        continue;
      }
      const match = index.match(new RegExp(`class="${field}" data-row="${r}"[^>]*\\svalue="([^"]*)"`));
      assert.ok(match, `row ${r} is missing its ${field} cell`);
      row[field] = match[1];
    }
    rows.push(row);
  }
  return rows;
}

function globalFromPage(id) {
  if (id === 'tipCreditTaken') {
    const match = index.match(/id="tipCreditTaken" type="checkbox"([^>]*)>/);
    assert.ok(match, '#tipCreditTaken is missing from the page');
    return /checked/.test(match[1]);
  }
  const match = index.match(new RegExp(`id="${id}"[^>]*\\svalue="([^"]*)"`));
  assert.ok(match, `#${id} is declared in calc.mjs but absent from the page`);
  return match[1];
}

const RESULT = checkPool({
  rows: rowsFromPage(),
  ...Object.fromEntries(GLOBAL_INPUT_IDS.map((id) => [id, globalFromPage(id)])),
});

/** How the pages write money: two decimals, thousands separated, no sign. */
const money = (value) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test('the page collects every input the calculator declares, and its defaults compute', () => {
  assert.equal(RESULT.ok, true, `the page's own defaults must check the pool: ${JSON.stringify(RESULT.errors)}`);
});

test('the entry table has exactly the rows and columns calc.mjs expects', () => {
  const nameInputs = [...index.matchAll(/<input class="name" data-row="(\d+)"/g)];
  assert.equal(nameInputs.length, ROLE_COUNT);
  const categorySelects = [...index.matchAll(/<select class="category" data-row="(\d+)"/g)];
  assert.equal(categorySelects.length, ROLE_COUNT);
  const poolBoxes = [...index.matchAll(/<input class="inPool" data-row="(\d+)"/g)];
  assert.equal(poolBoxes.length, ROLE_COUNT);
});

test('every table input and select carries an accessible name', () => {
  const inputs = [...index.matchAll(/<(?:input|select) class="[A-Za-z]+" data-row="\d+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(inputs.length, ROLE_COUNT * ROLE_FIELDS.length);
  for (const cell of inputs) {
    const named = cell.match(/aria-label="([^"]+)"/);
    assert.ok(named, `a table cell has no aria-label: ${cell}`);
    assert.ok(named[1].length > 5, `aria-label is too thin to be useful: ${named[1]}`);
  }
});

test('the worked example has a manager violation and a back-of-house violation', () => {
  assert.equal(RESULT.violations.length, 2, JSON.stringify(RESULT.violations));
  assert.equal(RESULT.managerViolations.length, 1);
  assert.equal(RESULT.backOfHouseViolations.length, 1);
  assert.equal(RESULT.clawbackApplies, true);
});

test('both pages quote the worked example: front-of-house hours, weekly exposure, and total exposure', () => {
  assert.equal(RESULT.frontHoursPerWeek, 230);
  for (const [name, html] of [...PAGES, ['vs-guessing-from-a-staff-meeting', comparison]]) {
    assert.ok(html.includes(String(RESULT.frontHoursPerWeek)), `${name} should quote ${RESULT.frontHoursPerWeek} front-of-house hours`);
    assert.ok(html.includes(money(RESULT.weeklyExposure)), `${name} should quote the weekly exposure ${money(RESULT.weeklyExposure)}`);
    assert.ok(html.includes(money(RESULT.totalExposure)), `${name} should quote the total exposure ${money(RESULT.totalExposure)}`);
  }
});

test('every page carries the no-warranty clause and the determinations this must not be read as making', () => {
  for (const [name, html] of [...PAGES, ['vs-guessing-from-a-staff-meeting', comparison], ['can-managers-be-in-a-tip-pool', managerGuide]]) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, accounting, or financial advice/, name);
    assert.match(html, /accept no liability/, name);
    assert.match(html, /makes no determination/, name);
    assert.match(html, /qualified employment attorney/, name);
  }
});

test('every page promises, and keeps, that nothing is uploaded', () => {
  for (const [name, html] of [...PAGES, ['vs-guessing-from-a-staff-meeting', comparison], ['can-managers-be-in-a-tip-pool', managerGuide]]) {
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
  assert.deepEqual(new Set(events), new Set(['pool_checked', 'pool_rejected', 'example_cleared', 'link_copied']));
});

test('the index links its nearest sibling venture', () => {
  assert.match(index, /\.\.\/no-tax-on-tips-overtime-calculator\//);
});

test('every page carries the optional sponsor link', () => {
  for (const [name, html] of [...PAGES, ['vs-guessing-from-a-staff-meeting', comparison], ['can-managers-be-in-a-tip-pool', managerGuide]]) {
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, `${name} should carry the optional sponsor link`);
  }
});

test('the comparison page and the index point at each other', () => {
  assert.match(index, /href="\.\/vs-guessing-from-a-staff-meeting\.html"/);
  assert.match(comparison, /href="\.\/"/);
});

test('the manager guide and the index point at each other', () => {
  assert.match(index, /href="\.\/can-managers-be-in-a-tip-pool\.html"/);
  assert.match(managerGuide, /href="\.\/" class="back"/);
});

test('the manager guide is listed in the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /can-managers-be-in-a-tip-pool\.html/);
});

test('the manager guide worked example isolates the manager violation and matches calc.mjs', () => {
  // Same dollar figures as the page's own default roster, but with the
  // dishwashers correctly left out of the pool -- so this scenario has
  // exactly one violation (the manager), not two, which is the point of a
  // guide page about the manager rule specifically.
  const managerOnly = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [
      { name: 'Servers', category: 'front', inPool: true, hoursPerWeek: '30', headcount: '6' },
      { name: 'Bartenders', category: 'front', inPool: true, hoursPerWeek: '25', headcount: '2' },
      { name: 'Dishwashers', category: 'back', inPool: false, hoursPerWeek: '35', headcount: '2' },
      { name: 'Shift manager', category: 'manager', inPool: true, hoursPerWeek: '40', headcount: '1' },
    ],
  });
  assert.equal(managerOnly.ok, true);
  assert.equal(managerOnly.violations.length, 1);
  assert.equal(managerOnly.managerViolations.length, 1);
  assert.equal(managerOnly.backOfHouseViolations.length, 0);
  assert.equal(managerOnly.frontHoursPerWeek, 230);
  assert.equal(money(managerOnly.weeklyExposure), '1,177.60');
  assert.equal(money(managerOnly.totalExposure), '4,710.40');
  assert.ok(managerGuide.includes(String(managerOnly.frontHoursPerWeek)), 'guide should quote the front-of-house hours pooled');
  assert.ok(managerGuide.includes(money(managerOnly.weeklyExposure)), 'guide should quote the weekly exposure');
  assert.ok(managerGuide.includes(money(managerOnly.totalExposure)), 'guide should quote the total exposure');
});

test('the manager guide FAQ markup and its FAQ structured data say the same things', () => {
  const ld = managerGuide.match(/"@type":"FAQPage","mainEntity":(\[[\s\S]*\])\}<\/script>/);
  assert.ok(ld, 'the guide should carry FAQPage structured data');
  const questions = JSON.parse(ld[1]);
  const headings = [...managerGuide.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.equal(questions.length, headings.length, 'every structured-data question needs a visible heading');
  for (const q of questions) {
    assert.ok(headings.includes(q.name), `structured data asks "${q.name}" but no visible heading does`);
    assert.ok(managerGuide.includes(q.acceptedAnswer.text), `structured data answer for "${q.name}" is not visible verbatim on the page`);
  }
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
    assert.ok(headings.includes(q.name), `structured data asks "${q.name}" but no visible heading does`);
  }
});

test('every claim the structured data makes about the example is one the arithmetic makes', () => {
  const ld = index.match(/"@type":"FAQPage","mainEntity":(\[[\s\S]*\])\}<\/script>/);
  const blob = JSON.parse(ld[1]).map((q) => q.acceptedAnswer.text).join(' ');
  for (const figure of [money(RESULT.weeklyExposure), money(RESULT.totalExposure)]) {
    assert.ok(blob.includes(figure), `the FAQ answers quote ${figure}, which the calculator must still produce`);
  }
});

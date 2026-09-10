import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./how-many-extinguishers-make-a-site-worth-servicing.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeRouteProfit, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeRouteProfit, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the site and route calculators', () => {
  assert.match(html, /recordEvent\('site-priced'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>site-priced<\/code>, <code>route-check<\/code>, <code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page wires save-and-share for the visit inputs, matching sibling route calculators', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="linkStatus"/);
  assert.match(html, /id="draftStatus"/);
  assert.match(html, /recordEvent\('link-copied'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /DRAFT_KEY = 'fire-extinguisher-inspection-route-margin-visit-draft'/);
});

test('the default site inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="extinguisherCount" type="number" min="0" step="1" value="${DEFAULTS.extinguisherCount}"`));
  assert.ok(result.netProfit > 0);
});

test('the route table has six site rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="siteProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteProfit directly', () => {
  const route = computeRouteProfit([{ monthlyProfit: 18 }, { monthlyProfit: 9 }]);
  assert.ok(route.totalMonthlyProfit > 0);
  assert.match(html, /value="18"/);
  assert.match(html, /value="9"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the disclaimer disclaims a compliance determination, not just a warranty', () => {
  assert.match(html, /does not perform, certify, or replace a professional fire-extinguisher/);
  assert.match(html, /does not determine or record NFPA 10/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, and distinguishes saved/shareable visit inputs from never-saved site rows', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /are saved locally on this device/);
  assert.match(html, /Your site rows are a different promise: they are never saved anywhere/);
});

test('the site result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid site input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateVisit[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateVisit() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every route-table input carries an accessible aria-label', () => {
  const rows = [...html.matchAll(/<input class="siteProfit"[^>]*>/g)];
  assert.equal(rows.length, 6);
  for (const [tag] of rows) {
    assert.match(tag, /aria-label="Site \d monthly profit in dollars"/, `missing aria-label on ${tag}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /fire-extinguisher-inspection-route-margin\/<\/loc>/);
  // The assertion above only ever checked the index, so it passed unchanged
  // the moment a second page joined the tree -- the sitemap could advertise
  // nothing about it and this test, whose name promises otherwise, would stay
  // green. Walk the directory instead of naming files: a third page is then
  // covered the day it lands rather than the day someone remembers.
  for (const file of readdirSync(new URL('./', import.meta.url))) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    assert.ok(
      sitemap.includes(`/fire-extinguisher-inspection-route-margin/${file}<`),
      `${file} exists in the venture but is missing from sitemap.xml`,
    );
  }
});

// --- the break-even guide page -------------------------------------------
//
// The tool answers "what does this site earn"; a searcher asks "is this small
// site worth keeping at all" before they know the tool exists. That question
// is the page, and it is the venture's first non-index surface.

test('the tool links to the break-even guide page', () => {
  assert.match(html, /href="how-many-extinguishers-make-a-site-worth-servicing\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
  // The niche-specific half: this page talks about NFPA 10 cadence, so it must
  // repeat that it does not certify compliance.
  assert.match(guideHtml, /does not determine or record NFPA 10/);
});

test('the guide page worked example matches calc.mjs exactly', () => {
  // Every dollar figure published on that page is asserted here against the
  // calculator that produced it. A fee-default change in calc.mjs then fails
  // this test instead of silently leaving a wrong number on a public page --
  // which is the failure mode a hand-written worked example always has.
  const money = (n) => `$${n.toFixed(2)}`;

  const six = calculate({ ...DEFAULTS, extinguisherCount: 6 });
  assert.equal(money(six.visitRevenue), '$165.24');
  assert.equal(money(six.materialsCost), '$43.68');
  assert.equal(money(six.mileageCost), '$6.03');
  assert.equal(money(six.laborCost), '$25.60');
  assert.equal(money(six.visitProfit), '$89.93');
  assert.equal(six.netProfit.toFixed(2), '-0.51');
  for (const shown of ['$165.24', '$43.68', '$6.03', '$25.60', '$89.93', '&minus;$0.51']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output`);
  }
  // The monthly share of the visit, which is the whole point of the page.
  assert.equal((six.visitProfit / 12).toFixed(2), '7.49');
  assert.ok(guideHtml.includes('$7.49'));

  // The break-even table, row by row.
  const rows = { 4: '-3.53', 5: '-2.02', 6: '-0.51', 7: '1.00', 8: '2.52', 10: '5.54', 12: '8.56', 18: '17.62' };
  for (const [count, monthly] of Object.entries(rows)) {
    const r = calculate({ ...DEFAULTS, extinguisherCount: Number(count) });
    assert.equal(r.netProfit.toFixed(2), monthly, `break-even row for ${count} units drifted`);
  }
  // Break-even really is between 6 and 7 at these defaults, which is the
  // claim the page's headline makes.
  assert.ok(calculate({ ...DEFAULTS, extinguisherCount: 6 }).netProfit < 0);
  assert.ok(calculate({ ...DEFAULTS, extinguisherCount: 7 }).netProfit > 0);

  // The longer-drive comparison.
  const farther = calculate({ ...DEFAULTS, extinguisherCount: 6, driveMinutes: 40, mileage: 22 });
  assert.equal(money(farther.visitProfit), '$72.69');
  assert.equal(farther.netProfit.toFixed(2), '-1.94');
  assert.ok(guideHtml.includes('$72.69') && guideHtml.includes('&minus;$1.94'));

  // The cheaper-recordkeeping lever.
  const lean = calculate({ ...DEFAULTS, extinguisherCount: 6, recordkeepingMonthlyCost: 3 });
  assert.equal(money(lean.netProfit), '$4.49');
  assert.equal(lean.profitMarginPct.toFixed(2), '32.64');
  assert.ok(guideHtml.includes('$4.49') && guideHtml.includes('32.64%'));
});

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: the same recurring stop-based route business priced per
// site after drive time and materials — pool accounts there, inspection stops
// here. Rotating chrome may never pair them, so link explicitly.
test('index links one hop to the pool-route-pricing sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/pool\-route\-pricing\/"/,
    'index must link ../pool-route-pricing/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /pool route pricing calculator/i);
});

test('index links one hop to the medical-courier-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/medical-courier-route-margin\/"/,
    'index must link ../medical-courier-route-margin/ so a crawler reaches that tool in one hop',
  );
});

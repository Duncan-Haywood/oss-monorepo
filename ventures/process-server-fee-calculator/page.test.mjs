import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankClients, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./is-this-process-server-fee-schedule-worth-it.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, rankClients, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, rankClients, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the job and client calculators', () => {
  assert.match(html, /recordEvent\('job-priced'\)/);
  assert.match(html, /recordEvent\('clients-compared'\)/);
  assert.match(html, /<code>job-priced<\/code>, <code>clients-compared<\/code>, <code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page wires save-and-share for the job inputs', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="linkStatus"/);
  assert.match(html, /id="draftStatus"/);
  assert.match(html, /recordEvent\('link-copied'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /DRAFT_KEY = 'process-server-fee-calculator-job-draft'/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  // Regression for the shared-link-clears defect (platform/ci/check_shared_link_clears.py):
  // a plain `{ ...saved, ...fromLink }` merge looks like the link wins and is
  // not -- a field the sender left blank falls through to the recipient's own
  // saved draft instead of being cleared. formValues(fromLink) is what
  // actually clears it.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /applyJobInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
});

test('the default job inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="baseFee" type="number" min="0" step="1" value="${DEFAULTS.baseFee}"`));
  assert.ok(result.netProfit > 0);
});

test('the client comparison table has four rows, all optional', () => {
  const nameInputs = [...html.matchAll(/class="clientName" data-row="(\d)"/g)];
  const profitInputs = [...html.matchAll(/class="clientProfit" data-row="(\d)"/g)];
  assert.equal(nameInputs.length, 4);
  assert.equal(profitInputs.length, 4);
});

test('rankClients on the page defaults matches rankClients directly and picks the higher-profit firm', () => {
  const r = rankClients([{ name: 'Firm A', netProfit: 88.10 }, { name: 'Firm B', netProfit: 40 }]);
  assert.equal(r.best.name, 'Firm A');
  assert.match(html, /value="88\.10"/);
  assert.match(html, /value="40"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not legal or business advice/);
});

test('the disclaimer disclaims a service-of-process validity determination, not just a warranty', () => {
  assert.match(html, /does not determine whether service was validly effected/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, and distinguishes saved/shareable job inputs from never-saved client rows', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /are saved locally on this device/);
  assert.match(html, /Your client comparison rows are a different promise: they are never saved anywhere/);
});

test('the job result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid job input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateJob[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateJob() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every client-row input carries an accessible aria-label', () => {
  const rows = [...html.matchAll(/<input class="client(?:Name|Profit)"[^>]*>/g)];
  assert.equal(rows.length, 8);
  for (const [tag] of rows) {
    assert.match(tag, /aria-label="Client \d (firm or agency name|net profit in dollars)"/, `missing aria-label on ${tag}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /process-server-fee-calculator\/<\/loc>/);
  for (const file of readdirSync(new URL('./', import.meta.url))) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    assert.ok(
      sitemap.includes(`/process-server-fee-calculator/${file}<`),
      `${file} exists in the venture but is missing from sitemap.xml`,
    );
  }
});

// --- the fee-schedule-worth-it guide page --------------------------------
//
// The tool answers "what does this job earn"; a searcher or forum member
// asks "is this fee schedule actually worth it" before they know the tool
// exists. That question is the page.

test('the tool links to the fee-schedule guide page', () => {
  assert.match(html, /href="is-this-process-server-fee-schedule-worth-it\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not legal or business advice/);
  assert.match(guideHtml, /does not determine whether service was validly effected/);
});

test('the guide page worked examples match calc.mjs exactly', () => {
  // Every dollar figure published on that page is asserted here against the
  // calculator that produced it. A default change in calc.mjs then fails this
  // test instead of silently leaving a wrong number on a public page -- which
  // is the failure mode a hand-written worked example always has.
  const money = (n) => `$${n.toFixed(2)}`;

  const good = calculate(DEFAULTS);
  assert.equal(money(good.grossRevenue), '$96.70');
  assert.equal(money(good.vehicleCost), '$3.60');
  assert.equal(money(good.netProfit), '$88.10');
  assert.equal(good.effectiveHourlyRate.toFixed(2), '97.89');
  assert.equal(good.profitMarginPct.toFixed(1), '91.1');
  for (const shown of ['$96.70', '$3.60', '$88.10', '$97.89/hr', '91.1%']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the solid schedule`);
  }

  const lowball = calculate({
    baseFee: 25, attemptsIncluded: 1, attemptsActual: 6, extraAttemptFee: 5,
    rushJob: 0, rushSurchargeFee: 0, skipTraceNeeded: 1, skipTraceFee: 10,
    affidavitFee: 5, milesRoundTrip: 80, milesIncluded: 5, mileageRate: 0.15,
    driveTimeHours: 2.0, onSiteTimeHours: 1.5, paperworkTimeHours: 0.3,
    vehicleCostPerMile: 0.22, fixedJobCost: 8,
  });
  assert.equal(money(lowball.grossRevenue), '$76.25');
  assert.equal(money(lowball.vehicleCost), '$17.60');
  assert.equal(money(lowball.netProfit), '$50.65');
  assert.equal(lowball.effectiveHourlyRate.toFixed(2), '13.33');
  assert.equal(lowball.profitMarginPct.toFixed(1), '66.4');
  for (const shown of ['$76.25', '$17.60', '$50.65', '$13.33/hr', '66.4%']) {
    assert.ok(guideHtml.includes(shown), `${shown} is on the page but not in calc.mjs output for the lowball schedule`);
  }

  // The claim the page's headline makes: the lowball schedule still shows a
  // profit and a decent margin, and still pays a far lower hourly rate.
  assert.ok(lowball.netProfit > 0, 'the lowball schedule never shows a loss on paper');
  assert.ok(lowball.effectiveHourlyRate < good.effectiveHourlyRate);

  const rateGap = (good.effectiveHourlyRate - lowball.effectiveHourlyRate).toFixed(2);
  assert.equal(rateGap, '84.56');
  assert.ok(guideHtml.includes('$84.56/hr'));
});

// Closest sibling: another paid gig-economy legal-support-adjacent
// calculator comparing a flat client offer to what it actually pays per
// hour. Rotating chrome may never pair them, so link explicitly.
test('index links one hop to the notary-trip-quote sibling', () => {
  assert.match(
    html,
    /href="\.\.\/notary-trip-quote\/"/,
    'index must link ../notary-trip-quote/ so a crawler reaches that tool in one hop',
  );
});

test('index links one hop to the medical-courier-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/medical-courier-route-margin\/"/,
    'index must link ../medical-courier-route-margin/ so a crawler reaches that tool in one hop',
  );
});

test('index links one hop to the process-server-day-picker sibling', () => {
  assert.match(html, /href="\.\.\/process-server-day-picker\/"/);
});

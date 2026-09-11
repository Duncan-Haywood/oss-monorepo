import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { NUMERIC_IDS, OPTIONAL_NUMERIC_IDS, ALL_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Shop Rate Calculator/);
  assert.match(markup, /calculateShopRate/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /what-should-i-charge-per-hour\.html/);
  // The disclaimer has to disclaim the specific things this tool looks like it
  // is doing, which is more than the usual set: it handles payroll and comp.
  assert.match(markup, /tax, accounting, insurance/);
  assert.match(markup, /classified or paid/);
});

test('every input the arithmetic reads exists on the form', () => {
  // `readInput` maps over ALL_INPUT_IDS and calls `el(id).value`, so a field
  // named in calc.mjs but absent from the page would throw on the first submit
  // — the button would simply stop working, with the page looking healthy.
  for (const id of ALL_INPUT_IDS) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form input is one the arithmetic knows about', () => {
  // The reverse direction. A field added to the page but not to ALL_INPUT_IDS
  // is silently ignored: the visitor edits it, the rate does not move, and
  // nothing says why.
  const known = new Set([...ALL_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('the page reads and marks the optional fields too, not just the required ones', () => {
  // Both of these iterated NUMERIC_IDS before the current-rate field existed.
  // Leaving either behind is silent: `readInput` would never pass the typed
  // rate to the arithmetic, or a rejected rate would return an error naming a
  // field the page never highlights.
  assert.match(script, /ALL_INPUT_IDS\.map\(id => \[id, el\(id\)\.value\]\)/);
  assert.match(script, /for \(const id of ALL_INPUT_IDS\)/);
  assert.doesNotMatch(script, /NUMERIC_IDS/, 'the page should read the whole form, not only the required half');
  for (const id of OPTIONAL_NUMERIC_IDS) {
    assert.ok(!NUMERIC_IDS.includes(id), `${id} must stay optional — blank is a legitimate state`);
  }
});

test('the comparison block is hidden until a rate is typed, and every slot it fills exists', () => {
  for (const id of ['comparison', 'compareHeadline', 'cmpRate', 'cmpNeeded', 'cmpMargin', 'cmpRequiredHours', 'cmpNotes']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  // An empty comparison panel reads as "no gap", which is the opposite of what
  // a blank field means, so the whole block is hidden rather than blanked.
  assert.match(script, /el\('comparison'\)\.hidden = !comparison;/);
  assert.match(markup, /<div id="comparison"[^>]*hidden>/);
  // And it has to be rendered from the result, not left behind when the rest
  // of the output updates.
  assert.match(script, /renderComparison\(result\.comparison\)/);
});

test('the optional rate field ships a default the browser will accept', () => {
  // `min` is also the step base for `input type=number`: with min="0.01" every
  // valid value differs from 0.01 by a whole number of steps, and a default
  // that does not would block form submission before the page's own handler
  // ever runs. `platform/ci/check_form_defaults.py` checks this repo-wide;
  // this pins the field the comparison depends on.
  const tag = /<input id="currentRatePerHour"[^>]*>/.exec(markup);
  assert.ok(tag, 'the current-rate input should be on the form');
  const attr = name => new RegExp(`${name}="([^"]*)"`).exec(tag[0])?.[1];
  const min = Number(attr('min'));
  const step = Number(attr('step'));
  const value = Number(attr('value'));
  assert.ok(Number.isFinite(value) && value >= min && value <= Number(attr('max')));
  assert.ok(Number.isInteger(Math.round((value - min) / step * 1e6) / 1e6));
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'billRate', 'heroLabel', 'paidHours', 'billableHours', 'utilization',
    'annualCostPerPerson', 'costPerBillableHour', 'burdenRate', 'overheadRate',
    'breakEven', 'billRateRow', 'annualDirectCost', 'annualOverhead',
    'revenueNeeded', 'profitAtTarget', 'warnings', 'notes', 'carryList',
    'carryStatus', 'errorList', 'output', 'problems', 'empty',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('the page carries the rates into the rest of the site', () => {
  assert.ok(ids.has('carryRates'), 'no control writes the computed rates');
  assert.ok(ids.has('forgetRates'), 'no control clears them again');
  assert.match(script, /saveCarriedRates/);
  assert.match(script, /readCarriedRates/);
  assert.match(markup, /every trade bid calculator/i);
});

test('the carry button cannot write a rate that is not on screen', () => {
  // Editing a field clears the last result, so a contractor who changed the wage
  // after computing cannot save the rate the old wage produced.
  assert.match(script, /addEventListener\('input'/);
  assert.match(script, /current = null/);
  assert.match(script, /if \(!current\)/);
});

test('a rate the bid calculators would reject is not offered as one they will take', () => {
  assert.match(script, /carryRates'\)\.disabled = result\.carryWarnings\.length > 0/);
});

test('results are written as text, never as markup', () => {
  // Every value shown comes from numbers the visitor typed. Building any of it
  // with innerHTML would make the form a self-XSS route on a page that also
  // holds the contractor's payroll figures.
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the tool does not read or write a saved bid or a shared link', () => {
  // Deliberate: burden and overhead here are computed, and the site-wide bar and
  // bid links exist to prefill fields. A shop's payroll and overhead are also
  // more than anybody should put in a URL they paste into a chat app.
  assert.doesNotMatch(script, /location\.hash|URLSearchParams|encodeBid/);
});

test('the whole scenario can be saved locally, without ever going through a link', () => {
  // The four carried rates (wage, burden%, overhead%, target margin) already
  // travel to the rest of the site via shop-rates.mjs, but the other fourteen
  // fields (crew size, hours, benefits, every overhead line item) had nowhere
  // to go -- a returning visitor to this calculator itself retyped the whole
  // form every time. This is local-storage-only persistence for the full
  // eighteen-field scenario, deliberately with no URL encoding, so the test
  // above stays true while the retyping problem still gets solved.
  for (const id of ['saveScenario', 'forgetScenario', 'scenarioStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /localStorage\.setItem\(SCENARIO_KEY, JSON\.stringify\(readInput\(\)\)\)/);
  assert.match(script, /localStorage\.removeItem\(SCENARIO_KEY\)/);
  assert.match(script, /writeInputs\(savedScenario\)/);
});

test('a restored scenario is treated as the visitor\'s own, not as the shipped example', () => {
  // Restoring the saved fields and then leaving `showingExample` true would
  // make the carry button demand a fresh press of "Work out my shop rate"
  // before a returning visitor could carry rates they already confirmed once
  // by saving them.
  assert.match(script, /restoredOwnScenario = true/);
  assert.match(script, /if \(restoredOwnScenario\) \{\s*\n\s*current = example;\s*\n\s*showingExample = false;/);
});

test('SEO page answers the search question and does not claim a price table', () => {
  const html = page('what-should-i-charge-per-hour.html');
  assert.match(html, /What should I charge per hour as a contractor\?/i);
  assert.match(html, /not a price list/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  // The two mix-ups the page exists to correct.
  assert.match(html, /margin|markup/i);
  assert.match(html, /direct cost/);
});

test('the worked comparison in the SEO copy is the number the calculator produces', async () => {
  // Prose and arithmetic drift apart silently, and this page's whole claim is
  // that the figures are worked rather than asserted. Every value quoted in the
  // comparison table is recomputed from the form's own defaults, so changing a
  // default or the method fails here instead of shipping copy that contradicts
  // the tool one link away.
  const { calculateShopRate } = await import('./calc.mjs');
  const html = page('what-should-i-charge-per-hour.html');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateShopRate(defaults);
  const { comparison } = result;
  assert.ok(comparison, 'the shipped example should include a current rate to compare');

  const money = n => `$${Math.round(n).toLocaleString('en-US')}`;
  assert.match(html, new RegExp(`\\$${comparison.currentRatePerHour.toFixed(2)} / h`));
  assert.match(html, new RegExp(`\\$${Math.abs(comparison.gapPerHour).toFixed(2)}`));
  assert.match(html, new RegExp(money(Math.abs(comparison.annualGap)).replace('$', '\\$')));
  assert.match(html, new RegExp(`${comparison.marginAtCurrentRate.toFixed(1)}%`));
  assert.match(html, new RegExp(`${Math.round(comparison.requiredBillableHours).toLocaleString('en-US')} h`));
  assert.match(html, new RegExp(`${comparison.requiredUtilization.toFixed(0)}%`));
  // And the point the row exists to make, which is not "your rate is too low".
  assert.match(html, /too low <em>given a billable share<\/em>/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /shop-rate-calculator\/<\/loc>/);
  assert.match(sitemap, /what-should-i-charge-per-hour\.html/);
});

test('the worked example the page ships with actually computes', async () => {
  // The onboarding story is: land on the page, press the button, see a real
  // number. That depends on the shipped defaults producing a result rather than
  // a list of errors.
  const { calculateShopRate } = await import('./calc.mjs');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateShopRate(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.billRatePerHour > 0);
  assert.deepEqual(result.carryWarnings, []);
});

test('the page opens on the worked example rather than an em-dash', async () => {
  // The copy promises "the form opens on a worked example", and the eighteen
  // defaults are that example -- but the answer used to stay behind the button,
  // so a first visit showed `&mdash;` and the example's whole point was
  // invisible. Every sibling bid calculator opens on its own worked result.
  assert.ok(ids.has('exampleNote'), 'the example result needs a note marking it as an example');
  assert.match(script, /const example = calculateShopRate\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /not yours yet/, 'the note must not let the example read as the visitor’s own rate');

  // The figures that render on load are the ones the venture is *for*: a $28
  // wage is $53.76 an hour sold, a 92% burden rather than the remembered 20%.
  const { calculateShopRate } = await import('./calc.mjs');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const example = calculateShopRate(defaults);
  assert.equal(example.ok, true);
  assert.ok(example.burdenRate > 50, 'the shipped example should show a burden far above the remembered 20%');
});

test('opening the page counts nothing and arms nothing', () => {
  // `rate_calculated` is the denominator of this venture's carry-through ratio
  // (`rates_carried` / `rate_calculated`), so counting a page load would inflate
  // it with visitors who never calculated and quietly corrupt the one measure
  // the venture is judged on.
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');

  // And it must not arm the carry button: carrying the example would open all
  // of the trade bid calculators on someone else's shop, which is the exact
  // error this venture exists to stop.
  assert.match(initial[0], /current = null/);
  assert.match(initial[0], /showingExample = true/);
  // Pressing carry while the example is on screen has to explain itself rather
  // than claiming the numbers "have changed", which they have not.
  assert.match(markup, /still the example’s figures/);
  // And a real calculation clears the example state, so the note and the
  // guard message stop applying once the figures are the visitor's own.
  assert.match(script, /render\(result\);\s*\n\s*showingExample = false;/);
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
// what-should-i-charge-per-hour.html was linked from index.html but shipped
// with no og:* tags at all.
test('every published page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected at least the 2 known pages in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
  }
});

// Closest sibling: mutual nearest match per `node platform/pages/siblings.mjs
// --check` — this shop-labor rate calculator and the per-acre custom-farm
// field-work rate calculator. Without a crawlable link here, a crawler
// entering on the shop rate calculator never reaches the farm rate
// calculator in one hop.
test('index links one hop to the custom-farm-rate-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/custom-farm-rate-calculator\/"/,
    'index must link ../custom-farm-rate-calculator/ so crawlers reach the custom farm rate calculator in one hop',
  );
});

// staffing-markup-calculator shipped 2026-09-10 as a crawlable orphan: no tool
// linked to it in one hop, and on the current project-Pages origin the sitemap
// is never read, so a page nothing links to is reachable from nothing. This is
// the closest sibling by subject — both answer "what does an hour of labor
// really cost", one for a crew you employ and one for a worker you place.
test('index links one hop to the staffing-markup-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/staffing-markup-calculator\/"/,
    'index must link ../staffing-markup-calculator/ so crawlers reach the staffing markup calculator in one hop',
  );
});

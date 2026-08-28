import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NUMERIC_IDS } from './calc.mjs';

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
  assert.match(markup, /github.com\/Duncan-Haywood\/monorepo-projects/);
  assert.match(markup, /what-should-i-charge-per-hour\.html/);
  // The disclaimer has to disclaim the specific things this tool looks like it
  // is doing, which is more than the usual set: it handles payroll and comp.
  assert.match(markup, /tax, accounting, insurance/);
  assert.match(markup, /classified or paid/);
});

test('every input the arithmetic reads exists on the form', () => {
  // `readInput` maps over NUMERIC_IDS and calls `el(id).value`, so a field named
  // in calc.mjs but absent from the page would throw on the first submit — the
  // button would simply stop working, with the page looking healthy.
  for (const id of NUMERIC_IDS) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form input is one the arithmetic knows about', () => {
  // The reverse direction. A field added to the page but not to NUMERIC_IDS is
  // silently ignored: the visitor edits it, the rate does not move, and nothing
  // says why.
  const known = new Set([...NUMERIC_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
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

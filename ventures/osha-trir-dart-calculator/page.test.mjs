import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ALL_INPUT_IDS, REQUIRED_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /OSHA TRIR/);
  assert.match(markup, /calculateRates/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-to-calculate-trir\.html/);
  // The disclaimer has to name what this tool looks like it might be doing
  // and is not: an OSHA recordability or compliance determination.
  assert.match(markup, /does not determine whether any case is OSHA recordable/);
  assert.match(markup, /29 CFR 1904\.7/);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of ALL_INPUT_IDS) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form input is one the arithmetic knows about', () => {
  const known = new Set([...ALL_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('the page reads the whole form', () => {
  assert.match(script, /ALL_INPUT_IDS\.map\(id => \[id, el\(id\)\.value\]\)/);
  assert.match(script, /for \(const id of ALL_INPUT_IDS\)/);
});

test('every required field is on the form', () => {
  for (const id of REQUIRED_INPUT_IDS) assert.ok(ids.has(id), `missing required #${id}`);
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'trirOut', 'heroLabel', 'trirValue', 'dartValue', 'nonDartOut', 'hoursOut',
    'targetOut', 'gapOut', 'targetBox', 'targetHero', 'notes',
    'errorList', 'output', 'problems', 'empty',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  // Every value shown comes from numbers the visitor typed. Building any of
  // it with innerHTML would make the form a self-XSS route.
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /osha-trir-dart-calculator\/<\/loc>/);
  assert.match(sitemap, /how-to-calculate-trir\.html/);
});

test('the worked example the page ships with actually computes', async () => {
  const { calculateRates } = await import('./calc.mjs');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateRates(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.trir > 0);
});

test('the page opens on the worked example rather than an em-dash', async () => {
  assert.ok(ids.has('exampleNote'), 'the example result needs a note marking it as an example');
  assert.match(script, /const example = calculateRates\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /not yours yet/, 'the note must not let the example read as the visitor’s own numbers');
});

test('an edit updates the figure on screen rather than leaving the last one standing', () => {
  const listener = /addEventListener\('input', \(\) => \{[\s\S]*?\n    \}\);/.exec(script);
  assert.ok(listener, 'expected an input listener on the form');
  assert.match(listener[0], /calculateRates\(readInput\(\)\)/);
  assert.match(listener[0], /render\(result\)/);
  assert.doesNotMatch(listener[0], /showProblems/);
});

test('opening the page counts nothing', () => {
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');
});

test('a calculation counts once, and the target-dilution figure counts separately', () => {
  assert.match(script, /count\('rate_calculated'\)/);
  assert.match(script, /count\('target_dilution_shown'\)/);
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected at least the 2 known pages in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /no warranty/i, `${name} is missing the no-warranty clause`);
  }
});

// Closest sibling: a contractor pricing the job this rate is reported
// against. Related-tool chrome does not cover this venture automatically
// (no shared slug words), so without an explicit one-hop link a crawler
// landing here never reaches a peer venture, and the reverse link is what
// keeps this page from being a crawlable orphan.
test('index links one hop to the asbestos-abatement-bid-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/asbestos-abatement-bid-calculator\/"/,
    'index must link ../asbestos-abatement-bid-calculator/ so crawlers reach it in one hop',
  );
});

test('the worked example in the how-to page matches what the calculator computes', async () => {
  // Prose and arithmetic drift apart silently, so every figure quoted in the
  // worked example is recomputed here from the same numbers used in the
  // copy, rather than asserted by eye.
  const { calculateRates } = await import('./calc.mjs');
  const html = page('how-to-calculate-trir.html');
  const result = calculateRates({
    recordableCases: 6, dartCases: 2, totalHoursWorked: 120000, targetTrir: 3.0, avgHoursPerMonth: '',
  });
  assert.equal(result.ok, true);
  assert.match(html, new RegExp(result.trir.toFixed(2)));
  assert.match(html, new RegExp(result.dartRate.toFixed(2)));
  assert.match(html, new RegExp(String(result.nonDartRecordableCases)));
  assert.match(html, new RegExp(result.gapVsTarget.toFixed(2)));
  assert.ok(html.includes(`${Math.round(result.extraHoursToTarget).toLocaleString('en-US')} additional injury-free hours`));
});

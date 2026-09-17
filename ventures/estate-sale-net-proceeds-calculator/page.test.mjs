import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateSettlement, compareQuotes, INPUT_IDS, B_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Estate Sale Net Proceeds Calculator/);
  assert.match(markup, /calculateSettlement/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Everything runs in your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /not legal, tax, financial, or estate-planning advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by any specific estate sale company/i);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of [...INPUT_IDS, ...B_INPUT_IDS]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form number input is one the arithmetic knows about', () => {
  const known = new Set([...INPUT_IDS, ...B_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'netOut', 'heroLabel', 'commissionOut', 'feesOut', 'retainedOut', 'netOut2',
    'notes', 'errorList', 'output', 'problems', 'exampleNote',
    'compareResult', 'compareAOut', 'compareBOut', 'compareDiffOut', 'compareNotes',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /estate-sale-net-proceeds-calculator\/<\/loc>/);
});

test('the worked example the page ships with actually computes', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateSettlement(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.commission, 3100);
  assert.equal(result.net, 6400);
});

test('the default comparison actually computes and matches the hand-verified $400 gap', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = compareQuotes(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.difference, -400);
  assert.equal(result.better, 'b');
});

test('the page opens on the worked example rather than an em-dash', () => {
  assert.ok(ids.has('exampleNote'));
  assert.match(script, /const example = calculateSettlement\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /Worked example, not your quote yet/);
});

test('an edit updates the settlement on screen rather than leaving the last one standing', () => {
  const listener = /el\('settlementForm'\)\.addEventListener\('input', \(\) => \{[\s\S]*?\n    \}\);/.exec(script);
  assert.ok(listener, 'expected an input listener on the settlement form');
  assert.match(listener[0], /calculateSettlement\(readInput\(\)\)/);
  assert.match(listener[0], /render\(result\)/);
  assert.doesNotMatch(listener[0], /showProblems/);
  assert.doesNotMatch(listener[0], /count\(/);
});

test('opening the page counts nothing', () => {
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');
});

test('every FAQPage question is also visible copy', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const faq = blocks.map(b => JSON.parse(b[1])).find(j => j['@type'] === 'FAQPage');
  assert.ok(faq, 'expected a FAQPage JSON-LD block');
  for (const entity of faq.mainEntity) {
    assert.match(markup, new RegExp(entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('index links one hop to the poshmark-fee-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/poshmark-fee-calculator\/"/,
    'index must link ../poshmark-fee-calculator/ so a reader lands on a sibling in one hop',
  );
});

test('comparing quotes is counted as its own usage event', () => {
  assert.match(script, /count\('quotes_compared'\)/);
  assert.match(script, /count\('settlement_calculated'\)/);
});

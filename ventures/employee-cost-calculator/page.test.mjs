import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ALL_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Employee vs\. Contractor Cost Calculator/);
  assert.match(markup, /compareCosts/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  // The disclaimer has to name what this tool looks like it might be doing
  // and is not: a legal worker-classification determination.
  assert.match(markup, /does not determine, and is not evidence toward, whether any worker should be classified/);
  assert.match(markup, /common-law test/);
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

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'gapOut', 'heroLabel', 'winnerOut', 'wagesOut', 'burdenOut', 'burdenPctOut',
    'empOngoingOut', 'empYear1Out', 'empHourlyOut', 'contOngoingOut', 'contYear1Out',
    'contHourlyOut', 'targetBox', 'breakEvenOut', 'notes',
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

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /employee-cost-calculator\/<\/loc>/);
});

test('the worked example the page ships with actually computes', async () => {
  const { compareCosts } = await import('./calc.mjs');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = compareCosts(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.employeeOngoingAnnualCost > 0);
  assert.ok(result.contractorOngoingAnnualCost > 0);
});

test('the page opens on the worked example rather than an em-dash', async () => {
  assert.ok(ids.has('exampleNote'), 'the example result needs a note marking it as an example');
  assert.match(script, /const example = compareCosts\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /not yours yet/, 'the note must not let the example read as the visitor’s own numbers');
});

test('an edit updates the figure on screen rather than leaving the last one standing', () => {
  const listener = /addEventListener\('input', \(\) => \{[\s\S]*?\n    \}\);/.exec(script);
  assert.ok(listener, 'expected an input listener on the form');
  assert.match(listener[0], /compareCosts\(readInput\(\)\)/);
  assert.match(listener[0], /render\(result\)/);
  assert.doesNotMatch(listener[0], /showProblems/);
});

test('opening the page counts nothing', () => {
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');
});

test('a calculation counts once, and the break-even figure counts separately', () => {
  assert.match(script, /count\('cost_compared'\)/);
  assert.match(script, /count\('break_even_shown'\)/);
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 1, 'expected at least the known page in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /no warranty/i, `${name} is missing the no-warranty clause`);
  }
});

// Closest sibling: a staffing agency pricing a placement it bills to a
// client, rather than a business staffing a role itself — the same
// employer-burden arithmetic, applied on the other side of who pays it.
// Related-tool chrome does not reliably cover a brand-new venture on its
// first commit, so without an explicit one-hop link a crawler landing here
// has no route to the closest peer in the whole catalogue.
test('index links one hop to the staffing-markup-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/staffing-markup-calculator\/"/,
    'index must link ../staffing-markup-calculator/ so crawlers reach it in one hop',
  );
});

test('notes never claim a worker-classification verdict', () => {
  // The disclaimer itself says "does not determine ... whether any worker
  // should be classified as ..." -- a negation, not a verdict -- so this
  // checks the rendered result copy (`.winner`/`.note-list` markup) rather
  // than the whole page, which would also match the disclaimer's own denial.
  const resultCopy = /<div id="output"[\s\S]*?<\/div>\s*<\/div>/.exec(markup)?.[0] ?? '';
  assert.doesNotMatch(resultCopy, /is legally an employee|is legally a contractor|is the correct classification/i);
});

test("the employee cost calculator links to the workers comp premium calculator", async () => {
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/workers-comp-premium-calculator\/"/);
});

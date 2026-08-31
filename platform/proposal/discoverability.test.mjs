// The proposal has to be findable, and the claim has to be true.
//
// All 100 adopting calculators shipped the customer proposal without naming it
// in their JSON-LD `featureList` — the machine-readable list of what a tool does,
// and what a search engine or an AI assistant reads when someone asks for
// something that prints a contractor's quote. The portfolio's largest feature
// was invisible to the only channel that brings these tools traffic.
//
// Two directions are held down here, and the second matters more than the first:
//
//   - a calculator that ships the proposal should say so, and
//   - a calculator that does NOT ship it must never claim it.
//
// The second is the one that would be a lie to a customer arriving from search.
// `mobile-detailing` used to be the live case for it — held back on the reading
// that its inputs describe no work — and it has since adopted, because for that
// trade the hours and the round trip *are* the work (see the module README). So
// no calculator is currently in that state, and the guard stands for the next
// one that lands without a proposal rather than for a venture named here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const VENTURES = new URL('../../ventures/', import.meta.url);
const CLAIM = /printable customer proposal/i;

/** Every `featureList` string in the document, however the JSON-LD is nested. */
function featureLists(node, found = []) {
  if (Array.isArray(node)) node.forEach((item) => featureLists(item, found));
  else if (node && typeof node === 'object') {
    // Some pages wrap their nodes in `@graph` rather than putting the
    // SoftwareApplication at the top level, so this walks rather than indexes.
    if (typeof node.featureList === 'string') found.push(node.featureList);
    Object.values(node).forEach((value) => featureLists(value, found));
  }
  return found;
}

async function calculators() {
  const entries = await readdir(VENTURES, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let html;
    try {
      html = await readFile(new URL(`${entry.name}/index.html`, VENTURES), 'utf8');
    } catch {
      continue;
    }
    const lists = [];
    for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let parsed;
      try {
        parsed = JSON.parse(block[1]);
      } catch (error) {
        assert.fail(`${entry.name}: JSON-LD does not parse — ${error.message}`);
      }
      lists.push(...featureLists(parsed));
    }
    // The vendored module is the marker: a page that imports it can print one.
    pages.push({ slug: entry.name, shipsProposal: html.includes('proposalDoc'), lists });
  }
  return pages;
}

const PAGES = await calculators();

test('a calculator never advertises a proposal it cannot print', async () => {
  const liars = PAGES
    .filter((page) => !page.shipsProposal && page.lists.some((list) => CLAIM.test(list)))
    .map((page) => page.slug);
  assert.deepEqual(liars, [],
    'these pages claim a customer proposal in their structured data but do not ship one');
});

test('every calculator that ships the proposal names it in its featureList', async () => {
  const silent = PAGES
    .filter((page) => page.shipsProposal && page.lists.length > 0)
    .filter((page) => !page.lists.some((list) => CLAIM.test(list)))
    .map((page) => page.slug);
  assert.deepEqual(silent, [],
    'these pages ship the proposal but do not name it where a search engine or an AI assistant reads');
});

test('the claim appears once per feature list, not once per adoption batch', async () => {
  // Appending is how this gets maintained, and appending twice is how a
  // feature list turns into a keyword-stuffed sentence over three batches.
  const repeated = PAGES
    .flatMap((page) => page.lists.map((list) => ({ slug: page.slug, list })))
    .filter(({ list }) => (list.match(new RegExp(CLAIM.source, 'gi')) || []).length > 1)
    .map(({ slug }) => slug);
  assert.deepEqual(repeated, [], 'these feature lists name the proposal more than once');
});

test('the adopted set is what the module README says it is', async () => {
  // Keeps the README's "deliberately not adopted" note honest as batches land.
  const readme = await readFile(new URL('./README.md', import.meta.url), 'utf8');
  const shipping = PAGES.filter((page) => page.shipsProposal).map((page) => page.slug);
  const bidCalculators = PAGES.filter((page) => page.slug.endsWith('-bid-calculator'));
  const withoutProposal = bidCalculators.filter((page) => !page.shipsProposal).map((page) => page.slug);
  assert.ok(shipping.length > 0, 'no calculator ships the proposal at all');
  for (const slug of withoutProposal) {
    assert.match(readme, new RegExp(`\`${slug.replace('-bid-calculator', '')}\``),
      `${slug} does not ship the proposal and the README does not say why`);
  }
});

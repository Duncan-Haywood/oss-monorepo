import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { optimizeCutList } from './calc.mjs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = read('vs-planning-cuts-by-hand.html');
const index = read('index.html');

test('index links to the planning-by-hand comparison page', () => {
  assert.match(index, /vs-planning-cuts-by-hand\.html/);
});

test('carries the standard disclaimers and no-warranty clause', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /"@type":"FAQPage"/);
});

test('makes no dollar-figure claim about a named vendor', () => {
  // Generic-method comparison (planning by hand), exempt from the
  // not-affiliated clause -- see COMPARISON_DISCLAIMER_EXEMPT in
  // platform/pages/clauses.mjs. It links to vs-opticutter-and-cutlist-optimizer.html
  // by name, which is a cross-link, not a comparison claim.
  assert.doesNotMatch(html, /optiCutter[^<]*\$\d/);
  assert.doesNotMatch(html, /CutList Optimizer[^<]*\$\d/);
});

test('the comparison page is linked from the tool page and listed in the sitemap, not orphaned', () => {
  assert.match(index, /href="vs-planning-cuts-by-hand\.html"/);
  assert.match(read('sitemap.xml'), /vs-planning-cuts-by-hand\.html/);
});

test('the comparison page links back to the calculator and both sibling comparison pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="compare-4x8-vs-5x5\.html"/);
  assert.match(html, /href="vs-opticutter-and-cutlist-optimizer\.html"/);
});

test('the worked 24-part example matches calc.mjs for the stated inputs', () => {
  const stockLength = 96;
  const kerf = 0.125;
  const cuts = [22, 22, 22, 22, 22, 22, 34, 34, 34, 34, 34, 34, 34, 34, 46, 46, 46, 46, 46, 46, 58, 58, 58, 58];
  const optimized = optimizeCutList({ stockLength, kerf, cuts, stockCost: 42 });

  assert.equal(optimized.bars.length, 10);
  assert.equal(optimized.totalCost, 420);
  assert.equal(Math.round(optimized.utilization * 1000) / 10, 95);
  assert.equal(Math.round(optimized.waste * 100) / 100, 46.25);

  // Naive first-fit in ticket order (no sort), same algorithm as
  // optimizeCutList's bin placement but without holding boards open across
  // part types -- the "planning by hand" comparison the page describes.
  function naiveFirstFit(list, length, k) {
    const bins = [];
    for (const cut of list) {
      let placed = false;
      for (const bin of bins) {
        const added = cut + (bin.cuts.length ? k : 0);
        if (bin.remaining >= added) {
          bin.cuts.push(cut);
          bin.remaining -= added;
          placed = true;
          break;
        }
      }
      if (!placed) bins.push({ cuts: [cut], remaining: length - cut });
    }
    return bins;
  }
  const naive = naiveFirstFit(cuts, stockLength, kerf);
  const naiveTotalCuts = cuts.reduce((s, c) => s + c, 0);
  const naiveKerf = (cuts.length - naive.length) * kerf;
  const naiveUtilization = naiveTotalCuts / (naive.length * stockLength);
  const naiveWaste = naive.length * stockLength - naiveTotalCuts - naiveKerf;
  const naiveCost = naive.length * 42;

  assert.equal(naive.length, 13);
  assert.equal(naiveCost, 546);
  assert.equal(Math.round(naiveUtilization * 1000) / 10, 73.1);
  assert.equal(Math.round(naiveWaste * 100) / 100, 334.63);

  assert.match(html, /\b13\b/);
  assert.match(html, /73\.1%/);
  assert.match(html, /334\.63"/);
  assert.match(html, /\$546\.00/);
  assert.match(html, /\b10\b/);
  assert.match(html, /95\.0%/);
  assert.match(html, /46\.25"/);
  assert.match(html, /\$420\.00/);
  assert.match(html, /\$126/);
});

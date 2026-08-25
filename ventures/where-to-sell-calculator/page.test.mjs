// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to:
//
//   1. A column added to <thead> without a matching cell in the row template
//      (or the reverse) silently shifts every value one column left or right.
//      Nothing throws; the table just quietly reports margin under "Gives up".
//   2. calc.mjs can compute a figure that index.html never renders. That is
//      not hypothetical: `breakEvenPrice` and `roi` were computed and unit
//      tested from the first commit, were named in the page's own schema.org
//      `featureList`, and were absent from the table until they were added
//      here. The product under-delivered against its own machine-readable
//      description, and no test noticed.
//
// Kept dependency-free (no jsdom, no browser) so CI stays a plain
// `node --test`, matching cut-list-optimizer/page.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Raw-text elements are not parsed as markup, so an unclosed one discards the
// rest of the document without any parse error. Split them out before counting
// anything, so markup buried inside a <script> template literal is not mistaken
// for markup the browser would render, and vice versa.
function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

// The <tr> the results table builds for each channel, lifted out of update().
const rowTemplate = scriptSource.match(/<tr class="\$\{result\.isBest[\s\S]*?<\/tr>/);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
});

test('the results row template exists', () => {
  assert.ok(rowTemplate, 'could not find the per-channel <tr> template in update(); the tests below cannot check column alignment without it');
});

test('every results column has a cell, and every cell has a column', () => {
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  // One <th scope="row"> (the channel name) plus the <td>s.
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;

  assert.ok(headers.length > 0, 'no column headers found');
  assert.equal(
    cells,
    headers.length,
    `the results table declares ${headers.length} columns (${headers.join(' | ')}) but the row template emits ${cells} cells — ` +
      'every value after the mismatch renders under the wrong heading',
  );
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');

  // Each advertised figure, and the calc.mjs field the page must render for
  // that claim to be true. featureList is what search engines and AI
  // assistants read as the product's capability list, so a claim here that the
  // page cannot back is an overclaim to the people deciding whether to visit.
  const claims = [
    ['margin', /result\.margin/],
    ['ROI', /result\.roi/],
    ['break-even price', /result\.breakEvenPrice/],
    ['price needed to match the best channel', /result\.priceToMatchBest/],
    ['net profit per channel', /result\.profit/],
    ['profit per day', /result\.profitPerDay/],
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"; update this test or restore the claim`,
    );
    assert.match(
      rowTemplate[0],
      rendered,
      `featureList advertises "${claim}" but the results row never renders ${rendered} — the page under-delivers against its own description`,
    );
  }
});

test('figures that can be absent are rendered defensively', () => {
  // calc.mjs returns null for these rather than a misleading number: roi when
  // no cash was invested (infinite return), priceToMatchBest on the winning
  // channel (the question is meaningless). Rendering null unguarded prints
  // "null%" or throws on .toFixed.
  assert.match(
    rowTemplate[0],
    /result\.roi === null/,
    'roi is null when nothing was invested; render a placeholder instead of calling .toFixed on null',
  );
  assert.match(
    rowTemplate[0],
    /result\.priceToMatchBest === null/,
    'priceToMatchBest is null on the best channel; render a placeholder instead of formatting null',
  );
  assert.match(
    rowTemplate[0],
    /result\.profitPerDay === null/,
    'profitPerDay is null when no days-to-sell was given; render a placeholder instead of formatting null',
  );
  assert.match(
    rowTemplate[0],
    /result\.daysToSell === null/,
    'daysToSell is null when no pace was given; render a placeholder instead of a blank cell',
  );
});

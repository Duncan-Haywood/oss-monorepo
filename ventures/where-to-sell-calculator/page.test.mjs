// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to:
//
//   1. A column added to <thead> without a matching entry in resultCells() (or
//      the reverse) silently shifts every value one column left or right.
//      Nothing throws; the table just quietly reports margin under "Gives up".
//      Below ~700px the same declaration supplies the label printed beside each
//      figure in card mode, so drift there mislabels the number outright.
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

// The body of resultCells(), which declares one [label, value, class] tuple per
// value column. Below ~700px the table is restyled into one card per channel
// and these labels are what the reader sees beside each number, so they must
// stay in step with <thead>.
const cellsSource = scriptSource.match(/function resultCells\(result\) \{[\s\S]*?\n    \}/);

// The label (first element) of each declared tuple, in order.
const declaredLabels = cellsSource
  ? [...cellsSource[0].matchAll(/^\s*\["([^"]+)",/gm)].map((m) => m[1])
  : [];

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
});

test('the results row template exists', () => {
  assert.ok(rowTemplate, 'could not find the per-channel <tr> template in update(); the tests below cannot check column alignment without it');
});

test('the results cell declaration exists', () => {
  assert.ok(cellsSource, 'could not find resultCells() in the page script');
  assert.ok(declaredLabels.length > 0, 'resultCells() declares no labelled cells');
});

test('card labels match the column headings, in order', () => {
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());

  assert.ok(headers.length > 0, 'no column headers found');
  // The first column is the channel name, rendered as each row's <th
  // scope="row"> rather than as a value cell, so it has no tuple.
  assert.deepEqual(
    declaredLabels,
    headers.slice(1),
    'the labels rendered beside each figure in card mode have drifted from the table headings — ' +
      'on a wide screen the value would sit under one heading and on a phone be captioned with another',
  );
});

test('the row renders every declared cell, with its label as real text', () => {
  assert.match(
    rowTemplate[0],
    /resultCells\(result\)/,
    'the row template no longer builds its cells from resultCells(); the label/heading check above would then be checking a declaration nothing renders',
  );
  // A CSS ::before label is decorative content that assistive technology may
  // not announce. In card mode the label is the only thing identifying the
  // number, so it has to be in the markup.
  assert.match(
    rowTemplate[0],
    /class="cell-label"/,
    'cell labels must be real elements, not CSS-generated content, so they are readable in card mode',
  );
});

test('card mode is actually reachable', () => {
  // The card layout is pure CSS; if the media query or the block-display rule
  // is dropped, the page silently reverts to a nine-column table dragged
  // sideways on a phone, and nothing else in this suite would notice.
  const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ''])[1];
  const cardQuery = style.match(/@media \(max-width: 700px\) \{[\s\S]*?\n    \}/);
  assert.ok(cardQuery, 'the narrow-screen card layout media query is missing');
  assert.match(cardQuery[0], /tbody tr[\s\S]*?display: block|display: block[\s\S]*?tbody tr/,
    'card mode must switch the table rows to block layout');
  assert.match(cardQuery[0], /\.cell-label \{[^}]*display: inline/,
    'card mode must reveal the per-cell labels hidden on wide screens');
  // Switching the table to block display leaves <caption> shrink-wrapping to
  // its longest word, which renders the sentence as a one-word-wide column.
  // Caught in a phone screenshot, not by any assertion, so pin it here.
  assert.match(cardQuery[0], /caption \{[^}]*display: block/,
    'card mode must give <caption> block display, or it renders as a vertical sliver of text');
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
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"; update this test or restore the claim`,
    );
    assert.match(
      cellsSource[0],
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
    cellsSource[0],
    /result\.roi === null/,
    'roi is null when nothing was invested; render a placeholder instead of calling .toFixed on null',
  );
  assert.match(
    cellsSource[0],
    /result\.priceToMatchBest === null/,
    'priceToMatchBest is null on the best channel; render a placeholder instead of formatting null',
  );
});

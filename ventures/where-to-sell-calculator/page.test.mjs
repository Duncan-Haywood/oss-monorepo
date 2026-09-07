// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to:
//
//   1. A column added to <thead> without a matching entry in resultCells() (or
//      the reverse) silently shifts every value one column left or right.
//      Below ~700px the same declaration supplies the label printed beside each
//      figure in card mode, so drift there mislabels the number outright.
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
import { readFileSync, readdirSync } from 'node:fs';
import { CHANNEL_PRESETS, calculateChannel, compareChannels } from './calc.mjs';
import { HANDOFFS } from './handoff.mjs';

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

// The body of resultCells() / shelfCells(), which declares one
// [label, value, class] tuple per value column. Below ~700px the table is
// restyled into one card per channel and the same labels print beside each
// figure. The <tr> templates must still call those helpers so this check is
// not verifying a declaration nothing renders.
const keepCellsSource = scriptSource.match(/function resultCells\([\s\S]*?\n    \}/);
const shelfCellsSource = scriptSource.match(/function shelfCells\([\s\S]*?\n    \}/);
const rowTemplate = scriptSource.match(/<tr class="\$\{result\.isBest[\s\S]*?<\/tr>/);
const shelfRowTemplate = scriptSource.match(/<tr class="\$\{result\.isShelfBest[\s\S]*?<\/tr>/);

const labelsFrom = (source) =>
  [...(source || '').matchAll(/\["([^"]+)",/g)].map((match) => match[1]);

// Shelf-time headers carry data-table="shelf"; the keep table's do not.
const headersFor = (table) =>
  [...markup.matchAll(/<th scope="col"([^>]*)>([\s\S]*?)<\/th>/g)]
    .filter((match) => (table === 'shelf') === match[1].includes('data-table="shelf"'))
    .map((match) => match[2].replace(/\s+/g, ' ').trim());

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
});

test('the results row templates exist', () => {
  assert.ok(rowTemplate, 'could not find the per-channel <tr> template in update(); the tests below cannot check column alignment without it');
  assert.ok(shelfRowTemplate, 'could not find the shelf-time <tr> template in update()');
  assert.ok(keepCellsSource, 'could not find resultCells() in the page script');
  assert.ok(shelfCellsSource, 'could not find shelfCells() in the page script');
});

test('the keep and shelf rows actually render the labelled cells', () => {
  assert.match(
    rowTemplate[0],
    /resultCells\(result/,
    'the keep row template no longer builds its cells from resultCells(); the label/heading check would then be checking a declaration nothing renders',
  );
  assert.match(
    shelfRowTemplate[0],
    /shelfCells\(result/,
    'the shelf row template no longer builds its cells from shelfCells()',
  );
  assert.match(
    scriptSource,
    /function renderCells[\s\S]*cell-label/,
    'cell labels must be real elements, not CSS-generated content, so they are readable in card mode',
  );
});

for (const [table, source] of [['keep', keepCellsSource], ['shelf', shelfCellsSource]]) {
  test(`every ${table} column has a labelled cell, and every labelled cell has a column`, () => {
    const headers = headersFor(table);
    const valueHeaders = headers.slice(1);
    const labels = labelsFrom(source ? source[0] : '');

    assert.ok(headers.length > 0, `no column headers found for the ${table} table`);
    assert.deepEqual(
      labels,
      valueHeaders,
      `the ${table} card labels drifted from the table headings — ` +
        'on a wide screen the value would sit under one heading and on a phone be captioned with another',
    );
  });
}

test('card mode is actually reachable', () => {
  // The card layout is pure CSS; if the media query or the block-display rule
  // is missing, the seller is back to dragging a fourteen-column table
  // sideways on a phone, and nothing else in this suite would notice.
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const cardQuery = style.match(/@media \(max-width: 700px\) \{[\s\S]*?\n    \}/);
  assert.ok(cardQuery, 'the narrow-screen card layout media query is missing');
  assert.match(cardQuery[0], /tbody tr[\s\S]*?display: block|display: block[\s\S]*?tbody tr/,
    'card mode must switch the table rows to block layout');
  assert.match(cardQuery[0], /\.cell-label \{[^}]*display: inline/,
    'card mode must reveal the per-cell labels hidden on wide screens');
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
    ['orders needed to cover a monthly plan', /result\.ordersToCoverPlan/],
    ['price needed to match the best channel', /result\.priceToMatchBest/],
    ['net profit per channel', /result\.profit/],
    ['expected monthly profit', /result\.monthlyProfit/],
    ['profit per day', /result\.profitPerDay/],
    ['expected profit after returns', /result\.expectedProfit/],
    ['listing value per month of shelf time', /result\.velocity\.valuePer30Days/],
    ['sell-through needed to match the fastest channel', /result\.sellThroughToMatchBest/],
  ];

  const renderedSource = keepCellsSource[0] + shelfCellsSource[0];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"; update this test or restore the claim`,
    );
    assert.match(
      renderedSource,
      rendered,
      `featureList advertises "${claim}" but neither results row renders ${rendered} — the page under-delivers against its own description`,
    );
  }
});

test('the shelf-time explainer publishes figures the calculator still produces', () => {
  // A worked example is a claim about this tool's output. When a rate or a
  // default moves, the page keeps quoting the old numbers and becomes wrong
  // for every reader — including the search engines and assistants that quote
  // it. Regenerate the page when this fails; do not relax the assertion.
  const page = readFileSync(new URL('./does-it-actually-sell-there.html', import.meta.url), 'utf8');
  const shared = {
    price: 48, shippingCharged: 6, shippingCost: 5, itemCost: 14,
    packagingCost: 1, otherCost: 0, monthlyOrders: 100,
    horizonDays: 90, capitalCostPct: 12,
  };
  const comparison = compareChannels(
    ['ebay', 'etsy'].map((id) => CHANNEL_PRESETS.find((channel) => channel.id === id)),
    shared,
  );
  const ebay = comparison.results.find((result) => result.id === 'ebay');
  const etsy = comparison.results.find((result) => result.id === 'etsy');

  const quoted = [
    [`$${ebay.expectedProfit.toFixed(2)}`, 'eBay expected keep'],
    [`$${etsy.expectedProfit.toFixed(2)}`, 'Etsy expected keep'],
    [`$${ebay.velocity.valuePer30Days.toFixed(2)}`, 'eBay per 30 days'],
    [`$${etsy.velocity.valuePer30Days.toFixed(2)}`, 'Etsy per 30 days'],
    [`$${etsy.velocity.listedValue.toFixed(2)}`, 'Etsy listing value'],
    [`$${(etsy.expectedProfit - ebay.expectedProfit).toFixed(2)}`, 'the after-returns gap'],
    [`${etsy.sellThroughToMatchBest.toFixed(1)}%`, 'the sell-through Etsy needs to match eBay'],
  ];
  for (const [figure, what] of quoted) {
    assert.ok(page.includes(figure), `the explainer no longer quotes ${figure} for ${what}`);
  }
  assert.equal(comparison.best.id, 'etsy', 'the explainer says Etsy keeps more per sale');
  assert.equal(comparison.shelf.id, 'ebay', 'the explainer says eBay earns more per month of shelf');
});

test('the shelf-time explainer is linked and indexable', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.ok(sitemap.includes('does-it-actually-sell-there.html'), 'the new page is missing from the sitemap');
  assert.ok(markup.includes('does-it-actually-sell-there.html'), 'nothing on the calculator links to it');
});

test('every shared input the calculator reads is on the page and in the share link', () => {
  // calc.mjs reading a `shared` key that index.html never collects means the
  // page silently runs on the function default while the user has no way to
  // change it; a key the share link omits means the recipient sees different
  // numbers. Both failures are invisible without this check.
  const calc = readFileSync(new URL('./calc.mjs', import.meta.url), 'utf8');
  const share = readFileSync(new URL('./share.mjs', import.meta.url), 'utf8');
  const readByCalc = new Set([...calc.matchAll(/\bshared\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]));
  // Toggles/modes, not numeric inputs: they ride the link as their own
  // boolean or string field rather than through the numeric SHARED_FIELDS
  // list, and are covered by their own dedicated round-trip tests instead.
  for (const flag of ['includeSubscription', 'includeReturns', 'rankBy']) readByCalc.delete(flag);

  for (const key of readByCalc) {
    assert.match(
      scriptSource,
      new RegExp(`["']${key}["']`),
      `calc.mjs reads shared.${key} but index.html never collects it — the page is stuck on the default`,
    );
    assert.match(
      share,
      new RegExp(`["']${key}["']`),
      `calc.mjs reads shared.${key} but share.mjs drops it — a shared link would compute different numbers`,
    );
  }
});

test('figures that can be absent are rendered defensively', () => {
  // calc.mjs returns null for these rather than a misleading number: roi when
  // no cash was invested (infinite return), priceToMatchBest on the winning
  // channel (the question is meaningless). Rendering null unguarded prints
  // "null%" or throws on .toFixed.
  assert.match(
    keepCellsSource[0],
    /result\.roi === null/,
    'roi is null when nothing was invested; render a placeholder instead of calling .toFixed on null',
  );
  assert.match(
    keepCellsSource[0],
    /result\.priceToMatchBest === null/,
    'priceToMatchBest is null on the best channel; render a placeholder instead of formatting null',
  );
  assert.match(
    keepCellsSource[0],
    /result\.ordersToCoverPlan === null/,
    'ordersToCoverPlan is null when the unit economics cannot recover a plan; render a placeholder',
  );
  assert.match(
    keepCellsSource[0],
    /result\.profitPerDay === null/,
    'profitPerDay is null when no days-to-sell was given; render a placeholder instead of formatting null',
  );
  assert.match(
    keepCellsSource[0],
    /result\.daysToSell === null/,
    'daysToSell is null when no pace was given; render a placeholder instead of a blank cell',
  );
  // Null on the shelf leader, and also on any channel no sell-through can lift
  // to the leader's rate — a trailing row, not just the winning one.
  assert.match(
    shelfCellsSource[0],
    /result\.sellThroughToMatchBest === null/,
    'sellThroughToMatchBest is null when no sell-through catches the leader; render a placeholder instead of formatting null',
  );
});

// ---------------------------------------------------------------------------
// The handoff into each channel's own calculator
//
// handoff.test.mjs proves the mapping and the URLs. These check the page is
// actually wired to them: a module that is imported but never rendered, or a
// container that is rendered but never filled, leaves the feature silently
// absent while both unit suites stay green.
// ---------------------------------------------------------------------------

test('the page imports and calls the handoff builder', () => {
  assert.match(html, /import \{ handoffsForResults \} from "\.\/handoff\.mjs"/);
  assert.match(html, /renderContinue\(comparison\.results, readShared\(\)\)/,
    'the links must be rebuilt from the current inputs on every recalculation');
});

test('the container exists, is a landmark, and starts hidden', () => {
  // Hidden until there is something in it — an empty labelled nav is a dead
  // stop for anyone tabbing or using a screen reader's landmark list.
  assert.match(html, /<nav id="continue"[^>]*aria-label="Continue with this item"[^>]*hidden>/);
});

test('the handoff links are built as nodes, never as markup', () => {
  // A channel label is free text the reader can edit, and this is the one
  // place it would be re-parsed. Keep it out of innerHTML.
  const render = html.slice(html.indexOf('function renderContinue'), html.indexOf('function update()'));
  assert.ok(render.length > 0, 'renderContinue not found');
  assert.ok(!render.includes('innerHTML'), 'renderContinue must not use innerHTML');
  assert.match(render, /createElement\("a"\)/);
  assert.match(render, /textContent/);
});

test('Download comparison CSV is wired to the calculated results', () => {
  assert.match(html, /id="downloadCsv"/);
  assert.match(scriptSource, /import \{ comparisonCsv \} from "\.\/export\.mjs"/);
  assert.match(scriptSource, /comparison_csv_downloaded/);
  assert.match(scriptSource, /comparisonCsv\(comparison\)/);
});

test('following a handoff is counted, and honours the opt-out', () => {
  const render = html.slice(html.indexOf('function renderContinue'), html.indexOf('function update()'));
  assert.match(render, /recordUsage\(localStorage, optedOut\(\), `handoff_\$\{offer\.channel\}`\)/,
    'the counter takes the opt-out the same way every other event on this page does');
  // The event name carries the destination and nothing about the item.
  assert.ok(!/recordUsage\([^)]*price|recordUsage\([^)]*itemCost/.test(render));
});

test('the privacy note names every handoff event the page can record', () => {
  // The event name is built as `handoff_${offer.channel}`, so adding a channel
  // to HANDOFFS creates a new recordable event with no code change here — and
  // the privacy paragraph enumerates the events by hand. That paragraph is the
  // page's central promise ("only an event name and the day, never your
  // inputs"), and a promise that silently stops listing everything it records
  // is worse than one that lists nothing.
  //
  // Caught by hand when Reverb was added: the fifth handoff shipped an
  // undisclosed `handoff_reverb` and every suite here stayed green. Asserted
  // now so the sixth cannot.
  const privacy = html.slice(html.indexOf('Everything runs in your browser.'));
  for (const entry of HANDOFFS) {
    assert.ok(
      privacy.includes(`<code>handoff_${entry.channel}</code>`),
      `the privacy note does not disclose handoff_${entry.channel}`,
    );
  }
});

test('the handoff styles live inside the verdict panel', () => {
  assert.match(html, /\.continue \{/);
  assert.match(html, /\.continue a \{/);
});

test('mergeChannelValues is defined exactly once', () => {
  // Function declarations hoist and the last one wins, so a second copy is not
  // dead code — it silently replaces the first. Two sessions independently
  // wrote this helper (`main`, and cursor/where-to-sell-share-hardening-
  // 20260825), and the merge appended rather than conflicting: the weaker copy
  // landed last and would have shadowed the stronger one with no error and no
  // failing test. Counting the declarations is what notices.
  const declarations = html.match(/function mergeChannelValues\b/g) ?? [];
  assert.equal(declarations.length, 1,
    `expected one mergeChannelValues, found ${declarations.length}`);
});

test('a saved channel that says nothing about `enabled` is not switched on', () => {
  // This is the behaviour the duplicate above would have reverted. "Other
  // channel" ships off; a stored record that predates the `enabled` flag omits
  // it entirely, and `incoming.enabled !== false` reads that silence as true —
  // quietly adding a channel the seller never asked to compare, which changes
  // the ranking they are shown. Silence must fall back to the preset.
  const merge = html.slice(html.indexOf('function mergeChannelValues'),
    html.indexOf('function restoreSharedLink'));
  assert.ok(merge.length > 0, 'mergeChannelValues not found');
  assert.match(merge, /incoming\.enabled === undefined/,
    'an absent `enabled` must be distinguished from an explicit one');
  assert.match(merge, /channel\.enabled !== false/,
    'and must fall back to the preset default');
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
// does-it-actually-sell-there.html, etsy-vs-ebay-fees.html, and
// returns-change-the-ranking.html were all indexed, linked from index.html,
// and shipped without any og:* tags at all.
test('every published, indexable page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length >= 4, 'expected at least the 4 known pages in this venture');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${page} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${page} is missing og:description`);
  }
});

test('share-link copy falls back when the Clipboard API is unavailable', () => {
  assert.match(html, /function fallbackCopy/);
  assert.match(html, /execCommand\("copy"\)/);
  assert.match(html, /share_link_copied/);
  assert.doesNotMatch(html, /window\.prompt\("Copy this share link:/);
});

// The footer "More seller arithmetic" list is the crawlable half of the
// handoff table in handoff.mjs. Handoff links are painted by JS after a
// comparison, so a crawler (and a visitor who never runs the table) only
// sees the static list. When amazon and reverb handoffs shipped, the footer
// still named only eBay, Etsy and Shopify — the two new deep tools were
// unreachable from this page unless you already knew their URLs.
test('the footer lists every channel that has a handoff deep tool', () => {
  for (const { slug } of HANDOFFS) {
    assert.match(
      html,
      new RegExp(`href="\\.\\./${slug}/"`),
      `footer (or page) must link to ../${slug}/ — it is in HANDOFFS`,
    );
  }
});

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvent, DEFAULTS } from './calc.mjs';
import { FIELD_IDS } from './share.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports the arithmetic and the field list rather than restating either', () => {
  assert.match(html, /import \{ calculateEvent \} from '\.\/calc\.mjs'/);
  assert.match(
    html,
    /import \{ encodeInputs, decodeInputs, hasSharedInputs, formValues, FIELD_IDS \} from '\.\/share\.mjs'/,
  );
  assert.deepEqual([...FIELD_IDS], Object.keys(DEFAULTS));
});

test('every input the page shows is one a shared link carries', () => {
  for (const id of FIELD_IDS) {
    assert.ok(ids.has(id), `#${id} is on share.mjs's field list but missing from the page`);
  }
});

test('every default value on the page matches calc.mjs DEFAULTS', () => {
  for (const [id, value] of Object.entries(DEFAULTS)) {
    const input = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(input, `#${id} has no value attribute`);
    assert.equal(
      Number(input[1]),
      value,
      `#${id} on the page is ${input[1]} but calc.mjs defaults to ${value}`,
    );
  }
});

test('the page wires usage counting for both the calculation and the booth-fee question', () => {
  assert.match(script, /recordEvent\('event-priced'\)/);
  assert.match(script, /recordEvent\('booth-fee-tested'\)/);
  assert.match(html, /<code>event-priced<\/code>, <code>booth-fee-tested<\/code>/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('every input has a visible label wrapping it, so a screen reader announces a name', () => {
  // A bare `<input>` beside loose text announces as "edit, number" and
  // nothing else. This portfolio shipped 48 of those across three live
  // products before the first axe run found them; the shape is cheap to
  // pin here, at the source.
  for (const id of FIELD_IDS) {
    assert.match(
      html,
      new RegExp(`<label>[^<]+<input id="${id}"`),
      `#${id} is not inside a <label>, so it has no accessible name`,
    );
  }
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = script.match(/function update\([\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('breakEven'\)\.hidden = true/, 'the break-even hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
  assert.match(body, /for \(const id of OUT_IDS\) el\(id\)\.textContent = ''/, 'stale figures are left on screen');
});

test('every output element the success path writes is cleared on the error path', () => {
  const outIds = script.match(/const OUT_IDS = \[([\s\S]*?)\];/);
  assert.ok(outIds, 'OUT_IDS not found');
  const cleared = new Set([...outIds[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const written = [...script.matchAll(/el\('(\w+Out|breakEvenLine)'\)\.textContent =/g)].map(m => m[1]);
  for (const id of new Set(written)) {
    assert.ok(cleared.has(id), `#${id} is written on success but never cleared on error`);
  }
});

test('the three findings have their own banners, each hidden by default', () => {
  assert.match(html, /id="stockWarning" class="warn" hidden/);
  assert.match(html, /id="rateWarning" class="warn" hidden/);
  assert.match(html, /id="boothWarning" class="warn" hidden/);
  assert.match(html, /id="verdict" class="good" hidden/);
});

test('the default event is the honest knife-edge the copy describes', () => {
  const r = calculateEvent(DEFAULTS);
  assert.ok(r.expected.cashProfit > 0, 'the default day should clear cash');
  assert.equal(r.expected.clearsTargetRate, false, 'the default day should sit just under the target rate');
  assert.ok(r.expected.effectiveHourlyRate > 20 && r.expected.effectiveHourlyRate < 25);
});

test('the headline claim in the h1 is arithmetic the calculator actually produces', () => {
  // "A $1,500 day at a $250 booth is not $1,250."
  assert.match(html, /A \$1,500 day at a \$250 booth is not \$1,250\./);
  const r = calculateEvent(DEFAULTS);
  assert.equal(DEFAULTS.expectedRevenue, 1500);
  assert.equal(DEFAULTS.boothFee, 250);
  assert.ok(r.expected.cashProfit < 1250, 'the h1 claims the day leaves less than $1,250');
});

test('the FAQ worked figures match the arithmetic they describe', () => {
  const r = calculateEvent(DEFAULTS);
  // "roughly 68c of each dollar is available — so a $370 day of fixed cost
  // needs about $547 of sales, not $370."
  assert.match(html, /roughly 68c of each dollar is available/);
  assert.ok(Math.abs(r.contributionRate * 100 - 68) < 1);
  assert.match(html, /a \$370 day of fixed cost needs about \$547 of sales/);
  assert.ok(Math.abs(r.fixedEventCost - 370) < 1);
  assert.ok(Math.abs(r.breakEvenRevenue - 547) < 1);
});

test('the FAQ fixed-fee example is arithmetically true', () => {
  // "Ten cents on a $6 sticker sale is 1.7% of it; the same ten cents on an
  // $80 print is 0.1%."
  assert.match(html, /Ten cents on a \$6 sticker sale is 1\.7% of it/);
  assert.ok(Math.abs((0.1 / 6) * 100 - 1.7) < 0.05);
  assert.ok(Math.abs((0.1 / 80) * 100 - 0.1) < 0.03);
});

test('every visible FAQ heading appears in the FAQPage structured data', () => {
  // A JSON-LD block that has drifted from the copy beside it is a live
  // defect this repository has already shipped twice.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'the page carries no FAQPage structured data');
  const questions = faq.mainEntity.map(q => q.name);
  const headings = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  for (const heading of headings) {
    const decoded = heading.replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
    assert.ok(
      questions.some(q => q === decoded),
      `visible FAQ heading "${decoded}" is missing from the FAQPage JSON-LD`,
    );
  }
  assert.equal(questions.length, headings.length, 'the JSON-LD and the visible FAQ list different questions');
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(script, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('page wires a shareable link, matching sibling calculators', () => {
  for (const id of ['copyLink', 'shareStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /recordEvent\('link_copied'\)/);
  assert.match(html, /<code>link_copied<\/code>/);
});

test('the shared event rides in the fragment, never the query string', () => {
  // A query string is sent in the request line a server logs and in the
  // Referer header a later click carries. A fragment is neither.
  assert.match(script, /\$\{query \? `#\$\{query\}` : ''\}/);
});

test('a shared link replaces every field, so none of the recipient own numbers survive', () => {
  assert.match(script, /formValues\(fromLink\)/);
  assert.doesNotMatch(
    script,
    /Object\.entries\(fromLink\)/,
    'writing the decoded link straight onto the form would leave the recipient\'s own values in the fields it omitted',
  );
});

test('opening the page on a shared link says so, without counting it as a calculation', () => {
  assert.match(script, /hasSharedInputs\(fromLink\)/);
  assert.match(script, /Opened a shared event/);
  const restoreBlock = script.match(/const fromLink[\s\S]*?\n\}/);
  assert.ok(restoreBlock, 'the restore-from-link block was not found');
  assert.doesNotMatch(restoreBlock[0], /recordEvent\(/, 'opening a shared link is not a calculation');
});

test('the FAQ answer about uploads names the share control honestly', () => {
  assert.match(html, /Copy shareable link button puts the figures on the form into the page.s URL fragment/);
  assert.match(html, /Anyone who has that link can read the numbers in it/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const file of ['index.html', 'how-much-do-you-need-to-sell-at-a-craft-fair.html', 'vs-craftybase.html']) {
    const loc = file === 'index.html'
      ? '/craft-fair-booth-calculator/'
      : `/craft-fair-booth-calculator/${file}`;
    assert.ok(sitemap.includes(loc), `${file} is not listed in sitemap.xml`);
  }
});

// The same maker sells the same work online between markets, so a crawler
// (or a reader) arriving on this page should reach the portfolio's other
// tools for that audience in one hop rather than through the front door.
test('index links one hop to the sibling tools for the same seller', () => {
  for (const slug of ['etsy-profit-calculator', 'where-to-sell-calculator', 'food-truck-event-margin-calculator']) {
    assert.match(
      html,
      new RegExp(`href="\\.\\./${slug}/"`),
      `index must link ../${slug}/ so a reader reaches it in one hop`,
    );
  }
});

test('index links its own guide page', () => {
  assert.match(html, /href="\.\/how-much-do-you-need-to-sell-at-a-craft-fair\.html"/);
});

// The other half of the pair closed in 3d-print-price-calculator's own
// page.test.mjs. Both directions are pinned because either one going away
// silently re-orphans a tool, and `siblings.mjs`'s budget only reports the
// aggregate.
test('index links one hop to the 3d-print-price-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/3d-print-price-calculator\/"/,
    'index must link ../3d-print-price-calculator/ so the sibling pair stays closed in both directions',
  );
});

// A grower selling at the same markets: the bed planner decides what to grow,
// this decides whether a given market is worth the table. Closed in both
// directions so a crawler on either page reaches the other in one hop.
test('index links one hop to the market-garden-bed-planner sibling', () => {
  assert.match(
    html,
    /href="\.\.\/market-garden-bed-planner\/"/,
    'index must link ../market-garden-bed-planner/ so the sibling pair stays closed in both directions',
  );
});

// Per-cup concession stands at the same fairs; closed in both directions.
test('index links one hop to the shaved-ice-stand-profit-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/shaved-ice-stand-profit-calculator\/"/,
    'index must link ../shaved-ice-stand-profit-calculator/ so the sibling pair stays closed in both directions',
  );
});

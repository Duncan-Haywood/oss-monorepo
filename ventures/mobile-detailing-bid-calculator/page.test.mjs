// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so a
// whole class of defect stays green there. This venture had no page test at
// all, and two of the three cases below are things that had already gone
// wrong or could go wrong silently:
//
//   1. calc.mjs can compute a figure the page never renders. The page reads
//      its input ids from `Object.keys(defaults)`, so a field added to
//      defaults without a matching <input id> reads as undefined and quietly
//      falls back to the default — the user changes nothing and sees nothing.
//   2. The page can render a figure calc.mjs no longer produces, printing
//      "undefined" or "$NaN".
//   3. An unclosed raw-text element (<style>, <script>) is not a parse error:
//      the rest of the document is swallowed as text, and every id after that
//      point silently stops existing. The guards derive everything from the
//      parse rather than the raw source so that this is visible — see
//      janitorial-bid-calculator/page.test.mjs, which was loosened back to
//      raw-source regexes once without any test noticing.
//
// Kept dependency-free (no jsdom, no browser) so CI stays a plain
// `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid, defaults } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Raw-text elements are not parsed as markup, so an unclosed one discards the
// rest of the document without any parse error. Split them out before counting
// anything, so markup inside a <script> template literal is not mistaken for
// markup the browser would render, and vice versa.
function derive(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) {
      const full = markup + rest;
      return {
        markup: full,
        scripts,
        scriptSource: scripts.join('\n'),
        unclosed: null,
        declaredIds: new Set([...full.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])),
      };
    }
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) {
      return {
        markup,
        scripts,
        scriptSource: scripts.join('\n'),
        unclosed: tag,
        declaredIds: new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])),
      };
    }
    scripts.push(rest.slice(contentStart, contentStart + closer.index));
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const page = derive(html);

test('every raw-text element is closed', () => {
  assert.equal(
    page.unclosed,
    null,
    `<${page.unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`,
  );
});

test('every input the calculator reads exists on the page', () => {
  // update() builds its input object from Object.keys(defaults) and calls
  // document.getElementById for each. A missing one throws on load.
  for (const id of Object.keys(defaults)) {
    assert.ok(
      page.declaredIds.has(id),
      `calc.mjs defaults include ${id}, but index.html declares no element with that id — the field would read as undefined and silently use the default`,
    );
  }
});

test('every figure the page renders is one the calculator returns', () => {
  const result = calculateBid({});
  // Ids the script writes into with textContent, minus the inputs and the
  // page furniture that holds prose rather than a computed figure.
  const furniture = new Set([...Object.keys(defaults), 'contribution', 'caption', 'targetQuote', 'status', 'usageOptOut']);
  const written = [...page.scriptSource.matchAll(/field\('([\w-]+)'\)\.textContent/g)].map((m) => m[1]);
  const figures = [...new Set(written)].filter((id) => !furniture.has(id));
  assert.ok(figures.length > 0, 'no rendered figures found; this test is not checking anything');
  for (const id of figures) {
    assert.ok(
      id in result,
      `index.html renders ${id}, but calculateBid does not return it — the page would print undefined`,
    );
  }
});

test('the page handles an unreachable target instead of printing a negative price', () => {
  // The guard in calc.mjs returns Infinity when the payment fee and target
  // margin together claim the whole price. money() would render that as
  // "$Infinity", so the page must branch on Number.isFinite first.
  const unreachable = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 98 });
  assert.equal(unreachable.targetQuote, Infinity);
  assert.match(
    page.scriptSource,
    /Number\.isFinite\(r\.targetQuote\)/,
    'index.html renders targetQuote without checking it is finite; an unreachable target would print as $Infinity or a negative quote',
  );
  assert.match(page.scriptSource, /unreachable/, 'no unreachable-target message found in the page script');
});

test('the structural guards actually fail on a swallowed document', () => {
  // A guard that cannot fail proves nothing. If declaredIds is ever re-derived
  // from the raw source instead of the parse, this is what catches it.
  const broken = html.replace('</style>', '');
  assert.notEqual(broken, html, 'index.html no longer contains </style>; this case needs updating');

  const d = derive(broken);
  assert.equal(d.unclosed, 'style', 'an unclosed <style> was not detected');
  assert.ok(
    d.declaredIds.size < page.declaredIds.size,
    `ids are being read from the raw file, not the parse: ${d.declaredIds.size} of ${page.declaredIds.size} still visible after the document was swallowed`,
  );
});

test('the disclaimer PRODUCT_PLAYBOOK 5b requires is on the page', () => {
  assert.match(page.markup, /No warranty/i);
  assert.match(page.markup, /not .*(business|tax|financial|professional) .*advice/i);
});

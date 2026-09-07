// Structural tests for index.html. calc.test.mjs never looks at the page, so
// it stays green for a class of defect this page is exposed to: advertising a
// figure in schema.org that the UI never renders, or shipping without the
// disclaimer the playbook requires the user to actually see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

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

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the page names the niche problem in the user\'s words', () => {
  assert.match(html, /<title>[^<]*Flooring Bid Calculator/i);
  assert.match(html, /name="description" content="[^"]*(waste|tear-out|tear out)[^"]*"/i);
  assert.match(markup, /Bid the waste and the tear-out/i);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/i);
  assert.match(markup, /not legal, tax, financial, or engineering advice/i);
  assert.match(markup, /Nothing leaves your browser/i);
  assert.match(markup, /usageOptOut/);
});

test('schema.org featureList claims are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');

  const claims = [
    ['waste', /result\.wasteSqFt|result\.wasteMaterialCost|result\.purchasedSqFt/],
    ['tear-out', /result\.roomTearoutHours|result\.tearoutHoursShare/],
    ['stair', /result\.extras\.stairs|result\.stairHoursShare/],
    ['walk-away', /result\.breakEvenPrice/],
    ['price per square foot', /result\.pricePerInstalledSqFt/],
    ['effective hourly', /result\.effectiveHourlyRate/],
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the page never renders it`,
    );
  }
});

test('figures that can be absent are rendered defensively', () => {
  assert.match(scriptSource, /result\.pricePerInstalledSqFt === null/);
  assert.match(scriptSource, /result\.effectiveHourlyRate === null/);
});

test('copyable bid summary exists for the installer\'s proposal', () => {
  assert.match(markup, /copySummary/);
  assert.match(markup, /downloadSummary/);
  assert.match(scriptSource, /FLOORING INSTALL BID/);
  assert.match(scriptSource, /summary_downloaded/);
  assert.match(scriptSource, /flooring-install-bid\.txt/);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for flooring installation/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// Closest sibling: same floor-covering trade, but carpet (yards, stairs,
// stretch-in / glue-down) rather than hard-surface LVP / hardwood / tile.
// Related-tool chrome may never surface that pair, so without an explicit
// one-hop a crawler on this page may never land on that tool.
test('index links one hop to the carpet-install-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/carpet-install-bid-calculator\/"/,
    'index must link ../carpet-install-bid-calculator/ so crawlers reach the carpet calculator in one hop',
  );
  assert.match(html, /carpet installation bid calculator/i);
});

// Structural + arithmetic tests for the second-print-location worked-example
// page. Mirrors the pattern used for carpet-install-bid-calculator's
// should-i-charge-extra-for-moving-furniture-on-a-carpet-install page: no
// jsdom, just the raw markup plus the pure calculator.mjs function, so the
// dollar figures quoted in the article are pinned against the same
// arithmetic the calculator itself runs rather than hand-typed numbers that
// can drift out of sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDecorationJob } from './calculator.mjs';

const html = readFileSync(
  new URL('./should-i-charge-extra-for-a-second-print-location.html', import.meta.url),
  'utf8',
);

const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

test('every raw-text element is closed', () => {
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
  assert.doesNotMatch(html, /<textarea/i, 'this is a static article; it should carry no interactive form');
});

test('the page names the search phrase and points back to the calculator', () => {
  assert.match(html, /<title>[^<]*Should I Charge Extra for Printing on the Back/i);
  assert.match(html, /meta name="description"[^>]*second/i);
  assert.match(html, /meta name="robots" content="index, follow"/);
  assert.match(html, /rel="canonical" href="should-i-charge-extra-for-a-second-print-location\.html"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="index\.html"/);
  assert.match(html, /href="vs-printavo\.html"/);
});

test('disclaimer and no-SLA clauses are visible on this page, not only in the README', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /do not promise uptime/i);
});

// The figures quoted in the article are recomputed here from calculator.mjs
// directly, the same way the calculator's own script would, rather than
// typed by hand a second time — so a change to the shared defaults or the
// engine's arithmetic fails this test instead of silently leaving the
// published article wrong.
const RATE_DEFAULTS = {
  method: 'screen-print',
  colorsPerLocation: 3,
  screenSetupCost: 18,
  pressPiecesPerHour: 90,
  inkCostPerPiecePerColor: 0.06,
  blankCostPerPiece: 4.2,
  spoilagePct: 4,
  wagePerHour: 20,
  payrollLoadPct: 18,
  artMinutes: 30,
  finishMinutesPerPiece: 0.4,
  pricePerPiece: 14,
  setupFeeCharged: 0,
  targetMarginPct: 40,
  monthlyOverhead: 5200,
  monthlyPieces: 2600,
};

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

test('the 24-piece worked example: setup, break-even, profit and margin for one vs two locations', () => {
  const oneLocation = computeDecorationJob({ ...RATE_DEFAULTS, quantity: 24, locations: 1 });
  const twoLocations = computeDecorationJob({ ...RATE_DEFAULTS, quantity: 24, locations: 2 });

  assert.equal(oneLocation.job.setup.screenCount, 3);
  assert.equal(twoLocations.job.setup.screenCount, 6);
  assert.equal(oneLocation.job.setup.total, 65.8);
  assert.equal(twoLocations.job.setup.total, 119.8);

  assert.match(html, /\$65\.80/);
  assert.match(html, /\$119\.80/);
  assert.match(html, /\b3 screens/);
  assert.match(html, /\b6 screens/);

  assert.match(html, new RegExp(money(oneLocation.breakEvenPricePerPiece).replace(/[.$]/g, '\\$&')));
  assert.match(html, new RegExp(money(twoLocations.breakEvenPricePerPiece).replace(/[.$]/g, '\\$&')));
  assert.match(html, new RegExp(money(oneLocation.profit).replace(/[.$]/g, '\\$&')));
  assert.match(html, new RegExp(money(twoLocations.profit).replace(/[.$]/g, '\\$&')));
  assert.match(html, new RegExp(`${oneLocation.marginPct}%`));
  assert.match(html, new RegExp(`${twoLocations.marginPct}%`));

  const giveaway = oneLocation.profit - twoLocations.profit;
  assert.equal(giveaway.toFixed(2), '64.61');
  assert.match(html, /\$64\.61/);
});

test('the added-cost-per-piece vs added-cost-per-job table across quantities', () => {
  const quantities = [24, 72, 144, 288];
  const rows = quantities.map((quantity) => {
    const oneLocation = computeDecorationJob({ ...RATE_DEFAULTS, quantity, locations: 1 });
    const twoLocations = computeDecorationJob({ ...RATE_DEFAULTS, quantity, locations: 2 });
    return {
      quantity,
      addedPerPiece: twoLocations.breakEvenPricePerPiece - oneLocation.breakEvenPricePerPiece,
      addedTotal: twoLocations.job.total - oneLocation.job.total,
    };
  });

  // The article's central non-obvious claim: added cost per piece shrinks
  // with volume, but added cost for the whole job grows. Pin the direction,
  // not just the individual numbers, so a change to the cost model that
  // breaks this shape fails loudly rather than leaving stale prose behind.
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      rows[i].addedPerPiece < rows[i - 1].addedPerPiece,
      `added cost per piece should shrink as quantity grows (${rows[i - 1].quantity} -> ${rows[i].quantity})`,
    );
    assert.ok(
      rows[i].addedTotal > rows[i - 1].addedTotal,
      `added cost for the whole job should grow as quantity grows (${rows[i - 1].quantity} -> ${rows[i].quantity})`,
    );
  }

  for (const row of rows) {
    assert.match(html, new RegExp(`\\$${row.addedPerPiece.toFixed(2)}`));
    assert.match(html, new RegExp(`\\$${row.addedTotal.toFixed(2)}`));
  }
});

test('sitemap.xml lists the new page', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /should-i-charge-extra-for-a-second-print-location\.html/);
});

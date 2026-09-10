// Structural + arithmetic tests for the furniture-move worked-example page.
// Mirrors the pattern used for the should-i-* pages in
// egress-window-bid-calculator/page.test.mjs and
// invoice-payment-terms-calculator/page.test.mjs: no jsdom, just the raw
// markup plus the pure calc.mjs functions, so the dollar figures quoted in
// the article are pinned against the same arithmetic the calculator itself
// runs rather than hand-typed numbers that can drift out of sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateBid,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

const html = readFileSync(
  new URL('./should-i-charge-extra-for-moving-furniture-on-a-carpet-install.html', import.meta.url),
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
  assert.match(html, /<title>[^<]*Should I Charge Extra for Moving Furniture/i);
  assert.match(html, /meta name="description"[^>]*furniture/i);
  assert.match(html, /meta name="robots" content="index, follow"/);
  assert.match(html, /rel="canonical" href="should-i-charge-extra-for-moving-furniture-on-a-carpet-install\.html"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="index\.html"/);
  assert.match(html, /href="vs-measuresquare\.html"/);
  assert.match(html, /href="how-much-to-charge-to-install-carpet\.html"/);
});

test('disclaimer and no-SLA clauses are visible on this page, not only in the README', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not flooring-spec, moisture-test, legal, tax, or financial advice/i);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /do not promise uptime/i);
});

// The figures quoted in the article are recomputed here from calc.mjs
// directly, the same way the calculator's own script would, rather than
// typed by hand a second time — so a change to the suggested extra kit (the
// furniture-move hours) or the default crew rates fails this test instead of
// silently leaving the published article wrong.
const COST_DEFAULTS = {
  hourlyWage: 38, burdenRate: 30, travelAndEquipment: 55, otherCost: 0,
  overheadRate: 15, targetMargin: 20,
};

function priceJob(job, overrides = {}) {
  return calculateBid({
    ...job,
    ...suggestedScopeKit(job.scope),
    ...suggestedPatternKit(job.pattern),
    ...suggestedExtraKit(),
    ...COST_DEFAULTS,
    ...overrides,
  });
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The article quotes three of the four built-in presets — cheap special,
// typical house, and whole house — as the "same add-on at every size"
// illustration. It deliberately omits the fourth ("losing job") preset,
// which does not add a new size point to that comparison.
const ARTICLE_PRESETS = JOB_PRESETS.filter((job) => /Cheap special|Typical house|Whole house/.test(job.label));

test('the furniture-move add-on is a flat $113.62 across the three quoted presets', () => {
  assert.equal(ARTICLE_PRESETS.length, 3, 'expected exactly the cheap-special, typical-house, and whole-house presets');
  const deltas = new Set();
  for (const job of ARTICLE_PRESETS) {
    const withFurniture = priceJob(job, { includeFurniture: true });
    const withoutFurniture = priceJob(job, { includeFurniture: false });
    const delta = withFurniture.price - withoutFurniture.price;
    deltas.add(delta.toFixed(2));
    assert.match(
      html,
      new RegExp(money(withoutFurniture.price).replace(/[.$]/g, '\\$&')),
      `no-furniture price ${money(withoutFurniture.price)} for "${job.label}" is not quoted in the article`,
    );
    assert.match(
      html,
      new RegExp(money(withFurniture.price).replace(/[.$]/g, '\\$&')),
      `with-furniture price ${money(withFurniture.price)} for "${job.label}" is not quoted in the article`,
    );
  }
  // Every preset must produce the same add-on: furniture move is flat
  // crew-hours, independent of floor size, scope, or pattern. If a future
  // change to calc.mjs makes it scale with the job, this is the assertion
  // that should catch it before the article's central claim goes stale.
  assert.deepEqual([...deltas], ['113.62'], 'the furniture-move add-on is no longer flat across job sizes');
  assert.match(html, /\$113\.62/);
});

test('the underpricing scenario (quote without furniture, do it anyway) is quoted correctly', () => {
  const typical = JOB_PRESETS[1];
  assert.match(typical.label, /Typical house/);
  const withFurniture = priceJob(typical, { includeFurniture: true });
  const withoutFurniture = priceJob(typical, { includeFurniture: false });
  const realProfitIfUnderquoted = withoutFurniture.price - withFurniture.totalCost;

  assert.match(html, new RegExp(money(withFurniture.profit).replace(/[.$]/g, '\\$&')));
  assert.match(html, new RegExp(money(realProfitIfUnderquoted).replace(/[.$]/g, '\\$&')));
  // The giveaway equals the line-item price itself — that is the article's
  // punchline, so pin the relationship, not just the two numbers.
  assert.equal((withFurniture.profit - realProfitIfUnderquoted).toFixed(2), '113.62');
});

test('sitemap.xml lists the new page', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /should-i-charge-extra-for-moving-furniture-on-a-carpet-install\.html/);
});

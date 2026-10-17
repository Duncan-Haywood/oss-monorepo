// Pins this page's dollar and share figures to calc.mjs's own arithmetic
// rather than to hand-typed numbers, so a future change to the profile,
// grade, ceiling, or height kits that shifts the walk-away price or the
// hour split cannot leave this page quietly wrong. Same pattern as
// should-i-charge-8-a-foot-for-crown-molding.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  calculateBid,
  suggestedProfileKit,
  suggestedGradeKit,
  suggestedCeilingKit,
  suggestedHeightKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

const SLUG = 'should-i-match-a-cheaper-quote-on-a-stain-grade-job.html';
const html = fs.readFileSync(new URL(`./${SLUG}`, import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const walkthroughHtml = fs.readFileSync(new URL('./how-much-to-charge-to-install-crown-molding.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same default crew rates as index.html's own <input value="..."> defaults,
// which JOB_PRESETS deliberately does not override (presets only set scope,
// dimensions, and extras -- see index.html's applyJob).
const WAGE_DEFAULTS = {
  hourlyWage: 42, burdenRate: 32, overheadRate: 15, targetMargin: 20,
  travelAndEquipment: 65, otherCost: 0,
};

function bidFor(job) {
  return calculateBid({
    ...job,
    ...WAGE_DEFAULTS,
    ...suggestedProfileKit(job.profile),
    ...suggestedGradeKit(job.grade),
    ...suggestedCeilingKit(job.ceiling),
    ...suggestedHeightKit(job.height),
    ...suggestedExtraKit(),
  });
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Share of crew hours that is not the base run, travel, or site setup --
 * corners, ceiling, access, room turnover, demo, blocking, LED, casing. */
function extraWorkHourShare(bid) {
  const hs = bid.hourShares;
  return hs.inside + hs.outside + hs.stacked + hs.ceiling + hs.access
    + hs.rooms + hs.demo + hs.blocking + hs.led + hs.casing;
}

test('all four preset jobs price the walk-away price and extra-work share the page claims', () => {
  assert.equal(JOB_PRESETS.length, 4, 'this page enumerates all four presets; add a row if a fifth ships');
  for (const job of JOB_PRESETS) {
    const bid = bidFor(job);
    const walkAway = money(bid.breakEvenPrice);
    const share = `${extraWorkHourShare(bid).toFixed(1)}%`;
    assert.ok(html.includes(walkAway), `page is missing the walk-away price for ${job.label} (${walkAway})`);
    assert.ok(html.includes(share), `page is missing the extra-work hour share for ${job.label} (${share})`);
  }
});

test('the cheap special and the losing job are the same 80 lf, and the gap is stated correctly', () => {
  const [cheap, , , losing] = JOB_PRESETS;
  assert.equal(cheap.label.startsWith('Cheap special'), true);
  assert.equal(losing.label.startsWith('Losing job'), true);
  assert.equal(cheap.linearFeet, losing.linearFeet, 'the headline comparison depends on identical footage');
  assert.equal(cheap.linearFeet, 80);

  const cheapBid = bidFor(cheap);
  const losingBid = bidFor(losing);
  const gap = money(losingBid.breakEvenPrice - cheapBid.breakEvenPrice);
  assert.ok(html.includes(gap), `page is missing the same-footage walk-away gap (${gap})`);

  // The extra-work share must actually be higher on the stain-grade job --
  // if a future rate change ever flattens or reverses it, this page's
  // framing goes stale and needs a rewrite, not a quiet green test.
  assert.ok(
    extraWorkHourShare(losingBid) > extraWorkHourShare(cheapBid),
    'the losing job must carry a larger extra-work hour share than the cheap special for this page to make sense',
  );
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not millwork, structural, paint-spec, legal, tax, or financial advice/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${SLUG.replace('.', '\\.')}">`));
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page is linked from the tool page and the pricing walkthrough, not orphaned', () => {
  assert.match(indexHtml, new RegExp(`href="${SLUG}"`));
  assert.match(walkthroughHtml, new RegExp(`href="${SLUG}"`));
});

test('the page is listed in the sitemap', () => {
  assert.match(sitemap, new RegExp(SLUG.replace('.', '\\.')));
});

test('the page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-crown-molding\.html"/);
});

test('no raw-text element is left unclosed', () => {
  for (const tag of ['textarea', 'script', 'style']) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

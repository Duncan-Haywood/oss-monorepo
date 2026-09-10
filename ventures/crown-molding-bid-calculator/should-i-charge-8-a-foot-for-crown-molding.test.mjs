// Pins the decision page's dollar figures to calc.mjs's own arithmetic
// rather than to hand-typed numbers, so a future change to the profile,
// grade, ceiling, or height kits that shifts the walk-away price cannot
// leave this page quietly wrong. Structural checks follow the same
// pattern as should-i-charge-30-a-square-foot-to-finish-a-basement.test.mjs.
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

const SLUG = 'should-i-charge-8-a-foot-for-crown-molding.html';
const html = fs.readFileSync(new URL(`./${SLUG}`, import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seoHtml = fs.readFileSync(new URL('./how-much-to-charge-to-install-crown-molding.html', import.meta.url), 'utf8');
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

test('all four preset jobs price the way the page claims at $8/lf', () => {
  assert.equal(JOB_PRESETS.length, 4, 'this page enumerates all four presets; add a row if a fifth ships');
  for (const job of JOB_PRESETS) {
    const breakEven = bidFor(job).breakEvenPrice;
    const flatRatePrice = job.linearFeet * 8;
    const flatMoney = money(flatRatePrice);
    const breakEvenMoney = money(breakEven);
    assert.ok(html.includes(flatMoney), `page is missing the $8/ft quote for ${job.linearFeet} lf (${flatMoney})`);
    assert.ok(html.includes(breakEvenMoney), `page is missing the walk-away price for ${job.label} (${breakEvenMoney})`);
    // $8/ft is short on every preset job under current defaults -- if a
    // future rate change ever makes it cover one, the page's "never breaks
    // even" framing goes stale and needs a rewrite, not a quiet green test.
    assert.ok(flatRatePrice < breakEven, `${job.label}: $8/ft no longer falls short of the walk-away price -- this page's framing needs updating`);
    const shortfall = money(breakEven - flatRatePrice);
    assert.ok(html.includes(shortfall), `page does not state the shortfall for ${job.label} (${shortfall})`);
  }
});

test('the two same-footage jobs (cheap special and losing job) are both 80 lf', () => {
  const [cheap, , , losing] = JOB_PRESETS;
  assert.equal(cheap.label.startsWith('Cheap special'), true);
  assert.equal(losing.label.startsWith('Losing job'), true);
  assert.equal(cheap.linearFeet, losing.linearFeet, 'the headline comparison depends on identical footage');
  assert.equal(cheap.linearFeet, 80);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not millwork, structural, paint-spec, legal, tax, or financial advice/i);
});

test('the canonical tag names this file, relative to the venture root', () => {
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

test('the page is linked from the tool page and the pricing walkthrough, not orphaned', () => {
  assert.match(indexHtml, new RegExp(`href="${SLUG}"`));
  assert.match(seoHtml, new RegExp(`href="${SLUG}"`));
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

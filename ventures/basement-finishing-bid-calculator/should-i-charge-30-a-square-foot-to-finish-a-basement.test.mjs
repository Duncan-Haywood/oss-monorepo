// Pins the decision page's dollar figures to calc.mjs's own arithmetic
// rather than to hand-typed numbers, so a future change to the shell,
// bath, or extra kits that shifts the walk-away price cannot leave this
// page quietly wrong. Structural checks follow the same pattern as
// vs-buildxact.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  calculateBid,
  suggestedScopeKit,
  suggestedCeilingKit,
  suggestedFloorKit,
  suggestedBathKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

const SLUG = 'should-i-charge-30-a-square-foot-to-finish-a-basement.html';
const html = fs.readFileSync(new URL(`./${SLUG}`, import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seoHtml = fs.readFileSync(new URL('./how-much-to-charge-to-finish-a-basement.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same default crew rates as index.html's own <input value="..."> defaults,
// which JOB_PRESETS deliberately does not override (presets only set scope,
// dimensions, and extras -- see index.html's applyJob).
const WAGE_DEFAULTS = {
  hourlyWage: 38, burdenRate: 30, overheadRate: 15, targetMargin: 20,
  travelAndEquipment: 180, otherCost: 0,
};

function bidFor(job) {
  return calculateBid({
    ...job,
    ...WAGE_DEFAULTS,
    ...suggestedScopeKit(job.scope),
    ...suggestedCeilingKit(job.ceiling),
    ...suggestedFloorKit(job.floor),
    ...suggestedBathKit(job.bath),
    ...suggestedExtraKit(),
  });
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

test('the three named jobs price the way the page claims', () => {
  const [cheap, framed, legal] = JOB_PRESETS;
  assert.equal(cheap.label.startsWith('Cheap special'), true);
  assert.equal(framed.label.startsWith('Typical framed'), true);
  assert.equal(legal.label.startsWith('Legal suite'), true);

  const cases = [
    { job: cheap, sf: 800 },
    { job: framed, sf: 900 },
    { job: legal, sf: 1000 },
  ];
  for (const { job, sf } of cases) {
    assert.equal(job.finishedSf, sf, `${job.label} SF drifted from what the page assumes`);
    const breakEven = bidFor(job).breakEvenPrice;
    const flatRatePrice = sf * 30;
    const flatMoney = money(flatRatePrice);
    const breakEvenMoney = money(breakEven);
    assert.ok(html.includes(flatMoney), `page is missing the $30/SF price for ${sf} SF (${flatMoney})`);
    assert.ok(html.includes(breakEvenMoney), `page is missing the walk-away price for ${job.label} (${breakEvenMoney})`);
    if (flatRatePrice >= breakEven) {
      assert.match(html, /covers/i);
    } else {
      const shortfall = money(breakEven - flatRatePrice);
      assert.ok(html.includes(shortfall), `page does not state the shortfall for ${job.label} (${shortfall})`);
    }
  }
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not building-code, waterproofing, habitable-space, egress, legal, tax, or financial advice/i);
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
  assert.match(html, /href="how-much-to-charge-to-finish-a-basement\.html"/);
});

test('no raw-text element is left unclosed', () => {
  for (const tag of ['textarea', 'script', 'style']) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

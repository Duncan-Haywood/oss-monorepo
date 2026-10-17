import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat "$4.50 a foot
  // installed" special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. vs-jobnimbus.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /JobNimbus|ServiceTitan|ServiceMonster|Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-foot-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped default shop rates and built-in job presets', async () => {
  const { calculateBid, suggestedProfileKit, suggestedStoryKit, JOB_PRESETS } = await import('./calc.mjs');

  // The shipped index.html default shop-cost and structural fields: selecting
  // a built-in job preset never overwrites these -- applyJob() in index.html
  // only force-applies suggestedProfileKit()/suggestedStoryKit() (gutterPerFoot,
  // hoursPerGutterFoot, profilePremiumPerFoot, hoursPerStoryFoot) plus the raw
  // footage/miter/downspout/fascia/toggle fields from the preset itself.
  const shopDefaults = {
    hoursTrip: 1.25, hoursInsideMiter: 0.5, hoursOutsideMiter: 0.3,
    hoursPerExtraDownspout: 0.65, hoursPerExtraDownspoutFoot: 0.08,
    hoursPerFasciaFoot: 0.22, hoursPerTearOffFoot: 0.018, hoursPerSteepFoot: 0.012,
    siteHours: 0.75,
    downspoutOutletCost: 38, downspoutPerFoot: 4.2, insideMiterCost: 18, outsideMiterCost: 12,
    fasciaPerFoot: 8.5, tearOffDumpPerFoot: 0.85, hangerPerFoot: 1.1, permitFee: 0,
    hourlyWage: 38, burdenRate: 32, travelAndEquipment: 95, overheadRate: 16, targetMargin: 32,
  };

  function priceJob(preset) {
    const profileKit = suggestedProfileKit(preset.profile);
    const storyKit = suggestedStoryKit(preset.stories);
    return calculateBid({ ...preset, ...shopDefaults, ...profileKit, ...storyKit });
  }

  const ranch = JOB_PRESETS[0];
  assert.match(ranch.label, /the \$4\.50\/ft special/);
  const bidRanch = priceJob(ranch);
  assert.equal(bidRanch.totalCost.toFixed(2), '1189.34');
  assert.equal(bidRanch.price.toFixed(2), '1749.03');
  assert.equal(bidRanch.totalHours.toFixed(2), '8.10');
  assert.equal(bidRanch.laborCost.toFixed(2), '406.30');
  assert.equal(bidRanch.materialCost.toFixed(2), '524.00');

  const colonial = JOB_PRESETS[2];
  assert.match(colonial.label, /2-story colonial, 220 ft of 6" aluminum/);
  const bidColonial = priceJob(colonial);
  assert.equal(bidColonial.totalCost.toFixed(2), '4611.88');
  assert.equal(bidColonial.price.toFixed(2), '6782.18');
  assert.equal(bidColonial.totalHours.toFixed(2), '32.26');
  assert.equal(bidColonial.laborCost.toFixed(2), '1618.16');
  assert.equal(bidColonial.materialCost.toFixed(2), '2262.60');

  const flatRate = 4.5;
  const flatRanch = ranch.gutterFeet * flatRate;
  const flatColonial = colonial.gutterFeet * flatRate;
  assert.equal(flatRanch.toFixed(2), '630.00');
  assert.equal(flatColonial.toFixed(2), '990.00');

  assert.ok(flatRanch < bidRanch.totalCost, 'the flat special should fall short of total cost even on the brochure ranch');
  assert.equal((bidRanch.totalCost - flatRanch).toFixed(2), '559.34');
  assert.ok(flatRanch > bidRanch.laborCost, 'the flat special should still clear loaded labor on the brochure ranch');

  assert.ok(flatColonial < bidColonial.totalCost, 'the flat special should fall well short of total cost on the harder job');
  assert.equal((bidColonial.totalCost - flatColonial).toFixed(2), '3621.88');
  assert.ok(flatColonial < bidColonial.laborCost, 'the flat special should not even clear loaded labor on the harder job');
  assert.equal((bidColonial.laborCost - flatColonial).toFixed(2), '628.16');

  assert.equal((bidColonial.price - bidRanch.price).toFixed(2), '5033.15');
  assert.equal((flatRanch / bidRanch.totalHours).toFixed(2), '77.78');
  assert.equal((flatColonial / bidColonial.totalHours).toFixed(2), '30.69');

  const loadedWage = shopDefaults.hourlyWage * (1 + shopDefaults.burdenRate / 100);
  assert.equal(loadedWage.toFixed(2), '50.16');
  assert.ok(flatColonial / bidColonial.totalHours < loadedWage, 'the colonial effective rate should fall below the loaded wage');

  for (const figure of ['$1,189.34', '$1,749.03', '$406.30', '$524.00', '$4,611.88', '$6,782.18', '$1,618.16', '$2,262.60', '$630.00', '$990.00', '$559.34', '$3,621.88', '$628.16', '$5,033.15', '$77.78', '$30.69', '$50.16']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$559\.34|-\$559\.34/, 'the $559.34 shortfall on the brochure ranch is missing from the page');
  assert.match(html, /&minus;\$3,621\.88|-\$3,621\.88/, 'the $3,621.88 shortfall on the harder job is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-foot-special\.html"|href="vs-a-flat-per-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-foot-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-gutters\.html"/);
});

test('this generic-method page is registered as disclaimer-exempt and within the surface budget', async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import('../../platform/pages/clauses.mjs');
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has('gutter-install-bid-calculator/vs-a-flat-per-foot-special.html'),
    'vs-a-flat-per-foot-special.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product',
  );
});

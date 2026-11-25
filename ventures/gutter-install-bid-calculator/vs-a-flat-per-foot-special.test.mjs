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
  // Read from index.html's own <input value="..."> rather than a hand copy:
  // the copy here was what let the page's figures drift from the form
  // (quality audit 2026-11-09, defects 0-1: crew size, waste and sundries
  // were added to the form, and a hand copy would have kept passing).
  const shopIds = [
    'hoursTrip', 'hoursInsideMiter', 'hoursOutsideMiter', 'hoursPerExtraDownspout',
    'hoursPerExtraDownspoutFoot', 'hoursPerFasciaFoot', 'hoursPerTearOffFoot', 'hoursPerSteepFoot',
    'siteHours', 'downspoutOutletCost', 'downspoutPerFoot', 'insideMiterCost', 'outsideMiterCost',
    'fasciaPerFoot', 'tearOffDumpPerFoot', 'hangerPerFoot', 'permitFee', 'wastePercent',
    'sundriesPerFoot', 'crewSize', 'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate',
    'targetMargin',
  ];
  const shopDefaults = Object.fromEntries(shopIds.map((id) => {
    const match = indexHtml.match(new RegExp(`<input id="${id}"[^>]*\\bvalue="([^"]+)"`));
    assert.ok(match, `index.html has no default value for #${id}`);
    return [id, Number(match[1])];
  }));
  assert.equal(shopDefaults.crewSize, 2);

  function priceJob(preset) {
    const profileKit = suggestedProfileKit(preset.profile);
    const storyKit = suggestedStoryKit(preset.stories);
    return calculateBid({ ...preset, ...shopDefaults, ...profileKit, ...storyKit });
  }

  const ranch = JOB_PRESETS[0];
  assert.match(ranch.label, /the \$4\.50\/ft special/);
  const bidRanch = priceJob(ranch);
  assert.equal(bidRanch.totalCost.toFixed(2), '1488.03');
  assert.equal(bidRanch.price.toFixed(2), '2188.28');
  assert.equal(bidRanch.totalHours.toFixed(2), '8.10');
  assert.equal(bidRanch.laborCost.toFixed(2), '555.98');
  assert.equal(bidRanch.materialCost.toFixed(2), '631.80');

  const colonial = JOB_PRESETS[2];
  assert.match(colonial.label, /2-story colonial, 220 ft of 6" aluminum/);
  const bidColonial = priceJob(colonial);
  assert.equal(bidColonial.totalCost.toFixed(2), '5532.51');
  assert.equal(bidColonial.price.toFixed(2), '8136.05');
  assert.equal(bidColonial.totalHours.toFixed(2), '32.26');
  assert.equal(bidColonial.laborCost.toFixed(2), '2214.33');
  assert.equal(bidColonial.materialCost.toFixed(2), '2460.08');

  const flatRate = 4.5;
  const flatRanch = ranch.gutterFeet * flatRate;
  const flatColonial = colonial.gutterFeet * flatRate;
  assert.equal(flatRanch.toFixed(2), '630.00');
  assert.equal(flatColonial.toFixed(2), '990.00');

  assert.ok(flatRanch < bidRanch.totalCost, 'the flat special should fall short of total cost even on the brochure ranch');
  assert.equal((bidRanch.totalCost - flatRanch).toFixed(2), '858.03');
  assert.ok(flatRanch > bidRanch.laborCost, 'the flat special should still clear loaded labor on the brochure ranch');

  assert.ok(flatColonial < bidColonial.totalCost, 'the flat special should fall well short of total cost on the harder job');
  assert.equal((bidColonial.totalCost - flatColonial).toFixed(2), '4542.51');
  assert.ok(flatColonial < bidColonial.laborCost, 'the flat special should not even clear loaded labor on the harder job');
  assert.equal((bidColonial.laborCost - flatColonial).toFixed(2), '1224.33');

  assert.equal((bidColonial.price - bidRanch.price).toFixed(2), '5947.77');
  assert.equal((flatRanch / bidRanch.totalHours).toFixed(2), '77.78');
  assert.equal((flatColonial / bidColonial.totalHours).toFixed(2), '30.69');

  const loadedWage = shopDefaults.hourlyWage * (1 + shopDefaults.burdenRate / 100);
  assert.equal(loadedWage.toFixed(2), '34.32');
  const crewHourCost = loadedWage * shopDefaults.crewSize;
  assert.equal(crewHourCost.toFixed(2), '68.64');
  assert.ok(flatColonial / bidColonial.totalHours < crewHourCost, 'the colonial effective rate should fall below what the loaded crew costs an hour');
  assert.ok(flatRanch / bidRanch.totalHours > crewHourCost, 'the ranch effective rate should still clear the loaded crew');

  for (const figure of ['$1,488.03', '$2,188.28', '$555.98', '$631.80', '$5,532.51', '$8,136.05', '$2,214.33', '$2,460.08', '$630.00', '$990.00', '$858.03', '$4,542.51', '$1,224.33', '$5,947.77', '$1,558.28', '$77.78', '$30.69', '$34.32', '$68.64']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$858\.03|-\$858\.03/, 'the $858.03 shortfall on the brochure ranch is missing from the page');
  assert.match(html, /&minus;\$4,542\.51|-\$4,542\.51/, 'the $4,542.51 shortfall on the harder job is missing from the page');

  // The pricing walkthrough quotes the same presets at the same defaults.
  const guide = fs.readFileSync(new URL('./how-much-to-charge-to-install-gutters.html', import.meta.url), 'utf8');
  const usd = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const tearOffJob = priceJob(JOB_PRESETS[1]);
  const copperJob = priceJob(JOB_PRESETS[3]);
  for (const figure of [
    usd(bidRanch.price), usd(bidRanch.totalCost), usd(bidRanch.pricePerGutterFoot),
    usd(bidColonial.price), usd(bidColonial.totalCost), usd(bidColonial.pricePerGutterFoot),
    usd(tearOffJob.price), usd(copperJob.price), usd(copperJob.pricePerGutterFoot),
    usd(bidRanch.totalCost - flatRanch),
  ]) {
    assert.ok(guide.includes(figure), `pricing-guide figure ${figure} is missing from how-much-to-charge-to-install-gutters.html`);
  }
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

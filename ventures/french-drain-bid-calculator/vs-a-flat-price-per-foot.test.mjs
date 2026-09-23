import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-price-per-foot\.html">/);
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
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs on the shipped cost inputs', async () => {
  const { calculateBid, suggestedDepthKit, suggestedPipeKit, suggestedSoilKit, suggestedOutletKit } = await import('./calc.mjs');

  const shared = {
    hoursTrip: 1,
    hoursCatchBasin: 1.2,
    hoursDownspout: 0.6,
    hoursDrivewayPerFoot: 0.35,
    hoursLawn: 1.5,
    hoursSolidPerFoot: 0.08,
    siteHours: 0.5,
    fabricCostPerFoot: 0.85,
    solidPipeCostPerFoot: 2.4,
    basinCost: 165,
    downspoutCost: 45,
    drivewayPatchPerFoot: 28,
    lawnRestoreCost: 120,
    permitFee: 0,
    hourlyWage: 42,
    burdenRate: 30,
    travelAndEquipment: 95,
    overheadRate: 15,
    targetMargin: 30,
    proposedPrice: null,
  };

  function buildJob({ depth, pipe, soil, outlet, ...rest }) {
    const depthKit = suggestedDepthKit(depth);
    const pipeKit = suggestedPipeKit(pipe);
    const soilKit = suggestedSoilKit(soil);
    const outletKit = suggestedOutletKit(outlet);
    return {
      ...shared,
      depth,
      pipe,
      soil,
      outlet,
      ...rest,
      hoursPerFoot: depthKit.hoursPerFoot,
      gravelCostPerFoot: depthKit.gravelCostPerFoot,
      pipeCostPerFoot: pipeKit.pipeCostPerFoot,
      hoursPipePremium: pipeKit.hoursPipePremium,
      soilHourFactor: soilKit.soilHourFactor,
      dumpFee: soilKit.dumpFee,
      hoursOutlet: outletKit.hoursOutlet,
      outletCost: outletKit.outletCost,
    };
  }

  // The 40-ft shallow daylight brochure job -- the profile a flat
  // per-foot rate is probably learned from.
  const shallow = calculateBid(buildJob({
    depth: 'shallow', pipe: 'four', soil: 'dirt', outlet: 'daylight',
    linearFeet: 40, extraSolidFeet: 0, catchBasins: 0, downspoutTies: 0, drivewayFeet: 0,
    addCatchBasins: false, addDownspouts: false, addDriveway: false, addLawnRestore: true,
  }));
  assert.equal(shallow.totalHours.toFixed(1), '9.3');
  assert.equal(shallow.totalCost.toFixed(2), '1303.85');
  assert.equal(shallow.price.toFixed(2), '1862.64');
  assert.equal(shallow.pricePerFoot.toFixed(2), '46.57');

  // Twice the footage, deep clay, a drywell, two basins, three downspout
  // ties, and a driveway crossing.
  const deep = calculateBid(buildJob({
    depth: 'deep', pipe: 'six', soil: 'clay', outlet: 'drywell',
    linearFeet: 80, extraSolidFeet: 0, catchBasins: 2, downspoutTies: 3, drivewayFeet: 15,
    addCatchBasins: true, addDownspouts: true, addDriveway: true, addLawnRestore: true,
  }));
  assert.equal(deep.totalHours.toFixed(1), '45.3');
  assert.equal(deep.totalCost.toFixed(2), '6177.40');
  assert.equal(deep.price.toFixed(2), '8824.85');
  assert.equal(deep.pricePerFoot.toFixed(2), '110.31');

  // A rate learned per foot from the shallow job, applied to the deep
  // job's footage, reproduces that same per-foot rate times eighty feet.
  const flatPriceOnDeepFeet = shallow.pricePerFoot * deep.linearFeet;
  assert.equal(flatPriceOnDeepFeet.toFixed(2), '3725.28');
  assert.ok(
    flatPriceOnDeepFeet < deep.totalCost,
    'the flat-rate price should quote below the deep job\'s own break-even cost',
  );
  assert.equal((deep.totalCost - flatPriceOnDeepFeet).toFixed(2), '2452.12');
  assert.equal((deep.price - flatPriceOnDeepFeet).toFixed(2), '5099.58');

  assert.match(html, /\$1,862\.64/);
  assert.match(html, /\$46\.57/);
  assert.match(html, /\$6,177\.40/);
  assert.match(html, /\$8,824\.85/);
  assert.match(html, /\$110\.31/);
  assert.match(html, /\$3,725\.28/);
  assert.match(html, /\$2,452\.12/);
  assert.match(html, /\$5,099\.58/);
  assert.match(html, /9\.3 crew-hours/);
  assert.match(html, /45\.3 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-a-french-drain\.html"/);
});

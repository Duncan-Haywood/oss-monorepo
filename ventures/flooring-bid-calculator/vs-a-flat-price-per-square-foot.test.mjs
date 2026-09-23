import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-rfms.html, which
  // does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /RFMS/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-square-foot\.html">/);
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
  const { calculateBid, MATERIAL_PRESETS, TEAROUT_PRESETS } = await import('./calc.mjs');

  const shared = {
    materialCostPerSqFt: 2.40,
    underlaymentCostPerSqFt: 0.35,
    hourlyWage: 28,
    burdenRate: 30,
    dumpFee: 85,
    travelCost: 40,
    otherCost: 0,
    overheadRate: 12,
    targetMargin: 25,
    proposedPrice: null,
  };

  const lvp = MATERIAL_PRESETS.find((p) => p.label === 'LVP / vinyl plank (straight lay)');
  const noTearout = TEAROUT_PRESETS.find((p) => p.label === 'None — empty or new construction');
  const tile = MATERIAL_PRESETS.find((p) => p.label === 'Porcelain / large-format tile');
  const tileTearout = TEAROUT_PRESETS.find((p) => p.label === 'Ceramic tile');
  assert.ok(lvp && noTearout && tile && tileTearout, 'expected material/tear-out presets not found in calc.mjs');

  // The empty-room, new-construction brochure job -- the profile a flat
  // per-square-foot rate is probably learned from.
  const easy = calculateBid({
    ...shared,
    rooms: [{
      name: 'Whole house',
      squareFeet: 300,
      wastePct: lvp.wastePct,
      installSqFtPerHour: lvp.installSqFtPerHour,
      tearoutHoursPer100: noTearout.hoursPer100,
      disposalPerSqFt: noTearout.disposalPerSqFt,
    }],
    stairTreads: 0, hoursPerTread: 0.4, stairMaterialEach: 18,
    transitionCount: 0, hoursPerTransition: 0.15, transitionMaterialEach: 12,
    furnitureRooms: 0, hoursPerFurnitureRoom: 0.75,
    levelingSqFt: 0, hoursPer100Leveling: 0.8, levelingMaterialPerSqFt: 0.9,
    baseboardLf: 0, hoursPer100Baseboard: 1.2, baseboardMaterialPerLf: 1.1,
  });
  assert.equal(easy.installedSqFt, 300);
  assert.equal(easy.laborHours.toFixed(1), '3.8');
  assert.equal(easy.jobCost.toFixed(2), '1290.80');
  assert.equal(easy.price.toFixed(2), '1721.07');
  assert.equal(easy.pricePerInstalledSqFt.toFixed(2), '5.74');

  // Same 300 square feet, but porcelain tile over an existing ceramic
  // tear-out, plus stairs, transitions, furniture moves, leveling, and
  // baseboard.
  const hard = calculateBid({
    ...shared,
    rooms: [{
      name: 'Whole house',
      squareFeet: 300,
      wastePct: tile.wastePct,
      installSqFtPerHour: tile.installSqFtPerHour,
      tearoutHoursPer100: tileTearout.hoursPer100,
      disposalPerSqFt: tileTearout.disposalPerSqFt,
    }],
    stairTreads: 13, hoursPerTread: 0.4, stairMaterialEach: 18,
    transitionCount: 6, hoursPerTransition: 0.15, transitionMaterialEach: 12,
    furnitureRooms: 2, hoursPerFurnitureRoom: 0.75,
    levelingSqFt: 80, hoursPer100Leveling: 0.8, levelingMaterialPerSqFt: 0.9,
    baseboardLf: 140, hoursPer100Baseboard: 1.2, baseboardMaterialPerLf: 1.1,
  });
  assert.equal(hard.installedSqFt, 300);
  assert.equal(hard.laborHours.toFixed(1), '32.6');
  assert.equal(hard.jobCost.toFixed(2), '3311.73');
  assert.equal(hard.price.toFixed(2), '4415.64');
  assert.equal(hard.pricePerInstalledSqFt.toFixed(2), '14.72');

  // A rate learned per square foot from the empty-room job, applied to the
  // harder job's identical footage, reproduces that same rate times 300.
  const flatOnHard = easy.pricePerInstalledSqFt * hard.installedSqFt;
  assert.equal(flatOnHard.toFixed(2), '1721.07');
  assert.ok(
    flatOnHard < hard.jobCost,
    "the flat-rate price should quote below the harder job's own break-even cost",
  );
  assert.equal((hard.jobCost - flatOnHard).toFixed(2), '1590.67');
  assert.equal((hard.price - flatOnHard).toFixed(2), '2694.58');

  assert.match(html, /\$1,721\.07/);
  assert.match(html, /\$5\.74/);
  assert.match(html, /\$3,311\.73/);
  assert.match(html, /\$4,415\.64/);
  assert.match(html, /\$14\.72/);
  assert.match(html, /\$1,590\.67/);
  assert.match(html, /\$2,694\.58/);
  assert.match(html, /3\.8 crew-hours/);
  assert.match(html, /32\.6 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});

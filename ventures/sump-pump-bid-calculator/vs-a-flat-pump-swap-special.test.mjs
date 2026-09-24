import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-pump-swap-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the "nothing leaves your browser" privacy line and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat pump-swap
  // special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-servicetitan.html,
  // which names a real product.
  assert.doesNotMatch(html, /ServiceTitan/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-pump-swap-special\.html">/);
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

test('the worked-example figures match calc.mjs on the two suggested-preset jobs', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const rates = () => ({
    hoursTrip: 0.85, hoursSwap: 1.1, hoursNewPit: 0, hoursSlabCut: 0,
    hoursPerExtraDischargeFoot: 0.12, hoursBattery: 0, hoursWaterBackup: 0,
    hoursAlarm: 0.35, hoursFreeze: 0.45, siteHours: 0.5,
    pumpCost: 185, basinCost: 0, slabCutCost: 0, dischargePerFoot: 6.5,
    checkValveCost: 38, batteryCost: 0, waterBackupCost: 0, alarmCost: 45,
    freezeCost: 65, permitFee: 0, hourlyWage: 42, burdenRate: 34,
    travelAndEquipment: 85, overheadRate: 16, targetMargin: 30,
  });

  // The brochure swap: existing pit, 1/3 HP, no backup, discharge within
  // the included first fifteen feet -- the job a flat swap special is
  // usually priced against.
  const swap = {
    ...rates(),
    pump: 'third-hp', pit: 'existing', backup: 'none',
    dischargeFeet: 15, includedDischargeFeet: 15,
    addAlarm: false, addCheckValve: true, freezeProtect: false,
  };
  // Same trip, but the pit needs a new basin cut through a slab, a 1/2 HP
  // pump, forty feet of discharge, and a battery backup -- using
  // suggestedPumpKit('half-hp'), suggestedPitKit('new-slab'), and
  // suggestedBackupKit('battery') for the added hours and costs.
  const slabAndBattery = {
    ...rates(),
    pump: 'half-hp', pit: 'new-slab', backup: 'battery',
    dischargeFeet: 40, includedDischargeFeet: 15,
    addAlarm: true, addCheckValve: true, freezeProtect: false,
    hoursSwap: 1.25, hoursNewPit: 2.8, hoursSlabCut: 2.4, hoursBattery: 1.1,
    pumpCost: 265, basinCost: 95, slabCutCost: 285, batteryCost: 420,
  };

  const swapResult = calculateBid(swap);
  assert.equal(swapResult.totalCost.toFixed(2), '517.23');
  assert.equal(swapResult.price.toFixed(2), '738.90');

  const heavyResult = calculateBid(slabAndBattery);
  assert.equal(heavyResult.totalCost.toFixed(2), '2418.52');
  assert.equal(heavyResult.price.toFixed(2), '3455.03');

  assert.ok(heavyResult.totalCost / swapResult.totalCost > 4.6);
  assert.ok(swapResult.price < heavyResult.totalCost, "the swap special's price should quote below the heavy job's own break-even cost");
  assert.equal((heavyResult.totalCost - swapResult.price).toFixed(2), '1679.62');
  assert.equal((heavyResult.price - swapResult.price).toFixed(2), '2716.13');
  assert.equal((heavyResult.price / swapResult.price).toFixed(2), '4.68');

  assert.match(html, /\$517\.23/);
  assert.match(html, /\$738\.90/);
  assert.match(html, /\$2,418\.52/);
  assert.match(html, /\$3,455\.03/);
  assert.match(html, /\$1,679\.62/);
  assert.match(html, /\$2,716\.13/);
  assert.match(html, /4\.68/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-pump-swap-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-pump-swap-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-a-sump-pump\.html"/);
});

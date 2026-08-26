import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const faq = readFileSync(new URL('./how-much-to-charge-to-install-a-mini-split.html', import.meta.url), 'utf8');

test('landing page names the installer problem and the calculator', () => {
  assert.match(page, /Bid the run and the circuit, not the head/);
  assert.match(page, /<title>Mini-Split Install Bid Calculator/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /not legal, tax, financial, engineering/);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Copy bid summary/);
});

test('FAQ page answers the search query and links back to the calculator', () => {
  assert.match(faq, /How much to charge to install a mini split/);
  assert.match(faq, /FAQPage/);
  assert.match(faq, /index.html/);
  assert.match(faq, /No warranty/);
});

test('default form values produce the same bid the page starts from', () => {
  const result = calculateBid({
    headCount: 1,
    btuPerHead: 12000,
    outdoorUnitCost: 1400,
    indoorHeadCostEach: 550,
    branchBoxCost: 0,
    lineSetFeet: 15,
    includedFeetPerHead: 15,
    lineSetMaterialPerExtraFoot: 12,
    hoursPerExtraTenFeet: 1,
    headTypeFactor: 1,
    storyFactor: 1,
    indoorHoursPerHead: 4,
    outdoorHours: 3,
    commissionHoursPerHead: 1,
    hourlyWage: 42,
    burdenRate: 30,
    electricalHours: 0,
    electricalMaterial: 0,
    condensateHours: 0,
    condensateMaterial: 0,
    permitFee: 175,
    travelAndLift: 85,
    overheadRate: 15,
    targetMargin: 22,
  });
  assert.ok(result.price > 3500 && result.price < 4500);
  assert.ok(result.pricePerHead > 3500 && result.pricePerHead < 4500);
  assert.match(page, /value="12000"/);
  assert.match(page, /value="1400"/);
});

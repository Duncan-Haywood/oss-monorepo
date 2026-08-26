import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const faq = readFileSync(new URL('./how-much-to-charge-to-install-solar-panels.html', import.meta.url), 'utf8');

test('landing page names the installer problem and the calculator', () => {
  assert.match(page, /Bid the roof and the service, not the watts/);
  assert.match(page, /<title>Solar PV Install Bid Calculator/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /not legal, tax, financial, engineering/);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Copy bid summary/);
});

test('FAQ page answers the search query and links back to the calculator', () => {
  assert.match(faq, /How much to charge to install solar panels/);
  assert.match(faq, /FAQPage/);
  assert.match(faq, /index.html/);
  assert.match(faq, /No warranty/);
});

test('default form values produce the same bid the page starts from', () => {
  const result = calculateBid({
    moduleCount: 26,
    wattsPerModule: 390,
    moduleCostEach: 140,
    inverterCost: 1800,
    rackingPerModule: 45,
    bosPerWatt: 0.18,
    roofFactor: 1,
    laborHoursPerKw: 10,
    hourlyWage: 38,
    burdenRate: 30,
    electricalHours: 0,
    electricalMaterial: 0,
    batteryHours: 0,
    batteryMaterial: 0,
    permitAndInterconnection: 850,
    designEngineering: 400,
    travelDumpsterLift: 250,
    overheadRate: 15,
    targetMargin: 20,
  });
  assert.ok(result.price > 20000 && result.price < 23000);
  assert.ok(result.pricePerWatt > 2 && result.pricePerWatt < 2.3);
  assert.match(page, /value="26"/);
  assert.match(page, /value="390"/);
});

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSupplyResponsibility, compareInitialClean } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./5x-vs-3x-cleaning-price.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-let-them-buy-the-paper.html', import.meta.url), 'utf8');
const initialSeo = readFileSync(new URL('./should-i-throw-in-the-initial-clean.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the bid page wires the frequency-cut comparison without a build step', () => {
  assert.match(html, /compareFrequencyReduction/);
  assert.match(html, /frequencyReductionNote/);
  assert.match(html, /id="currentWeekly"/);
  assert.match(html, /id="proposedWeekly"/);
  assert.match(html, /id="clientOfferMonthly"/);
  assert.match(html, /id="frequencyCompare"/);
  assert.match(html, /id="copyFrequencyNote"/);
  assert.match(html, /frequency_reduction_compared/);
  assert.match(html, /frequency_note_copied/);
  assert.match(html, /5x-vs-3x-cleaning-price\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the 5× vs 3× landing page is crawlable and sends people to the calculator', () => {
  assert.match(seo, /<title>5x vs 3x commercial cleaning price/);
  assert.match(seo, /name="description"/);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /href="\.\/"/);
  assert.match(seo, /Best-effort hosting, no SLA/);
  assert.match(seo, /\$1,069/);
});

test('the bid page wires the who-supplies comparison without a build step', () => {
  assert.match(html, /compareSupplyResponsibility/);
  assert.match(html, /supplyResponsibilityNote/);
  assert.match(html, /id="restroomSharePercent"/);
  assert.match(html, /id="emergencyFillMonthly"/);
  assert.match(html, /id="supplyOfferMonthly"/);
  assert.match(html, /id="supplyCompare"/);
  assert.match(html, /id="copySupplyNote"/);
  assert.match(html, /supply_responsibility_compared/);
  assert.match(html, /supply_note_copied/);
  assert.match(html, /should-i-let-them-buy-the-paper\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the paper-handoff landing page uses the same worked example the tests lock', () => {
  const comparison = compareSupplyResponsibility({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { restroomSharePercent: 65, emergencyFillMonthly: 35 });
  assert.match(supplySeo, /<title>Should I let the building buy the paper/);
  assert.match(supplySeo, /name="description"/);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /href="\.\/"/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.match(supplySeo, /\$1,720\.00/);
  assert.match(supplySeo, /\$1,682\.62/);
  assert.match(supplySeo, /\$1,662\.50/);
  assert.match(supplySeo, /\$1,732\.94/);
  assert.match(supplySeo, /\$12\.94/);
  assert.ok(Math.abs(comparison.theyBuyRestroom.monthlyPrice - 1682.6225) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlyPrice - 1732.935) < 1e-9);
  assert.match(sitemap, /should-i-let-them-buy-the-paper\.html/);
});

test('the bid page wires the initial-clean comparison without a build step', () => {
  assert.match(html, /compareInitialClean/);
  assert.match(html, /initialCleanNote/);
  assert.match(html, /id="initialVisitMultiplier"/);
  assert.match(html, /id="initialExtraSupplies"/);
  assert.match(html, /id="initialAmortizeMonths"/);
  assert.match(html, /id="initialCancelAfterMonths"/);
  assert.match(html, /id="initialOfferMonthly"/);
  assert.match(html, /id="initialCompare"/);
  assert.match(html, /id="copyInitialNote"/);
  assert.match(html, /el\('initThrownMonth1'\)\.textContent = signedMoney/);
  assert.match(html, /initial_clean_compared/);
  assert.match(html, /initial_clean_note_copied/);
  assert.match(html, /should-i-throw-in-the-initial-clean\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the initial-clean landing page uses the same worked example the tests lock', () => {
  const comparison = compareInitialClean({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { visitMultiplier: 5, extraSupplies: 80, amortizeMonths: 12, cancelAfterMonths: 1 });
  assert.match(initialSeo, /<title>Should I throw in the initial clean/);
  assert.match(initialSeo, /name="description"/);
  assert.match(initialSeo, /FAQPage/);
  assert.match(initialSeo, /href="\.\/"/);
  assert.match(initialSeo, /Best-effort hosting, no SLA/);
  assert.match(initialSeo, /\$490\.36/);
  assert.match(initialSeo, /\$1,720\.00/);
  assert.match(initialSeo, /\$48\.29/);
  assert.match(initialSeo, /\$1,768\.29/);
  assert.match(initialSeo, /\$1,760\.86/);
  assert.match(initialSeo, /\$442\.07/);
  assert.match(initialSeo, /GitHub Sponsors/);
  assert.ok(Math.abs(comparison.initialPrice - 490.36) < 0.005);
  assert.ok(Math.abs(comparison.thrownInMonth1Profit + 48.29) < 0.01);
  assert.match(sitemap, /should-i-throw-in-the-initial-clean\.html/);
});

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { compareCosts } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./when-does-futa-suta-stop-accruing.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to the FUTA/SUTA accrual guide, and it is in the sitemap', () => {
  assert.match(index, /when-does-futa-suta-stop-accruing\.html/);
  assert.match(sitemap, /when-does-futa-suta-stop-accruing\.html/);
});

test('the guide\'s week-by-week crossing points match calc.mjs on the tool\'s own default example', () => {
  const weeklyWage = 28 * 40; // the form's default hourly wage and hours
  const futaWageBase = 7000; // the form's default
  const sutaWageBase = 9500; // the form's default

  let cumulative = 0;
  let futaWeek = null;
  let sutaWeek = null;
  for (let week = 1; week <= 52; week += 1) {
    cumulative += weeklyWage;
    if (futaWeek === null && cumulative >= futaWageBase) futaWeek = week;
    if (sutaWeek === null && cumulative >= sutaWageBase) sutaWeek = week;
  }

  assert.equal(futaWeek, 7, 'the guide claims FUTA crosses in week 7');
  assert.equal(sutaWeek, 9, 'the guide claims SUTA crosses in week 9');
  assert.match(guide, /crosses? (?:it )?during week 7|during week 7/);
  assert.match(guide, /during week 9/);
});

test('the guide\'s annual dollar figures match compareCosts at the tool\'s own defaults', () => {
  const result = compareCosts({
    employeeHourlyWage: 28,
    employeeHoursPerWeek: 40,
    employeeWeeksPerYear: 52,
    ficaPercent: 7.65,
    futaPercent: 0.6,
    futaWageBase: 7000,
    sutaPercent: 2.7,
    sutaWageBase: 9500,
    workersCompRate: 1.5,
    ptoHolidayPercent: 5.8,
    retirementMatchPercent: 0,
    healthInsuranceMonthly: 500,
    payrollAdminAnnual: 600,
    onboardingOneTimeCost: 1200,
    contractorHourlyRate: 40,
    contractorHoursPerYear: 2080,
    contractorAdminAnnual: 75,
    contractorOneTimeCost: 0,
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.equal(result.annualWages, 58240);

  const futaItem = result.burden.items.find((item) => item.key === 'futa');
  const sutaItem = result.burden.items.find((item) => item.key === 'suta');
  assert.equal(Math.round(futaItem.amount * 100) / 100, 42);
  assert.equal(Math.round(sutaItem.amount * 100) / 100, 256.5);

  assert.match(guide, /\$42 \(0\.6% of/);
  assert.match(guide, /\$256\.50 \(2\.7% of/);

  // The flat-rate comparison the guide makes: the same two rates applied to
  // full annual wages instead of the capped base.
  const flatFuta = (0.6 / 100) * result.annualWages;
  const flatSuta = (2.7 / 100) * result.annualWages;
  assert.equal(Math.round(flatFuta * 100) / 100, 349.44);
  assert.equal(Math.round(flatSuta * 100) / 100, 1572.48);
  assert.match(guide, /\$349\.44/);
  assert.match(guide, /\$1,572\.48/);
});

test('the guide carries a working FAQPage block whose questions are also rendered as visible copy', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, 'expected a FAQPage JSON-LD block');
  const ld = JSON.parse(match[1]);
  assert.ok(ld.mainEntity.length >= 3);
  for (const entry of ld.mainEntity) {
    assert.ok(guide.includes(entry.name), `question not rendered as visible copy: ${entry.name}`);
    assert.ok(guide.includes(entry.acceptedAnswer.text), `answer not rendered as visible copy: ${entry.name}`);
  }
});

test('the guide never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the guide carries the standard no-warranty and best-effort-hosting disclaimers', () => {
  assert.match(guide, /No warranty/);
  assert.match(guide, /Best-effort hosting, no SLA/);
});

test('the guide links back to the calculator', () => {
  assert.match(guide, /href="\.\/"/);
});

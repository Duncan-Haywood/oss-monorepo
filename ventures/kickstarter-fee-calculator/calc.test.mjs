import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processingFor,
  calculatePledge,
  calculateCampaign,
  PLATFORM_FEE_RATE,
  MICRO_PLEDGE_THRESHOLD,
  STANDARD_PROCESSING_RATE,
  STANDARD_PROCESSING_FLAT,
  MICRO_PROCESSING_RATE,
  MICRO_PROCESSING_FLAT,
} from './calc.mjs';

test('processingFor: standard tier at and above the $10 threshold', () => {
  assert.equal(processingFor(10).tier, 'standard');
  assert.equal(processingFor(100).tier, 'standard');
  const { fee } = processingFor(100);
  assert.ok(Math.abs(fee - (100 * STANDARD_PROCESSING_RATE + STANDARD_PROCESSING_FLAT)) < 1e-9);
});

test('processingFor: micro tier strictly under $10', () => {
  assert.equal(processingFor(9.99).tier, 'micro');
  assert.equal(processingFor(1).tier, 'micro');
  const { fee } = processingFor(5);
  assert.ok(Math.abs(fee - (5 * MICRO_PROCESSING_RATE + MICRO_PROCESSING_FLAT)) < 1e-9);
});

test('calculatePledge: a $100 pledge', () => {
  const result = calculatePledge({ pledgeAmount: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.tier, 'standard');
  assert.ok(Math.abs(result.platformFee - 5) < 1e-9);
  assert.ok(Math.abs(result.processingFee - 3.20) < 1e-9);
  assert.ok(Math.abs(result.totalFee - 8.20) < 1e-9);
  assert.ok(Math.abs(result.netContribution - 91.80) < 1e-9);
  assert.ok(Math.abs(result.effectiveRate - 8.20) < 1e-9);
});

test('calculatePledge: a $5 micro-pledge', () => {
  const result = calculatePledge({ pledgeAmount: 5 });
  assert.equal(result.tier, 'micro');
  assert.ok(Math.abs(result.platformFee - 0.25) < 1e-9);
  assert.ok(Math.abs(result.processingFee - 0.30) < 1e-9);
  assert.ok(Math.abs(result.totalFee - 0.55) < 1e-9);
});

test('calculatePledge: rejects a missing or negative amount', () => {
  assert.equal(calculatePledge({ pledgeAmount: '' }).ok, false);
  assert.equal(calculatePledge({ pledgeAmount: -1 }).ok, false);
  assert.equal(calculatePledge({ pledgeAmount: 'abc' }).ok, false);
});

test('calculateCampaign: the same total, fewer/larger backers keeps more', () => {
  const fewerBackers = calculateCampaign({ totalRaised: 10000, backerCount: 100 }); // avg $100
  const moreBackers = calculateCampaign({ totalRaised: 10000, backerCount: 1000 }); // avg $10
  assert.equal(fewerBackers.ok, true);
  assert.equal(moreBackers.ok, true);
  assert.ok(
    fewerBackers.netPayout > moreBackers.netPayout,
    `expected fewer, larger backers to keep more: ${fewerBackers.netPayout} vs ${moreBackers.netPayout}`,
  );
  assert.ok(fewerBackers.effectiveRate < moreBackers.effectiveRate);
});

test('calculateCampaign: matches summing calculatePledge across every backer, at a uniform average', () => {
  const totalRaised = 10000;
  const backerCount = 200; // avg $50, standard tier
  const campaign = calculateCampaign({ totalRaised, backerCount });
  const perPledge = calculatePledge({ pledgeAmount: totalRaised / backerCount });
  assert.ok(Math.abs(campaign.totalFee - (perPledge.totalFee * backerCount)) < 1e-6);
  assert.ok(Math.abs(campaign.netPayout - (totalRaised - perPledge.totalFee * backerCount)) < 1e-6);
});

test('calculateCampaign: flags the micro-pledge tier when the average pledge is under $10', () => {
  const result = calculateCampaign({ totalRaised: 900, backerCount: 100 }); // avg $9
  assert.equal(result.tier, 'micro');
  assert.ok(result.notes.some((n) => /micro-pledge tier/.test(n)));
});

test('calculateCampaign: always notes the funded-only condition', () => {
  const result = calculateCampaign({ totalRaised: 5000, backerCount: 50 });
  assert.ok(result.notes.some((n) => /only charges these fees if the funding goal is met/.test(n)));
});

test('calculateCampaign: rejects a zero or fractional backer count', () => {
  assert.equal(calculateCampaign({ totalRaised: 1000, backerCount: 0 }).ok, false);
  assert.equal(calculateCampaign({ totalRaised: 1000, backerCount: 2.5 }).ok, false);
});

test('published constants match Kickstarter\'s own published US schedule', () => {
  assert.equal(PLATFORM_FEE_RATE, 0.05);
  assert.equal(MICRO_PLEDGE_THRESHOLD, 10);
  assert.equal(STANDARD_PROCESSING_RATE, 0.03);
  assert.equal(STANDARD_PROCESSING_FLAT, 0.20);
  assert.equal(MICRO_PROCESSING_RATE, 0.05);
  assert.equal(MICRO_PROCESSING_FLAT, 0.05);
});

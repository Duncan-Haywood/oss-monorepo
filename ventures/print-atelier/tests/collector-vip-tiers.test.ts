import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineCollectorVipTier,
  registerCollector,
  getCollector,
  evaluatePrivateViewAccess,
  recordPrivateViewRSVP,
  getCollectorVipSummary,
  resetCollectorVipStore,
  generateConvexCollectorVipSchema,
  CollectorProfile,
} from '../src/lib/collector-vip-tiers';

describe('Collector VIP Membership Tiers & Private View Engine', () => {
  beforeEach(() => {
    resetCollectorVipStore();
  });

  const sampleCollector: CollectorProfile = {
    collectorId: 'col_001',
    name: 'Elena Rostova',
    email: 'elena@artcollector.org',
    totalSpendUSD: 12000,
    totalPrintsAcquired: 6,
    exhibitionPassesAttended: 3,
    joinedAtTimestamp: Date.now() - 86400000 * 30,
  };

  it('should correctly determine VIP tiers based on spend and prints acquired', () => {
    assert.equal(determineCollectorVipTier(500, 1), 'collector_bronze');
    assert.equal(determineCollectorVipTier(2500, 2), 'collector_silver');
    assert.equal(determineCollectorVipTier(7500, 5), 'collector_gold');
    assert.equal(determineCollectorVipTier(20000, 10), 'patron_platinum');
    assert.equal(determineCollectorVipTier(50000, 25), 'benefactor_diamond');
  });

  it('should throw error for negative spend or print counts', () => {
    assert.throws(() => determineCollectorVipTier(-100, 2), /Total spend and prints acquired must be non-negative/);
    assert.throws(() => determineCollectorVipTier(500, -1), /Total spend and prints acquired must be non-negative/);
  });

  it('should register and retrieve a collector profile', () => {
    const { profile, tier } = registerCollector(sampleCollector);
    assert.equal(profile.collectorId, 'col_001');
    assert.equal(tier, 'collector_gold');

    const retrieved = getCollector('col_001');
    assert.ok(retrieved);
    assert.equal(retrieved.email, 'elena@artcollector.org');
  });

  it('should throw error when registering invalid profile', () => {
    assert.throws(
      () => registerCollector({ ...sampleCollector, collectorId: '' }),
      /Collector ID and email are required/
    );
  });

  it('should evaluate private view access granted for qualifying tier and guest count', () => {
    registerCollector(sampleCollector);

    const evalResult = evaluatePrivateViewAccess('col_001', 'collector_silver', 2);
    assert.equal(evalResult.accessGranted, true);
    assert.equal(evalResult.tier, 'collector_gold');
    assert.equal(evalResult.vipDiscountPercent, 15);
    assert.equal(evalResult.maxGuestsAllowed, 4);
    assert.ok(evalResult.conciergePerks.includes('Priority Gallery Opening Passes'));
  });

  it('should deny private view access if collector tier is below required tier', () => {
    registerCollector({ ...sampleCollector, totalSpendUSD: 500, totalPrintsAcquired: 1 }); // Bronze

    const evalResult = evaluatePrivateViewAccess('col_001', 'collector_gold', 1);
    assert.equal(evalResult.accessGranted, false);
    assert.ok(evalResult.denialReason?.includes("does not meet minimum required tier 'collector_gold'"));
  });

  it('should deny private view access if requested guest count exceeds tier limit', () => {
    registerCollector(sampleCollector); // Gold (max 4 guests)

    const evalResult = evaluatePrivateViewAccess('col_001', 'collector_bronze', 6);
    assert.equal(evalResult.accessGranted, false);
    assert.ok(evalResult.denialReason?.includes('exceeds maximum allowed guests (4)'));
  });

  it('should record private view RSVPs and track in summary', () => {
    registerCollector(sampleCollector);
    const rsvp = recordPrivateViewRSVP('exhibition_winter_2026', 'col_001', 2, 'collector_silver', 'Champagne on arrival');

    assert.ok(rsvp.rsvpId.includes('exhibition_winter_2026_col_001'));
    assert.equal(rsvp.accessGranted, true);
    assert.equal(rsvp.specialRequests, 'Champagne on arrival');

    const summary = getCollectorVipSummary();
    assert.equal(summary.totalRegisteredCollectors, 1);
    assert.equal(summary.totalPrivateViewRSVPs, 1);
    assert.equal(summary.tierBreakdown.collector_gold, 1);
    assert.equal(summary.averageCollectorSpendUSD, 12000);
  });

  it('should generate Convex schema string for collector VIP tables', () => {
    const schema = generateConvexCollectorVipSchema();
    assert.ok(schema.includes('export const collectorProfiles = defineTable'));
    assert.ok(schema.includes('export const privateViewRSVPs = defineTable'));
    assert.ok(schema.includes('.index("by_collectorId", ["collectorId"])'));
  });

  it('should reset store properly', () => {
    registerCollector(sampleCollector);
    assert.ok(getCollector('col_001'));

    resetCollectorVipStore();
    assert.equal(getCollector('col_001'), undefined);
    assert.equal(getCollectorVipSummary().totalRegisteredCollectors, 0);
  });
});

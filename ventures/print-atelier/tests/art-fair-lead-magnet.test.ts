import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateArtFairCohort,
  scoreCollectorLead,
  CollectorLeadInput,
} from '../src/lib/art-fair-lead-magnet';

describe('art-fair-lead-magnet', () => {
  it('scores VIP collector with wall photo and AR preview as hot prospect', () => {
    const lead: CollectorLeadInput = {
      leadId: 'lead-101',
      collectorName: 'Sarah Jenkins',
      email: 'sarah@example.com',
      phone: '+15551234567',
      artFairName: 'Miami Art Basel 2026',
      boothNumber: 'B-42',
      interestLevel: 'vip_collector',
      budgetRangeUsd: { min: 2000, max: 5000 },
      preferredMediums: ['archival_giclee', 'acrylic_flush'],
      wallPhotoUploaded: true,
      arPreviewRequested: true,
      artworkIdInquired: 'print-001',
      artworkPriceUsd: 3200,
    };

    const result = scoreCollectorLead(lead);
    assert.equal(result.leadId, 'lead-101');
    assert.ok(result.conversionScore >= 70);
    assert.equal(result.tier, 'hot_prospect');
    assert.equal(result.recommendedIncentive, 'free_archival_framing');
    assert.equal(result.followUpWindowHours, 24);
    assert.ok(result.personalizedOfferCopy.includes('Miami Art Basel 2026'));
    assert.equal(result.estimatedLtvUsd, 5280); // 3200 * 1.65
  });

  it('scores casual booth visitor as nurture tier with AR consultation offer', () => {
    const lead: CollectorLeadInput = {
      leadId: 'lead-102',
      collectorName: 'John Doe',
      email: 'john@example.com',
      artFairName: 'Frieze London 2026',
      boothNumber: 'A-12',
      interestLevel: 'casual_visitor',
      budgetRangeUsd: { min: 200, max: 500 },
      preferredMediums: ['archival_giclee'],
      wallPhotoUploaded: false,
      arPreviewRequested: false,
    };

    const result = scoreCollectorLead(lead);
    assert.ok(result.conversionScore < 45);
    assert.equal(result.tier, 'nurture');
    assert.equal(result.recommendedIncentive, 'ar_wall_consultation');
    assert.equal(result.followUpWindowHours, 72);
  });

  it('recommends VIP presale discount for high score lead under $2000 budget', () => {
    const lead: CollectorLeadInput = {
      leadId: 'lead-103',
      collectorName: 'Elena Rostova',
      email: 'elena@example.com',
      artFairName: 'Armory Show NY',
      boothNumber: 'C-08',
      interestLevel: 'vip_collector',
      budgetRangeUsd: { min: 800, max: 1500 },
      preferredMediums: ['metallic_paper'],
      wallPhotoUploaded: true,
      arPreviewRequested: true,
    };

    const result = scoreCollectorLead(lead);
    assert.equal(result.tier, 'hot_prospect');
    assert.equal(result.recommendedIncentive, 'vip_presale_discount_15');
  });

  it('aggregates art fair cohort performance and ROI metrics', () => {
    const leads: CollectorLeadInput[] = [
      {
        leadId: 'lead-201',
        collectorName: 'Alice',
        email: 'alice@example.com',
        artFairName: 'Expo Chicago',
        boothNumber: '101',
        interestLevel: 'vip_collector',
        budgetRangeUsd: { min: 2000, max: 4000 },
        preferredMediums: ['canvas'],
        wallPhotoUploaded: true,
        arPreviewRequested: true,
        artworkPriceUsd: 3000,
      },
      {
        leadId: 'lead-202',
        collectorName: 'Bob',
        email: 'bob@example.com',
        artFairName: 'Expo Chicago',
        boothNumber: '101',
        interestLevel: 'interested_buyer',
        budgetRangeUsd: { min: 500, max: 1000 },
        preferredMediums: ['archival_giclee'],
        wallPhotoUploaded: false,
        arPreviewRequested: true,
        artworkPriceUsd: 750,
      },
      {
        leadId: 'lead-203',
        collectorName: 'Charlie',
        email: 'charlie@example.com',
        artFairName: 'Expo Chicago',
        boothNumber: '101',
        interestLevel: 'casual_visitor',
        budgetRangeUsd: { min: 100, max: 300 },
        preferredMediums: ['archival_giclee'],
        wallPhotoUploaded: false,
        arPreviewRequested: false,
      },
    ];

    const cohort = aggregateArtFairCohort('Expo Chicago', 1500, leads);
    assert.equal(cohort.artFairName, 'Expo Chicago');
    assert.equal(cohort.totalLeadsCaptured, 3);
    assert.equal(cohort.arPreviewConversionRatePercentage, 66.7);
    assert.ok(cohort.projectedGrossRevenueUsd > 1500);
    assert.ok(cohort.roiPercentage > 0);
  });

  it('handles empty cohort gracefully', () => {
    const cohort = aggregateArtFairCohort('Empty Fair', 2000, []);
    assert.equal(cohort.totalLeadsCaptured, 0);
    assert.equal(cohort.arPreviewConversionRatePercentage, 0);
    assert.equal(cohort.projectedGrossRevenueUsd, 0);
    assert.equal(cohort.roiPercentage, -100);
  });
});

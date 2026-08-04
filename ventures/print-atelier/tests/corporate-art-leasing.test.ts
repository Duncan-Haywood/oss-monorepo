import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CorporateLeaseQuoteParams,
  CorporateLeaseStore,
  calculateCorporateLeaseQuote,
  evaluateCorporateCreditPosture,
} from '../src/lib/corporate-art-leasing';

describe('corporate-art-leasing', () => {
  describe('calculateCorporateLeaseQuote', () => {
    it('calculates standard 12-month lease quote correctly', () => {
      const params: CorporateLeaseQuoteParams = {
        collectionValuationUsd: 10000,
        leaseTermMonths: 12,
        rotationFrequencyMonths: 6,
        framingGrade: 'gallery_standard',
        includeInsurance: false,
        corporateCreditTier: 'standard',
      };

      const quote = calculateCorporateLeaseQuote(params);
      // 10000 * 0.36 / 12 * 1.0 = $300 / mo
      assert.equal(quote.monthlyLeaseRateUsd, 300);
      assert.equal(quote.totalLeaseContractValueUsd, 3600); // 300 * 12
      // Residual buyout: 10000 * 0.40 = $4000
      assert.equal(quote.residualBuyoutPriceUsd, 4000);
      // Security deposit for standard tier: 15% of $10,000 = $1500
      assert.equal(quote.requiredSecurityDepositUsd, 1500);
      assert.ok(quote.estimatedNetMarginPercent > 0);
    });

    it('applies discounts for 36-month lease term and prime credit tier', () => {
      const params: CorporateLeaseQuoteParams = {
        collectionValuationUsd: 50000,
        leaseTermMonths: 36,
        rotationFrequencyMonths: 3,
        framingGrade: 'museum_archival',
        includeInsurance: true,
        corporateCreditTier: 'prime',
      };

      const quote = calculateCorporateLeaseQuote(params);
      // Insurance: (50000 * 0.03) / 12 = $125 / mo
      // Base lease: (50000 * 0.25) / 12 * 1.15 = 1041.66 * 1.15 = $1197.916 / mo
      // Total monthly: 1197.916 + 125 = $1322.92
      assert.equal(quote.monthlyLeaseRateUsd, 1322.92);
      // Security deposit for prime tier: 5% of $50,000 = $2500
      assert.equal(quote.requiredSecurityDepositUsd, 2500);
      // Residual buyout for 36 months: 15% of $50,000 = $7500
      assert.equal(quote.residualBuyoutPriceUsd, 7500);
    });

    it('calculates higher security deposit for high-risk credit tier', () => {
      const params: CorporateLeaseQuoteParams = {
        collectionValuationUsd: 20000,
        leaseTermMonths: 24,
        rotationFrequencyMonths: 12,
        framingGrade: 'minimalist_acrylic',
        includeInsurance: true,
        corporateCreditTier: 'high_risk',
      };

      const quote = calculateCorporateLeaseQuote(params);
      // Security deposit for high_risk: 30% of $20,000 = $6000
      assert.equal(quote.requiredSecurityDepositUsd, 6000);
      // Residual buyout for 24 months: 25% of $20,000 = $5000
      assert.equal(quote.residualBuyoutPriceUsd, 5000);
    });
  });

  describe('evaluateCorporateCreditPosture', () => {
    it('returns Net-60 terms and high lease valuation limit for prime accounts', () => {
      const posture = evaluateCorporateCreditPosture('prime', 2000000);
      assert.equal(posture.creditTier, 'prime');
      assert.equal(posture.paymentTerms, 'Net-60');
      assert.equal(posture.securityDepositPercent, 5);
      assert.equal(posture.maxAllowedLeaseValuationUsd, 200000); // 10% of 2M
    });

    it('caps lease valuation for standard accounts', () => {
      const posture = evaluateCorporateCreditPosture('standard', 500000);
      assert.equal(posture.creditTier, 'standard');
      assert.equal(posture.paymentTerms, 'Net-30');
      assert.equal(posture.securityDepositPercent, 15);
      assert.equal(posture.maxAllowedLeaseValuationUsd, 25000); // 5% of 500k = 25k
    });

    it('restricts lease terms and requires high deposit for high-risk accounts', () => {
      const posture = evaluateCorporateCreditPosture('high_risk', 100000);
      assert.equal(posture.creditTier, 'high_risk');
      assert.equal(posture.paymentTerms, 'Net-15');
      assert.equal(posture.securityDepositPercent, 30);
      assert.equal(posture.maxAllowedLeaseValuationUsd, 2000); // 2% of 100k
    });
  });

  describe('CorporateLeaseStore', () => {
    it('stores quotes and generates Convex schema definition', () => {
      const store = new CorporateLeaseStore();
      const quote = calculateCorporateLeaseQuote({
        collectionValuationUsd: 15000,
        leaseTermMonths: 12,
        rotationFrequencyMonths: 6,
        framingGrade: 'gallery_standard',
        includeInsurance: false,
        corporateCreditTier: 'standard',
      });

      store.recordQuote('q_100', quote);
      assert.deepEqual(store.getQuote('q_100'), quote);

      const schema = store.generateConvexSchema();
      assert.ok(schema.includes('corporate_lease_quotes'));
      assert.ok(schema.includes('monthlyLeaseRateUsd'));
    });
  });
});

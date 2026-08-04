import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ArAnalyticsStore,
  ArPreviewSession,
  GalleryFootTrafficEvent,
  calculateGalleryFootTrafficMetrics,
  evaluateArEngagement,
} from '../src/lib/ar-preview-analytics';

describe('ar-preview-analytics', () => {
  describe('evaluateArEngagement', () => {
    it('calculates low engagement for short dwell time and no interaction', () => {
      const session: ArPreviewSession = {
        sessionId: 'sess_1',
        artworkId: 'art_101',
        deviceType: 'ios_ar_kit',
        wallDetectionTimeMs: 1200,
        surfaceStabilityScore: 0.9,
        roomLightLevelLux: 350,
        dwellTimeSeconds: 5,
        frameSizeToggles: 0,
        screenshotCaptured: false,
        sharedToSocial: false,
        addedToCartFromAr: false,
        timestamp: '2026-08-02T10:00:00Z',
      };

      const result = evaluateArEngagement(session);
      assert.equal(result.sessionId, 'sess_1');
      assert.equal(result.artworkId, 'art_101');
      assert.equal(result.purchaseIntentTier, 'low');
      assert.equal(result.qualityRating, 'optimal');
      assert.equal(result.recommendedIntervention, undefined);
      assert.ok(result.engagementScore < 35);
    });

    it('calculates very high engagement and prompts curator consultation for extensive session', () => {
      const session: ArPreviewSession = {
        sessionId: 'sess_2',
        artworkId: 'art_202',
        collectorId: 'user_404',
        deviceType: 'ios_ar_kit',
        wallDetectionTimeMs: 800,
        surfaceStabilityScore: 0.95,
        roomLightLevelLux: 500,
        dwellTimeSeconds: 150, // 35 pts
        frameSizeToggles: 3, // 15 pts
        screenshotCaptured: true, // 10 pts
        sharedToSocial: true, // 5 pts
        addedToCartFromAr: false,
        timestamp: '2026-08-02T10:15:00Z',
      };

      const result = evaluateArEngagement(session);
      assert.equal(result.purchaseIntentTier, 'very_high');
      assert.equal(result.qualityRating, 'optimal');
      assert.equal(result.recommendedIntervention, 'offer_curator_consultation');
      assert.ok(result.engagementScore >= 80);
    });

    it('recommends checkout discount for high purchase intent without add to cart', () => {
      const session: ArPreviewSession = {
        sessionId: 'sess_3',
        artworkId: 'art_303',
        deviceType: 'android_ar_core',
        wallDetectionTimeMs: 1500,
        surfaceStabilityScore: 0.85,
        roomLightLevelLux: 400,
        dwellTimeSeconds: 70, // 25 pts
        frameSizeToggles: 2, // 10 pts
        screenshotCaptured: true, // 10 pts
        sharedToSocial: false,
        addedToCartFromAr: false,
        timestamp: '2026-08-02T10:30:00Z',
      };

      const result = evaluateArEngagement(session);
      assert.equal(result.purchaseIntentTier, 'high');
      assert.equal(result.recommendedIntervention, 'prompt_checkout_discount');
    });

    it('detects poor lighting and recommends free swatch offer', () => {
      const session: ArPreviewSession = {
        sessionId: 'sess_4',
        artworkId: 'art_404',
        deviceType: 'web_xr',
        wallDetectionTimeMs: 3000,
        surfaceStabilityScore: 0.6,
        roomLightLevelLux: 30, // Low Lux
        dwellTimeSeconds: 45,
        frameSizeToggles: 0,
        screenshotCaptured: false,
        sharedToSocial: false,
        addedToCartFromAr: false,
        timestamp: '2026-08-02T10:45:00Z',
      };

      const result = evaluateArEngagement(session);
      assert.equal(result.qualityRating, 'poor_lighting');
      assert.equal(result.recommendedIntervention, 'offer_free_swatch');
    });

    it('detects unstable surface environment', () => {
      const session: ArPreviewSession = {
        sessionId: 'sess_5',
        artworkId: 'art_505',
        deviceType: 'android_ar_core',
        wallDetectionTimeMs: 5000,
        surfaceStabilityScore: 0.3, // Unstable
        roomLightLevelLux: 200,
        dwellTimeSeconds: 15,
        frameSizeToggles: 0,
        screenshotCaptured: false,
        sharedToSocial: false,
        addedToCartFromAr: false,
        timestamp: '2026-08-02T11:00:00Z',
      };

      const result = evaluateArEngagement(session);
      assert.equal(result.qualityRating, 'unstable_surface');
    });
  });

  describe('calculateGalleryFootTrafficMetrics', () => {
    it('returns empty defaults for unknown gallery location', () => {
      const summary = calculateGalleryFootTrafficMetrics([], 'loc_unknown');
      assert.equal(summary.galleryLocationId, 'loc_unknown');
      assert.equal(summary.totalVisitors, 0);
      assert.equal(summary.avgDwellTimeSeconds, 0);
      assert.equal(summary.arConversionRate, 0);
      assert.equal(summary.peakHour, 'N/A');
    });

    it('aggregates gallery foot traffic and identifies peak hour', () => {
      const events: GalleryFootTrafficEvent[] = [
        {
          eventId: 'evt_1',
          galleryLocationId: 'loc_london',
          collectionId: 'col_modern',
          visitorCount: 50,
          avgDwellTimeSeconds: 300,
          arQrScans: 10,
          timestamp: '2026-08-02T14:00:00Z',
        },
        {
          eventId: 'evt_2',
          galleryLocationId: 'loc_london',
          collectionId: 'col_abstract',
          visitorCount: 150,
          avgDwellTimeSeconds: 450,
          arQrScans: 45,
          timestamp: '2026-08-02T14:30:00Z', // Same hour: 200 total visitors
        },
        {
          eventId: 'evt_3',
          galleryLocationId: 'loc_london',
          collectionId: 'col_photography',
          visitorCount: 80,
          avgDwellTimeSeconds: 200,
          arQrScans: 15,
          timestamp: '2026-08-02T16:00:00Z',
        },
      ];

      const summary = calculateGalleryFootTrafficMetrics(events, 'loc_london');
      assert.equal(summary.galleryLocationId, 'loc_london');
      assert.equal(summary.totalVisitors, 280);
      // Weighted avg dwell: (50*300 + 150*450 + 80*200) / 280 = (15000 + 67500 + 16000) / 280 = 98500 / 280 = 351.78 -> 352
      assert.equal(summary.avgDwellTimeSeconds, 352);
      // AR scan conversion: (10 + 45 + 15) / 280 = 70 / 280 = 25%
      assert.equal(summary.arConversionRate, 25);
      assert.equal(summary.peakHour, '2026-08-02T14:00');
    });
  });

  describe('ArAnalyticsStore', () => {
    it('stores AR preview sessions and generates valid Convex schema', () => {
      const store = new ArAnalyticsStore();
      const session: ArPreviewSession = {
        sessionId: 'sess_store_1',
        artworkId: 'art_99',
        deviceType: 'ios_ar_kit',
        wallDetectionTimeMs: 900,
        surfaceStabilityScore: 0.9,
        roomLightLevelLux: 300,
        dwellTimeSeconds: 100,
        frameSizeToggles: 1,
        screenshotCaptured: true,
        sharedToSocial: false,
        addedToCartFromAr: true,
        timestamp: '2026-08-02T12:00:00Z',
      };

      const result = store.recordArSession(session);
      assert.equal(result.purchaseIntentTier, 'high');
      assert.deepEqual(store.getArSession('sess_store_1'), session);

      const schema = store.generateConvexSchema();
      assert.ok(schema.includes('ar_preview_sessions'));
      assert.ok(schema.includes('gallery_foot_traffic_events'));
    });
  });
});

/**
 * AR Preview Analytics & Gallery Foot-Traffic Engagement Engine
 *
 * Measures augmented reality room placement sessions, wall detection stability,
 * lighting quality, frame size toggles, and physical/virtual gallery foot-traffic dwell
 * to predict high-value print purchase intent and optimize gallery conversions.
 */

export interface ArPreviewSession {
  sessionId: string;
  artworkId: string;
  collectorId?: string;
  deviceType: 'ios_ar_kit' | 'android_ar_core' | 'web_xr';
  wallDetectionTimeMs: number; // Time taken to anchor on wall surface
  surfaceStabilityScore: number; // 0.0 to 1.0 stability index
  roomLightLevelLux: number; // Ambient light level (lux)
  dwellTimeSeconds: number; // Time spent visualizing artwork on wall
  frameSizeToggles: number; // Number of size adjustments made
  screenshotCaptured: boolean;
  sharedToSocial: boolean;
  addedToCartFromAr: boolean;
  timestamp: string;
}

export interface ArEngagementResult {
  sessionId: string;
  artworkId: string;
  engagementScore: number; // 0 - 100
  purchaseIntentTier: 'low' | 'moderate' | 'high' | 'very_high';
  qualityRating: 'poor_lighting' | 'unstable_surface' | 'optimal';
  recommendedIntervention?: 'offer_free_swatch' | 'offer_curator_consultation' | 'prompt_checkout_discount';
}

export interface GalleryFootTrafficEvent {
  eventId: string;
  galleryLocationId: string;
  collectionId: string;
  visitorCount: number;
  avgDwellTimeSeconds: number;
  arQrScans: number;
  timestamp: string;
}

export interface GalleryTrafficSummary {
  galleryLocationId: string;
  totalVisitors: number;
  avgDwellTimeSeconds: number;
  arConversionRate: number; // % of foot traffic that scanned AR QR code
  peakHour: string;
}

export function evaluateArEngagement(session: ArPreviewSession): ArEngagementResult {
  let score = 0;

  // Dwell time scoring (up to 35 points)
  if (session.dwellTimeSeconds >= 120) {
    score += 35;
  } else if (session.dwellTimeSeconds >= 60) {
    score += 25;
  } else if (session.dwellTimeSeconds >= 30) {
    score += 15;
  } else if (session.dwellTimeSeconds >= 10) {
    score += 5;
  }

  // Interactive engagement (up to 30 points)
  if (session.frameSizeToggles > 0) {
    score += Math.min(session.frameSizeToggles * 5, 15);
  }
  if (session.screenshotCaptured) {
    score += 10;
  }
  if (session.sharedToSocial) {
    score += 5;
  }

  // Conversion / Intent signals (up to 20 points)
  if (session.addedToCartFromAr) {
    score += 20;
  }

  // Stability & surface quality (up to 15 points)
  if (session.surfaceStabilityScore >= 0.8) {
    score += 15;
  } else if (session.surfaceStabilityScore >= 0.5) {
    score += 8;
  }

  const finalScore = Math.min(Math.round(score), 100);

  // Classify purchase intent
  let purchaseIntentTier: ArEngagementResult['purchaseIntentTier'] = 'low';
  if (finalScore >= 80) {
    purchaseIntentTier = 'very_high';
  } else if (finalScore >= 60) {
    purchaseIntentTier = 'high';
  } else if (finalScore >= 35) {
    purchaseIntentTier = 'moderate';
  }

  // Assess environment quality rating
  let qualityRating: ArEngagementResult['qualityRating'] = 'optimal';
  if (session.roomLightLevelLux < 50) {
    qualityRating = 'poor_lighting';
  } else if (session.surfaceStabilityScore < 0.4) {
    qualityRating = 'unstable_surface';
  }

  // Recommend automated engagement interventions
  let recommendedIntervention: ArEngagementResult['recommendedIntervention'] = undefined;
  if (purchaseIntentTier === 'high' && !session.addedToCartFromAr) {
    recommendedIntervention = 'prompt_checkout_discount';
  } else if (purchaseIntentTier === 'very_high' && !session.addedToCartFromAr) {
    recommendedIntervention = 'offer_curator_consultation';
  } else if (qualityRating === 'poor_lighting' && session.dwellTimeSeconds > 30) {
    recommendedIntervention = 'offer_free_swatch';
  }

  return {
    sessionId: session.sessionId,
    artworkId: session.artworkId,
    engagementScore: finalScore,
    purchaseIntentTier,
    qualityRating,
    recommendedIntervention,
  };
}

export function calculateGalleryFootTrafficMetrics(
  events: GalleryFootTrafficEvent[],
  galleryLocationId: string
): GalleryTrafficSummary {
  const filtered = events.filter((e) => e.galleryLocationId === galleryLocationId);

  if (filtered.length === 0) {
    return {
      galleryLocationId,
      totalVisitors: 0,
      avgDwellTimeSeconds: 0,
      arConversionRate: 0,
      peakHour: 'N/A',
    };
  }

  const totalVisitors = filtered.reduce((acc, e) => acc + e.visitorCount, 0);
  const totalArScans = filtered.reduce((acc, e) => acc + e.arQrScans, 0);
  const weightedDwellSum = filtered.reduce((acc, e) => acc + e.avgDwellTimeSeconds * e.visitorCount, 0);
  const avgDwellTimeSeconds = totalVisitors > 0 ? Math.round(weightedDwellSum / totalVisitors) : 0;
  const arConversionRate = totalVisitors > 0 ? parseFloat(((totalArScans / totalVisitors) * 100).toFixed(2)) : 0;

  // Find peak hour by visitor count
  const hourlyCountMap = new Map<string, number>();
  for (const event of filtered) {
    const hourKey = new Date(event.timestamp).toISOString().substring(0, 13) + ':00';
    hourlyCountMap.set(hourKey, (hourlyCountMap.get(hourKey) || 0) + event.visitorCount);
  }

  let peakHour = 'N/A';
  let maxVisitors = -1;
  for (const [hour, count] of hourlyCountMap.entries()) {
    if (count > maxVisitors) {
      maxVisitors = count;
      peakHour = hour;
    }
  }

  return {
    galleryLocationId,
    totalVisitors,
    avgDwellTimeSeconds,
    arConversionRate,
    peakHour,
  };
}

// In-Memory Storage & Convex Schema Exporter
export class ArAnalyticsStore {
  private sessions = new Map<string, ArPreviewSession>();
  private events: GalleryFootTrafficEvent[] = [];

  recordArSession(session: ArPreviewSession): ArEngagementResult {
    this.sessions.set(session.sessionId, session);
    return evaluateArEngagement(session);
  }

  getArSession(sessionId: string): ArPreviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  recordGalleryEvent(event: GalleryFootTrafficEvent): void {
    this.events.push(event);
  }

  getGallerySummary(galleryLocationId: string): GalleryTrafficSummary {
    return calculateGalleryFootTrafficMetrics(this.events, galleryLocationId);
  }

  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ar_preview_sessions: defineTable({
    sessionId: v.string(),
    artworkId: v.string(),
    collectorId: v.optional(v.string()),
    deviceType: v.string(),
    wallDetectionTimeMs: v.number(),
    surfaceStabilityScore: v.number(),
    roomLightLevelLux: v.number(),
    dwellTimeSeconds: v.number(),
    frameSizeToggles: v.number(),
    screenshotCaptured: v.boolean(),
    sharedToSocial: v.boolean(),
    addedToCartFromAr: v.boolean(),
    timestamp: v.string(),
  }).index("by_artwork", ["artworkId"])
    .index("by_collector", ["collectorId"]),

  gallery_foot_traffic_events: defineTable({
    eventId: v.string(),
    galleryLocationId: v.string(),
    collectionId: v.string(),
    visitorCount: v.number(),
    avgDwellTimeSeconds: v.number(),
    arQrScans: v.number(),
    timestamp: v.string(),
  }).index("by_gallery_location", ["galleryLocationId"]),
});`;
  }
}

export const arAnalyticsStore = new ArAnalyticsStore();

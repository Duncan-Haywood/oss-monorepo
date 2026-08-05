/**
 * Automated Gallery Exhibition QR Code Attribution & Mobile Ticket Presale Engine
 *
 * Tracks physical gallery QR code scans across exhibition placement channels (wall plaques, print catalogs, window vinyl),
 * attributes online presale conversions, issues mobile presale tickets, and computes venue ROI metrics.
 */

import { SITE_URL_UNCONFIGURED_HINT, resolveSiteUrl } from './site-url';

export type QrPlacementType = 'wall_plaque' | 'print_catalog' | 'gallery_window' | 'vip_invitation_card';
export type TicketTier = 'general_admission' | 'collector_preview_pass' | 'artist_reception_vip';

export interface QrScanEvent {
  scanId: string;
  exhibitionSlug: string;
  artworkId?: string;
  placementType: QrPlacementType;
  visitorSessionId: string;
  deviceOs: 'ios' | 'android' | 'desktop' | 'other';
  scannedAt: number;
}

export interface MobileTicketRequest {
  ticketId: string;
  exhibitionSlug: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  ticketTier: TicketTier;
  quantity: number;
  unitPriceUsd: number;
  attributedScanId?: string;
  purchasedAt: number;
}

export interface QrScanAttributionResult {
  scanId: string;
  attributionChannel: QrPlacementType;
  leadQualityScore: number; // 0 - 100
  eligibleForInstantPresaleDiscount: boolean;
  presalePromoCode: string;
  processedAt: number;
}

export interface TicketPresaleResult {
  ticketId: string;
  totalPaidUsd: number;
  qrAttributed: boolean;
  attributedPlacement?: QrPlacementType;
  /**
   * Null when this deployment has no configured origin. It was previously typed
   * `string` and was always populated — with a link on `printatelier.com`, a
   * domain this venture does not serve. `null` is narrower than the wrong
   * string on purpose: every caller now has to decide what to do about a ticket
   * with no pass link, where before there was nothing to decide.
   */
  accessPassUrl: string | null;
  /**
   * Set only when `accessPassUrl` is null, so a refusal cannot be mistaken for
   * a ticket that simply had no link. The attendee has paid either way — the
   * `confirmationCode` below is still valid at the door — so this has to reach
   * an operator rather than disappear.
   */
  accessPassUnavailableReason?: string;
  confirmationCode: string;
}

export interface ExhibitionQrCampaignSummary {
  exhibitionSlug: string;
  totalScans: number;
  totalTicketsSold: number;
  qrAttributedTicketsCount: number;
  qrConversionRatePercent: number;
  totalAttributedRevenueUsd: number;
  topPerformingPlacement: QrPlacementType;
}

const scanStore = new Map<string, QrScanEvent>();
const ticketStore = new Map<string, MobileTicketRequest>();

export function recordQrScanEvent(scan: QrScanEvent): QrScanAttributionResult {
  scanStore.set(scan.scanId, scan);

  let leadQualityScore = 50;

  // Placement intent weighting
  if (scan.placementType === 'vip_invitation_card') {
    leadQualityScore += 35;
  } else if (scan.placementType === 'wall_plaque') {
    leadQualityScore += 25;
  } else if (scan.placementType === 'print_catalog') {
    leadQualityScore += 20;
  } else {
    leadQualityScore += 10;
  }

  // Device mobile optimization bonus
  if (scan.deviceOs === 'ios' || scan.deviceOs === 'android') {
    leadQualityScore += 15;
  }

  const finalScore = Math.min(leadQualityScore, 100);
  const eligibleForInstantPresaleDiscount = finalScore >= 70;
  const presalePromoCode = eligibleForInstantPresaleDiscount ? 'GALLERYQR15' : 'GALLERYQR10';

  return {
    scanId: scan.scanId,
    attributionChannel: scan.placementType,
    leadQualityScore: finalScore,
    eligibleForInstantPresaleDiscount,
    presalePromoCode,
    processedAt: Date.now(),
  };
}

export function processMobileTicketPresale(request: MobileTicketRequest): TicketPresaleResult {
  ticketStore.set(request.ticketId, request);

  const totalPaidUsd = parseFloat((request.quantity * request.unitPriceUsd).toFixed(2));
  let qrAttributed = false;
  let attributedPlacement: QrPlacementType | undefined;

  if (request.attributedScanId && scanStore.has(request.attributedScanId)) {
    const scan = scanStore.get(request.attributedScanId);
    qrAttributed = true;
    attributedPlacement = scan?.placementType;
  }

  const confirmationCode = `TIX-${request.exhibitionSlug.toUpperCase().slice(0, 4)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // The pass URL is handed to someone who has just paid for a ticket, and it
  // used to be hardcoded to `https://printatelier.com` — see
  // `src/lib/site-url.ts`. A relative path is no use here either: this is
  // rendered into a QR code and an SMS, both of which leave the app. So with no
  // configured origin no pass link is issued, and the reason travels with the
  // ticket rather than being logged and lost.
  const siteUrl = resolveSiteUrl();
  const accessPassUrl =
    siteUrl === null
      ? null
      : `${siteUrl}/tickets/pass/${request.ticketId}?code=${confirmationCode}`;

  return {
    ticketId: request.ticketId,
    totalPaidUsd,
    qrAttributed,
    attributedPlacement,
    accessPassUrl,
    ...(accessPassUrl === null
      ? {
          accessPassUnavailableReason:
            `No access pass link was issued: this deployment has no configured site ` +
            `origin, so the link would have to name a domain we cannot vouch for. ` +
            `The ticket is valid — admit on confirmation code ${confirmationCode}. ` +
            SITE_URL_UNCONFIGURED_HINT,
        }
      : {}),
    confirmationCode,
  };
}

export function summarizeExhibitionQrCampaign(exhibitionSlug: string): ExhibitionQrCampaignSummary {
  const exhibitionScans = Array.from(scanStore.values()).filter((s) => s.exhibitionSlug === exhibitionSlug);
  const exhibitionTickets = Array.from(ticketStore.values()).filter((t) => t.exhibitionSlug === exhibitionSlug);

  const totalScans = exhibitionScans.length;
  const totalTicketsSold = exhibitionTickets.reduce((acc, t) => acc + t.quantity, 0);

  let qrAttributedTicketsCount = 0;
  let totalAttributedRevenueUsd = 0;
  const placementCounts: Record<QrPlacementType, number> = {
    wall_plaque: 0,
    print_catalog: 0,
    gallery_window: 0,
    vip_invitation_card: 0,
  };

  for (const ticket of exhibitionTickets) {
    const amount = ticket.quantity * ticket.unitPriceUsd;
    if (ticket.attributedScanId && scanStore.has(ticket.attributedScanId)) {
      qrAttributedTicketsCount += ticket.quantity;
      totalAttributedRevenueUsd += amount;
      const scan = scanStore.get(ticket.attributedScanId);
      if (scan) {
        placementCounts[scan.placementType] = (placementCounts[scan.placementType] || 0) + 1;
      }
    }
  }

  let topPerformingPlacement: QrPlacementType = 'wall_plaque';
  let maxCount = -1;
  for (const [placement, count] of Object.entries(placementCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topPerformingPlacement = placement as QrPlacementType;
    }
  }

  const qrConversionRatePercent = totalScans > 0 ? parseFloat(((qrAttributedTicketsCount / totalScans) * 100).toFixed(2)) : 0;

  return {
    exhibitionSlug,
    totalScans,
    totalTicketsSold,
    qrAttributedTicketsCount,
    qrConversionRatePercent,
    totalAttributedRevenueUsd: parseFloat(totalAttributedRevenueUsd.toFixed(2)),
    topPerformingPlacement,
  };
}

export function clearQrAttributionStoreForTesting(): void {
  scanStore.clear();
  ticketStore.clear();
}

export class GalleryQrAttributionStore {
  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  gallery_qr_scans: defineTable({
    scanId: v.string(),
    exhibitionSlug: v.string(),
    artworkId: v.optional(v.string()),
    placementType: v.string(),
    deviceOs: v.string(),
    scannedAt: v.number(),
  }).index("by_exhibition", ["exhibitionSlug"])
    .index("by_placement", ["placementType"]),

  mobile_ticket_presales: defineTable({
    ticketId: v.string(),
    exhibitionSlug: v.string(),
    guestEmail: v.string(),
    ticketTier: v.string(),
    quantity: v.number(),
    unitPriceUsd: v.number(),
    attributedScanId: v.optional(v.string()),
    purchasedAt: v.number(),
  }).index("by_exhibition", ["exhibitionSlug"]),
});`;
  }
}

export const galleryQrAttributionStore = new GalleryQrAttributionStore();

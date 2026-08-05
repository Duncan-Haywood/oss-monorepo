import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  recordQrScanEvent,
  processMobileTicketPresale,
  summarizeExhibitionQrCampaign,
  clearQrAttributionStoreForTesting,
  GalleryQrAttributionStore,
  QrScanEvent,
  MobileTicketRequest,
} from "../src/lib/gallery-qr-attribution";

describe("gallery-qr-attribution", () => {
  // `processMobileTicketPresale` used to mint every access pass on the
  // hardcoded `https://printatelier.com`. It now builds the link from the
  // deployment's configured origin and issues none at all when there is not
  // one, so these tests have to declare an origin to get a link. The refusal
  // path has its own coverage in `gallery-links-unowned-domain.test.ts`.
  const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://atelier.marisstella.dev";
    clearQrAttributionStoreForTesting();
  });

  after(() => {
    if (savedSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
    }
  });

  const wallScan: QrScanEvent = {
    scanId: "scan_wall_001",
    exhibitionSlug: "abstract-perspectives-2026",
    artworkId: "art_print_888",
    placementType: "wall_plaque",
    visitorSessionId: "sess_mobile_99",
    deviceOs: "ios",
    scannedAt: Date.now(),
  };

  const catalogScan: QrScanEvent = {
    scanId: "scan_catalog_002",
    exhibitionSlug: "abstract-perspectives-2026",
    placementType: "print_catalog",
    visitorSessionId: "sess_mobile_100",
    deviceOs: "android",
    scannedAt: Date.now(),
  };

  const ticketOrder: MobileTicketRequest = {
    ticketId: "tix_req_501",
    exhibitionSlug: "abstract-perspectives-2026",
    guestName: "Samantha Reed",
    guestEmail: "samantha@galleryfan.com",
    guestPhone: "+15559876543",
    ticketTier: "collector_preview_pass",
    quantity: 2,
    unitPriceUsd: 45.0,
    attributedScanId: "scan_wall_001",
    purchasedAt: Date.now(),
  };

  describe("recordQrScanEvent", () => {
    it("scores scan lead quality and provides instant discount promo code", () => {
      const result = recordQrScanEvent(wallScan);

      assert.equal(result.scanId, "scan_wall_001");
      assert.equal(result.attributionChannel, "wall_plaque");
      assert.ok(result.leadQualityScore >= 80); // 50 base + 25 wall plaque + 15 ios
      assert.equal(result.eligibleForInstantPresaleDiscount, true);
      assert.equal(result.presalePromoCode, "GALLERYQR15");
    });
  });

  describe("processMobileTicketPresale", () => {
    it("issues ticket pass and attributes revenue to recorded scan", () => {
      recordQrScanEvent(wallScan);
      const ticket = processMobileTicketPresale(ticketOrder);

      assert.equal(ticket.ticketId, "tix_req_501");
      assert.equal(ticket.totalPaidUsd, 90.0);
      assert.equal(ticket.qrAttributed, true);
      assert.equal(ticket.attributedPlacement, "wall_plaque");
      assert.ok(ticket.confirmationCode.startsWith("TIX-ABST-"));
      assert.ok(ticket.accessPassUrl?.includes("code="));
      assert.ok(ticket.accessPassUrl?.startsWith("https://atelier.marisstella.dev/"));
    });

    it("handles ticket presale without scan attribution gracefully", () => {
      const directTicket: MobileTicketRequest = {
        ...ticketOrder,
        ticketId: "tix_direct_502",
        attributedScanId: undefined,
      };
      const ticket = processMobileTicketPresale(directTicket);

      assert.equal(ticket.qrAttributed, false);
      assert.equal(ticket.attributedPlacement, undefined);
    });
  });

  describe("summarizeExhibitionQrCampaign", () => {
    it("aggregates scans, ticket sales, attribution percentage, and top placement", () => {
      recordQrScanEvent(wallScan);
      recordQrScanEvent(catalogScan);
      processMobileTicketPresale(ticketOrder);

      const summary = summarizeExhibitionQrCampaign("abstract-perspectives-2026");

      assert.equal(summary.exhibitionSlug, "abstract-perspectives-2026");
      assert.equal(summary.totalScans, 2);
      assert.equal(summary.totalTicketsSold, 2);
      assert.equal(summary.qrAttributedTicketsCount, 2);
      assert.equal(summary.qrConversionRatePercent, 100.0);
      assert.equal(summary.totalAttributedRevenueUsd, 90.0);
      assert.equal(summary.topPerformingPlacement, "wall_plaque");
    });

    it("handles empty campaign gracefully", () => {
      const summary = summarizeExhibitionQrCampaign("empty-gallery-show");
      assert.equal(summary.totalScans, 0);
      assert.equal(summary.qrConversionRatePercent, 0);
    });
  });

  describe("GalleryQrAttributionStore", () => {
    it("generates valid Convex schema string", () => {
      const store = new GalleryQrAttributionStore();
      const schema = store.generateConvexSchema();

      assert.ok(schema.includes("export default defineSchema({"));
      assert.ok(schema.includes("gallery_qr_scans: defineTable({"));
      assert.ok(schema.includes("mobile_ticket_presales: defineTable({"));
    });
  });
});

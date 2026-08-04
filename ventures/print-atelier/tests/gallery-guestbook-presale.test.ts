import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  processGuestbookEntry,
  summarizeExhibitionGuestbook,
  generateConvexGuestbookPresaleSchema,
  getGuestbookConversion,
  clearGuestbookStoreForTesting,
  GuestbookEntry,
} from "../src/lib/gallery-guestbook-presale";

describe("gallery-guestbook-presale", () => {
  beforeEach(() => {
    clearGuestbookStoreForTesting();
  });

  const vipGuest: GuestbookEntry = {
    guestId: "guest_vip_001",
    guestName: "Lord Arthur Pendelton",
    email: "arthur@artcollectors.org",
    phoneNumber: "+15550192834",
    preferredMediums: ["cotton_rag", "baryta"],
    interestLevel: "serious_collector",
    optedInSms: true,
    exhibitionSlug: "monochrome-masters-2026",
    visitedAt: Date.now(),
  };

  const casualGuest: GuestbookEntry = {
    guestId: "guest_casual_002",
    guestName: "Alice Miller",
    email: "alice@example.com",
    preferredMediums: [],
    interestLevel: "casual_observer",
    optedInSms: false,
    exhibitionSlug: "monochrome-masters-2026",
    visitedAt: Date.now(),
  };

  describe("processGuestbookEntry", () => {
    it("assigns VIP early access cohort and generates SMS invite for serious collector with SMS opt-in", () => {
      const result = processGuestbookEntry(vipGuest);

      assert.equal(result.guestId, "guest_vip_001");
      assert.equal(result.assignedVipCohort, "vip_early_access");
      assert.equal(result.discountCode, "VIPGALLERY20");
      assert.ok(result.leadScore >= 75);
      assert.ok(result.generatedSmsInviteText?.includes("VIP presale pass is active"));
      assert.ok(result.generatedEmailSubject?.includes("Monochrome Masters 2026"));
    });

    it("assigns general presale cohort and skips SMS invite for casual guest without SMS opt-in", () => {
      const result = processGuestbookEntry(casualGuest);

      assert.equal(result.guestId, "guest_casual_002");
      assert.equal(result.assignedVipCohort, "general_presale");
      assert.equal(result.discountCode, "GALLERY10");
      assert.equal(result.generatedSmsInviteText, undefined);
      assert.ok(result.generatedEmailSubject?.includes("Monochrome Masters 2026"));
    });
  });

  describe("summarizeExhibitionGuestbook", () => {
    it("aggregates lead scores, SMS opt-in percentage, and cohort distributions", () => {
      const summary = summarizeExhibitionGuestbook([vipGuest, casualGuest]);

      assert.equal(summary.totalGuests, 2);
      assert.equal(summary.smsOptInCount, 1);
      assert.equal(summary.smsOptInPercent, 50.0);
      assert.equal(summary.vipCohortBreakdown.vip_early_access, 1);
      assert.equal(summary.vipCohortBreakdown.general_presale, 1);
      assert.equal(summary.exhibitionSlug, "monochrome-masters-2026");
    });

    it("handles empty guestbook list gracefully", () => {
      const summary = summarizeExhibitionGuestbook([]);
      assert.equal(summary.totalGuests, 0);
      assert.equal(summary.averageLeadScore, 0);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves guestbook conversion by guest ID", () => {
      processGuestbookEntry(vipGuest);
      const cached = getGuestbookConversion("guest_vip_001");

      assert.ok(cached);
      assert.equal(cached?.guestName, "Lord Arthur Pendelton");
    });

    it("generates valid Convex schema definition for gallery_guestbook_conversions", () => {
      const schema = generateConvexGuestbookPresaleSchema();
      assert.ok(schema.includes("export const gallery_guestbook_conversions = defineTable({"));
      assert.ok(schema.includes(".index(\"by_exhibition\", [\"exhibitionSlug\"])"));
    });
  });
});

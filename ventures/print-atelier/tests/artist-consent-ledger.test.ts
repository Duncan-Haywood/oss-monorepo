import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  createArtistConsentEvent,
  recordArtistConsentEvent,
  getArtistConsentLedger,
  clearArtistConsentLedger,
  summarizeArtistConsentLedger,
  evaluateLedgerListingConsentGate,
} from "../src/lib/artist-consent-ledger.ts";
import { CatalogArtwork } from "../src/lib/marketplace.ts";

beforeEach(() => {
  clearArtistConsentLedger();
});

const sampleArtwork: CatalogArtwork = {
  id: 101,
  slug: "sample-fine-art-print",
  title: "Sample Fine Art Print",
  artistName: "Elena Rostova",
  artistInitials: "ER",
  style: "Abstract",
  status: "Live",
  retailPrice: 95,
  fulfillmentCost: 22,
  imageClass: "bg-gradient-to-br from-purple-900 to-indigo-800",
  tags: ["Modernism", "Abstract"],
  hasSeoCopy: true,
  hasRoomMockups: true,
  hasApprovedProof: true,
  salesLast30Days: 4,
  projectedMonthlyArtistPayout: 120,
};

test("constructs and records artist consent events", () => {
  const event = createArtistConsentEvent({
    artistHandle: "@elena_art",
    artworkSlug: "sample-fine-art-print",
    rights: {
      podLicenseAccepted: true,
      paidAdRightsAccepted: true,
      aiRoomSceneAccepted: true,
      payoutAcknowledged: true,
      referralRightsAccepted: true,
    },
    termsVersion: "v1.2",
  });

  assert.ok(event.eventId.startsWith("consent_"));
  assert.equal(event.rights.referralRightsAccepted, true);

  recordArtistConsentEvent(event);

  const history = getArtistConsentLedger("sample-fine-art-print");
  assert.equal(history.length, 1);
  assert.equal(history[0].artistHandle, "@elena_art");
});

test("summarizes consent ledger metrics accurately", () => {
  recordArtistConsentEvent(
    createArtistConsentEvent({
      artistHandle: "@elena_art",
      artworkSlug: "artwork-1",
      rights: {
        podLicenseAccepted: true,
        paidAdRightsAccepted: true,
        aiRoomSceneAccepted: true,
        payoutAcknowledged: true,
        referralRightsAccepted: true,
      },
      termsVersion: "v1.2",
    }),
  );

  recordArtistConsentEvent(
    createArtistConsentEvent({
      artistHandle: "@marcus_art",
      artworkSlug: "artwork-2",
      rights: {
        podLicenseAccepted: true,
        paidAdRightsAccepted: false,
        aiRoomSceneAccepted: true,
        payoutAcknowledged: true,
        referralRightsAccepted: false,
      },
      termsVersion: "v1.2",
    }),
  );

  const summary = summarizeArtistConsentLedger();
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.fullyClearedCount, 1);
  assert.equal(summary.referralRightsCount, 1);
  assert.equal(summary.adRightsCount, 1);
});

test("evaluates listing consent gate from recorded consent events", () => {
  recordArtistConsentEvent(
    createArtistConsentEvent({
      artistHandle: "@elena_art",
      artworkSlug: "sample-fine-art-print",
      rights: {
        podLicenseAccepted: true,
        paidAdRightsAccepted: true,
        aiRoomSceneAccepted: true,
        payoutAcknowledged: true,
        referralRightsAccepted: true,
      },
      termsVersion: "v1.2",
    }),
  );

  const gate = evaluateLedgerListingConsentGate([sampleArtwork]);
  assert.equal(gate.clearedCount, 1);
  assert.equal(gate.items[0].consentStatus, "cleared");
});

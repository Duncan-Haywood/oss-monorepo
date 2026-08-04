import test from "node:test";
import assert from "node:assert";
import {
  generateConvexConsentLedgerSchema,
  persistConsentLedgerEvent,
  queryPersistedConsentLedgerEvents,
  syncConsentLedgerToPersistence,
  summarizePersistedConsentLedger,
  clearPersistedConsentLedgerForTest,
} from "../src/lib/consent-ledger-persistence.ts";
import {
  createArtistConsentEvent,
  recordArtistConsentEvent,
  clearArtistConsentLedger,
} from "../src/lib/artist-consent-ledger.ts";

test("generateConvexConsentLedgerSchema produces valid Convex schema", () => {
  const schema = generateConvexConsentLedgerSchema();
  assert.strictEqual(schema.tableName, "artist_consent_ledger");
  assert.ok(schema.indexes.some((i) => i.name === "by_artistHandle"));
});

test("persistConsentLedgerEvent stores and queries consent ledger events", () => {
  clearPersistedConsentLedgerForTest();

  const event = createArtistConsentEvent({
    artistHandle: "@elena_art",
    artworkSlug: "sunset-glow",
    rights: {
      podLicenseAccepted: true,
      paidAdRightsAccepted: true,
      aiRoomSceneAccepted: true,
      payoutAcknowledged: true,
      referralRightsAccepted: true,
    },
    termsVersion: "v1.2-2026",
  });

  const persisted = persistConsentLedgerEvent(event, { source: "web_onboarding" });
  assert.strictEqual(persisted.signerHandle, "@elena_art");
  assert.strictEqual(persisted.acceptedChannelRights.paidAds, true);

  const results = queryPersistedConsentLedgerEvents({ fullyClearedOnly: true });
  assert.strictEqual(results.length, 1);
});

test("syncConsentLedgerToPersistence syncs memory ledger to persistence", () => {
  clearArtistConsentLedger();
  clearPersistedConsentLedgerForTest();

  const event = createArtistConsentEvent({
    artistHandle: "@marcus_photos",
    artworkSlug: "foggy-pines",
    rights: {
      podLicenseAccepted: true,
      paidAdRightsAccepted: true,
      aiRoomSceneAccepted: true,
      payoutAcknowledged: true,
      referralRightsAccepted: false,
    },
    termsVersion: "v1.2-2026",
  });

  recordArtistConsentEvent(event);
  const synced = syncConsentLedgerToPersistence();
  assert.strictEqual(synced.length, 1);

  const summary = summarizePersistedConsentLedger();
  assert.strictEqual(summary.persistedCount, 1);
  assert.strictEqual(summary.adRightsCount, 1);
});

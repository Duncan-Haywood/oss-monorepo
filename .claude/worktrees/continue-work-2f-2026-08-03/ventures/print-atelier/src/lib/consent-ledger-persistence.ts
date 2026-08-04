import { ConvexSchemaDefinition } from "./order-persistence";
import { ArtistConsentEvent, ArtistConsentRights, summarizeArtistConsentLedger } from "./artist-consent-ledger";

export type PersistedConsentEventRecord = {
  dbId: string;
  eventId: string;
  artistHandle: string;
  signerHandle?: string;
  artworkSlug: string;
  rights: ArtistConsentRights;
  termsVersion: string;
  termsCopyVersion?: string;
  sourceChannel: string;
  source?: string;
  signerIpHash?: string;
  signedAt: string;
  acceptedChannelRights: {
    podLicense: boolean;
    paidAds: boolean;
    aiRoomScenes: boolean;
    payoutAcknowledgement: boolean;
    referrals: boolean;
  };
  convexSyncedAt: string;
  updatedAt: string;
};

export type PersistedConsentLedgerEvent = PersistedConsentEventRecord;

export type ConsentEventQueryFilter = {
  artistHandle?: string;
  artworkSlug?: string;
  termsVersion?: string;
  sourceChannel?: string;
  fullyClearedOnly?: boolean;
  limit?: number;
};

export type ConsentLedgerQueryFilter = ConsentEventQueryFilter;

const persistedConsentStore: PersistedConsentEventRecord[] = [];

export function generateConvexConsentLedgerSchema(): ConvexSchemaDefinition {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  consent_events: defineTable({
    eventId: v.string(),
    artistHandle: v.string(),
    artworkSlug: v.string(),
    rights: v.object({
      podLicenseAccepted: v.boolean(),
      paidAdRightsAccepted: v.boolean(),
      aiRoomSceneAccepted: v.boolean(),
      payoutAcknowledged: v.boolean(),
      referralRightsAccepted: v.boolean(),
    }),
    termsVersion: v.string(),
    sourceChannel: v.string(),
    signerIpHash: v.optional(v.string()),
    signedAt: v.string(),
    convexSyncedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_artistHandle", ["artistHandle"])
    .index("by_artworkSlug", ["artworkSlug"])
    .index("by_termsVersion", ["termsVersion"]),
});
  `.trim();

  return {
    tableName: "artist_consent_ledger",
    indexes: [
      { name: "by_eventId", fields: ["eventId"] },
      { name: "by_artistHandle", fields: ["artistHandle"] },
      { name: "by_artworkSlug", fields: ["artworkSlug"] },
      { name: "by_termsVersion", fields: ["termsVersion"] },
    ],
    schemaCode,
  };
}

export function persistConsentLedgerEvent(
  event: ArtistConsentEvent,
  extra?: {
    sourceChannel?: string;
    source?: string;
    convexSyncedAt?: string;
  },
): PersistedConsentEventRecord {
  const existingIndex = persistedConsentStore.findIndex((c) => c.eventId === event.eventId);
  const now = new Date().toISOString();
  const dbId =
    existingIndex >= 0
      ? persistedConsentStore[existingIndex].dbId
      : `doc_cns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const acceptedChannelRights = {
    podLicense: event.rights.podLicenseAccepted,
    paidAds: event.rights.paidAdRightsAccepted,
    aiRoomScenes: event.rights.aiRoomSceneAccepted,
    payoutAcknowledgement: event.rights.payoutAcknowledged,
    referrals: event.rights.referralRightsAccepted,
  };

  const persisted: PersistedConsentEventRecord = {
    dbId,
    eventId: event.eventId,
    artistHandle: event.artistHandle,
    signerHandle: event.artistHandle,
    artworkSlug: event.artworkSlug,
    rights: event.rights,
    termsVersion: event.termsVersion,
    termsCopyVersion: event.termsVersion,
    sourceChannel: extra?.sourceChannel ?? extra?.source ?? "artist_onboard_web",
    source: extra?.source ?? extra?.sourceChannel ?? "artist_onboard_web",
    signerIpHash: event.ipHash,
    signedAt: event.timestamp,
    acceptedChannelRights,
    convexSyncedAt: extra?.convexSyncedAt ?? now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    persistedConsentStore[existingIndex] = persisted;
  } else {
    persistedConsentStore.unshift(persisted);
  }

  if (persistedConsentStore.length > 500) {
    persistedConsentStore.length = 500;
  }

  return persisted;
}

export function queryPersistedConsentLedgerEvents(
  filter?: ConsentEventQueryFilter,
): PersistedConsentEventRecord[] {
  let results = [...persistedConsentStore];

  if (!filter) {
    return results;
  }

  if (filter.artistHandle) {
    results = results.filter((c) => c.artistHandle === filter.artistHandle);
  }

  if (filter.artworkSlug) {
    results = results.filter((c) => c.artworkSlug === filter.artworkSlug);
  }

  if (filter.termsVersion) {
    results = results.filter((c) => c.termsVersion === filter.termsVersion);
  }

  if (filter.sourceChannel) {
    results = results.filter((c) => c.sourceChannel === filter.sourceChannel);
  }

  if (filter.fullyClearedOnly) {
    results = results.filter(
      (c) =>
        c.rights.podLicenseAccepted &&
        c.rights.paidAdRightsAccepted &&
        c.rights.aiRoomSceneAccepted &&
        c.rights.payoutAcknowledged &&
        c.rights.referralRightsAccepted,
    );
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

export function summarizePersistedConsentLedgerEvents(filter?: ConsentEventQueryFilter) {
  const records = queryPersistedConsentLedgerEvents(filter);
  const fullyClearedCount = records.filter(
    (r) =>
      r.rights.podLicenseAccepted &&
      r.rights.paidAdRightsAccepted &&
      r.rights.aiRoomSceneAccepted &&
      r.rights.payoutAcknowledged &&
      r.rights.referralRightsAccepted,
  ).length;

  return {
    totalRecords: records.length,
    fullyClearedCount,
    adRightsCount: records.filter((r) => r.rights.paidAdRightsAccepted).length,
    aiRoomSceneCount: records.filter((r) => r.rights.aiRoomSceneAccepted).length,
    podLicenseCount: records.filter((r) => r.rights.podLicenseAccepted).length,
  };
}

export function summarizePersistedConsentLedger(filter?: ConsentEventQueryFilter) {
  const baseSummary = summarizePersistedConsentLedgerEvents(filter);
  return {
    ...baseSummary,
    persistedCount: baseSummary.totalRecords,
  };
}

export function syncConsentLedgerToPersistence() {
  const { getArtistConsentLedger } = require("./artist-consent-ledger");
  const events: ArtistConsentEvent[] = getArtistConsentLedger();
  return events.map((event) => persistConsentLedgerEvent(event));
}

export function clearPersistedConsentLedgerEventsForTest(): void {
  persistedConsentStore.length = 0;
}

export const clearPersistedConsentLedgerForTest = clearPersistedConsentLedgerEventsForTest;

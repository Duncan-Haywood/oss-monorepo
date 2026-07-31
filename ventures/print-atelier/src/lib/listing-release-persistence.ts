import { ConvexSchemaDefinition } from "./order-persistence";
import { ListingReleaseStatus } from "./marketplace";

export type PersistedListingReleaseRecord = {
  dbId: string;
  decisionId?: string;
  artworkId: string;
  artworkSlug?: string;
  artworkTitle: string;
  artistHandle: string;
  artistName?: string;
  title?: string;
  releaseStatus: ListingReleaseStatus;
  owner: string;
  canUsePayoutPromise?: boolean;
  currentArtistPayoutPerOrder?: number;
  bestPodAlternativeLabel?: string;
  podAdvantagePerOrder?: number;
  operatorAction: string;
  action?: string;
  trustCopySnapshot: string;
  artistFacingCopySnapshot?: string;
  blockerChips: string[];
  suggestedRetailPrice: number;
  overrideReason?: string;
  overrideApprovedBy?: string;
  slaStatus?: "on-track" | "warning" | "breached";
  agingDays?: number;
  convexSyncedAt: string;
  recordedAt: string;
  updatedAt: string;
};

export type PersistedListingReleaseDecision = PersistedListingReleaseRecord;

export type ListingReleaseQueryFilter = {
  releaseStatus?: ListingReleaseStatus;
  artistHandle?: string;
  artworkId?: string;
  artworkSlug?: string;
  owner?: string;
  slaStatus?: "on-track" | "warning" | "breached";
  limit?: number;
};

const persistedReleaseStore: PersistedListingReleaseRecord[] = [];

export function generateConvexListingReleaseSchema(): ConvexSchemaDefinition {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  listing_releases: defineTable({
    artworkId: v.string(),
    artworkTitle: v.string(),
    artistHandle: v.string(),
    releaseStatus: v.union(
      v.literal("release-ready"),
      v.literal("override-review"),
      v.literal("hold")
    ),
    owner: v.string(),
    operatorAction: v.string(),
    trustCopySnapshot: v.string(),
    blockerChips: v.array(v.string()),
    suggestedRetailPrice: v.number(),
    overrideReason: v.optional(v.string()),
    overrideApprovedBy: v.optional(v.string()),
    convexSyncedAt: v.string(),
    recordedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_artworkId", ["artworkId"])
    .index("by_artistHandle", ["artistHandle"])
    .index("by_releaseStatus", ["releaseStatus"])
    .index("by_owner", ["owner"]),
});
  `.trim();

  return {
    tableName: "listing_releases",
    indexes: [
      { name: "by_artworkId", fields: ["artworkId"] },
      { name: "by_artistHandle", fields: ["artistHandle"] },
      { name: "by_releaseStatus", fields: ["releaseStatus"] },
      { name: "by_owner", fields: ["owner"] },
    ],
    schemaCode,
  };
}

export function generateListingReleaseDecisionId(): string {
  return `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function persistListingReleaseDecision(input: {
  artworkId?: string;
  artworkSlug?: string;
  artworkTitle?: string;
  title?: string;
  artistHandle?: string;
  artistName?: string;
  releaseStatus: ListingReleaseStatus;
  owner: string;
  canUsePayoutPromise?: boolean;
  currentArtistPayoutPerOrder?: number;
  bestPodAlternativeLabel?: string;
  podAdvantagePerOrder?: number;
  operatorAction?: string;
  action?: string;
  trustCopySnapshot?: string;
  artistFacingCopySnapshot?: string;
  blockerChips?: string[];
  suggestedRetailPrice: number;
  overrideReason?: string;
  slaStatus?: "on-track" | "warning" | "breached";
  agingDays?: number;
}): PersistedListingReleaseRecord {
  const artworkSlug = input.artworkSlug ?? input.artworkId ?? "unknown-artwork";
  const artworkId = input.artworkId ?? artworkSlug;
  const artworkTitle = input.artworkTitle ?? input.title ?? "Untitled Artwork";
  const artistHandle = input.artistHandle ?? input.artistName ?? "@artist";
  const operatorAction = input.operatorAction ?? input.action ?? "Review release decision";
  const trustCopySnapshot = input.trustCopySnapshot ?? input.artistFacingCopySnapshot ?? "";
  const blockerChips = input.blockerChips ?? [];

  const existingIndex = persistedReleaseStore.findIndex(
    (r) => r.artworkId === artworkId || r.artworkSlug === artworkSlug,
  );
  const now = new Date().toISOString();
  const dbId =
    existingIndex >= 0
      ? persistedReleaseStore[existingIndex].dbId
      : `doc_rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const decisionId =
    existingIndex >= 0 && persistedReleaseStore[existingIndex].decisionId
      ? persistedReleaseStore[existingIndex].decisionId
      : generateListingReleaseDecisionId();

  const existing = existingIndex >= 0 ? persistedReleaseStore[existingIndex] : null;

  const persisted: PersistedListingReleaseRecord = {
    dbId,
    decisionId,
    artworkId,
    artworkSlug,
    artworkTitle,
    title: artworkTitle,
    artistHandle,
    artistName: artistHandle,
    releaseStatus: input.releaseStatus,
    owner: input.owner,
    canUsePayoutPromise: input.canUsePayoutPromise ?? true,
    currentArtistPayoutPerOrder: input.currentArtistPayoutPerOrder ?? 0,
    bestPodAlternativeLabel: input.bestPodAlternativeLabel ?? "Society6 wall art",
    podAdvantagePerOrder: input.podAdvantagePerOrder ?? 0,
    operatorAction,
    action: operatorAction,
    trustCopySnapshot,
    artistFacingCopySnapshot: trustCopySnapshot,
    blockerChips,
    suggestedRetailPrice: input.suggestedRetailPrice,
    overrideReason: input.overrideReason ?? existing?.overrideReason,
    overrideApprovedBy: existing?.overrideApprovedBy,
    slaStatus: input.slaStatus ?? "on-track",
    agingDays: input.agingDays ?? 0,
    convexSyncedAt: now,
    recordedAt: existing?.recordedAt ?? now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    persistedReleaseStore[existingIndex] = persisted;
  } else {
    persistedReleaseStore.unshift(persisted);
  }

  if (persistedReleaseStore.length > 500) {
    persistedReleaseStore.length = 500;
  }

  return persisted;
}

export function recordReleaseOverrideApproval(
  artworkId: string,
  approvedBy: string,
  overrideReason: string,
): PersistedListingReleaseRecord | null {
  const target = persistedReleaseStore.find(
    (r) => r.artworkId === artworkId || r.artworkSlug === artworkId,
  );
  if (!target) {
    return null;
  }

  const now = new Date().toISOString();
  target.releaseStatus = "release-ready";
  target.overrideApprovedBy = approvedBy;
  target.overrideReason = overrideReason;
  target.updatedAt = now;

  return target;
}

export function queryPersistedListingReleases(
  filter?: ListingReleaseQueryFilter,
): PersistedListingReleaseRecord[] {
  let results = [...persistedReleaseStore];

  if (!filter) {
    return results;
  }

  if (filter.releaseStatus) {
    results = results.filter((r) => r.releaseStatus === filter.releaseStatus);
  }

  if (filter.artistHandle) {
    results = results.filter((r) => r.artistHandle === filter.artistHandle);
  }

  if (filter.artworkId) {
    results = results.filter((r) => r.artworkId === filter.artworkId);
  }

  if (filter.artworkSlug) {
    results = results.filter((r) => r.artworkSlug === filter.artworkSlug);
  }

  if (filter.owner) {
    results = results.filter((r) => r.owner === filter.owner);
  }

  if (filter.slaStatus) {
    results = results.filter((r) => r.slaStatus === filter.slaStatus);
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

export const queryPersistedListingReleaseDecisions = queryPersistedListingReleases;

export function summarizePersistedListingReleases(filter?: ListingReleaseQueryFilter) {
  const records = queryPersistedListingReleases(filter);
  return {
    totalRecords: records.length,
    totalCount: records.length,
    releaseReadyCount: records.filter((r) => r.releaseStatus === "release-ready").length,
    overrideReviewCount: records.filter((r) => r.releaseStatus === "override-review").length,
    holdCount: records.filter((r) => r.releaseStatus === "hold").length,
    slaBreachedCount: records.filter((r) => r.slaStatus === "breached").length,
  };
}

export const summarizePersistedListingReleaseDecisions = summarizePersistedListingReleases;

export function clearPersistedListingReleasesForTest(): void {
  persistedReleaseStore.length = 0;
}

export const clearPersistedListingReleaseDecisionsForTest = clearPersistedListingReleasesForTest;

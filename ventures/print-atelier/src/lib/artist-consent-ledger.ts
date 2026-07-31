import {
  ListingConsentRecord,
  CatalogArtwork,
  buildListingConsentGate,
  ListingConsentGateQueue,
} from "./marketplace";

export type ArtistConsentRights = {
  podLicenseAccepted: boolean;
  paidAdRightsAccepted: boolean;
  aiRoomSceneAccepted: boolean;
  payoutAcknowledged: boolean;
  referralRightsAccepted: boolean;
};

export type ArtistConsentEvent = {
  eventId: string;
  artistHandle: string;
  artworkSlug: string;
  rights: ArtistConsentRights;
  termsVersion: string;
  timestamp: string;
  ipHash?: string;
};

export type ArtistConsentSummary = {
  totalRecords: number;
  fullyClearedCount: number;
  referralRightsCount: number;
  adRightsCount: number;
  aiRoomSceneCount: number;
};

const STORAGE_KEY = "print-atelier-artist-consent-ledger";

// In-memory fallback ledger for node/test environment
let inMemoryConsentLedger: ArtistConsentEvent[] = [];

export function generateArtistConsentEventId(): string {
  return `consent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createArtistConsentEvent(
  params: Omit<ArtistConsentEvent, "eventId" | "timestamp"> & {
    eventId?: string;
    timestamp?: string;
  },
): ArtistConsentEvent {
  const now = new Date().toISOString();
  return {
    eventId: params.eventId ?? generateArtistConsentEventId(),
    artistHandle: params.artistHandle,
    artworkSlug: params.artworkSlug,
    rights: params.rights,
    termsVersion: params.termsVersion,
    timestamp: params.timestamp ?? now,
    ipHash: params.ipHash,
  };
}

export function parseArtistConsentLedger(raw: string | null): ArtistConsentEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === "object" && item !== null && typeof item.eventId === "string",
    );
  } catch {
    return [];
  }
}

export function serializeArtistConsentLedger(events: ArtistConsentEvent[]): string {
  return JSON.stringify(events);
}

export function getArtistConsentLedger(artworkSlug?: string): ArtistConsentEvent[] {
  let events = inMemoryConsentLedger;
  if (typeof window !== "undefined") {
    events = parseArtistConsentLedger(window.localStorage.getItem(STORAGE_KEY));
  }
  if (artworkSlug) {
    return events.filter((e) => e.artworkSlug === artworkSlug);
  }
  return events;
}

export function recordArtistConsentEvent(
  event: ArtistConsentEvent,
): ArtistConsentEvent[] {
  let events = getArtistConsentLedger();
  events = [event, ...events.filter((e) => e.eventId !== event.eventId)].slice(0, 500);

  inMemoryConsentLedger = events;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeArtistConsentLedger(events));
  }
  return events;
}

export function clearArtistConsentLedger(): void {
  inMemoryConsentLedger = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function convertEventsToListingConsentRecords(
  events: ArtistConsentEvent[] = getArtistConsentLedger(),
): ListingConsentRecord[] {
  const map = new Map<string, ListingConsentRecord>();

  for (const event of events) {
    const existing = map.get(event.artworkSlug);
    if (!existing) {
      map.set(event.artworkSlug, {
        artworkSlug: event.artworkSlug,
        podLicenseAccepted: event.rights.podLicenseAccepted,
        paidAdRightsAccepted: event.rights.paidAdRightsAccepted,
        aiRoomSceneAccepted: event.rights.aiRoomSceneAccepted,
        payoutAcknowledged: event.rights.payoutAcknowledged,
        signerHandle: event.artistHandle,
        signedAt: event.timestamp,
      });
    }
  }

  return Array.from(map.values());
}

export function evaluateLedgerListingConsentGate(
  artworks: CatalogArtwork[],
  events: ArtistConsentEvent[] = getArtistConsentLedger(),
): ListingConsentGateQueue {
  const consentRecords = convertEventsToListingConsentRecords(events);
  return buildListingConsentGate(artworks, consentRecords);
}

export function summarizeArtistConsentLedger(
  events: ArtistConsentEvent[] = getArtistConsentLedger(),
): ArtistConsentSummary {
  const totalRecords = events.length;
  let fullyClearedCount = 0;
  let referralRightsCount = 0;
  let adRightsCount = 0;
  let aiRoomSceneCount = 0;

  for (const ev of events) {
    if (
      ev.rights.podLicenseAccepted &&
      ev.rights.paidAdRightsAccepted &&
      ev.rights.aiRoomSceneAccepted &&
      ev.rights.payoutAcknowledged &&
      ev.rights.referralRightsAccepted
    ) {
      fullyClearedCount++;
    }
    if (ev.rights.referralRightsAccepted) referralRightsCount++;
    if (ev.rights.paidAdRightsAccepted) adRightsCount++;
    if (ev.rights.aiRoomSceneAccepted) aiRoomSceneCount++;
  }

  return {
    totalRecords,
    fullyClearedCount,
    referralRightsCount,
    adRightsCount,
    aiRoomSceneCount,
  };
}

export type ConsentSLAStatus = "ON_TRACK" | "WARNING" | "CRITICAL";

export type ConsentSlaAgingItem = {
  artworkSlug: string;
  artworkTitle: string;
  artistHandle: string;
  pendingDays: number;
  slaStatus: ConsentSLAStatus;
  missingConsents: string[];
  operatorAction: string;
};

export type ConsentSlaAgingSummary = {
  totalPendingCount: number;
  onTrackCount: number;
  warningCount: number;
  criticalCount: number;
  items: ConsentSlaAgingItem[];
};

export function calculateConsentSlaAging(
  artworks: CatalogArtwork[],
  events: ArtistConsentEvent[] = getArtistConsentLedger(),
  options: { nowTimestamp?: string; overridePendingDaysBySlug?: Record<string, number> } = {},
): ConsentSlaAgingSummary {
  const gateQueue = evaluateLedgerListingConsentGate(artworks, events);
  const now = options.nowTimestamp ? new Date(options.nowTimestamp).getTime() : Date.now();
  const consentBySlug = new Map(events.map((e) => [e.artworkSlug, e]));

  const pendingItems: ConsentSlaAgingItem[] = [];

  for (const gateItem of gateQueue.items) {
    if (gateItem.consentStatus === "missing-consent") {
      const slug = gateItem.artwork.slug;
      let pendingDays = options.overridePendingDaysBySlug?.[slug] ?? 0;

      if (!options.overridePendingDaysBySlug?.[slug]) {
        const event = consentBySlug.get(slug);
        const refTime = event ? new Date(event.timestamp).getTime() : now - 4 * 86400 * 1000;
        pendingDays = Math.max(0, Math.floor((now - refTime) / (86400 * 1000)));
      }

      let slaStatus: ConsentSLAStatus = "ON_TRACK";
      if (pendingDays > 7) {
        slaStatus = "CRITICAL";
      } else if (pendingDays > 3) {
        slaStatus = "WARNING";
      }

      const missingText = gateItem.missingConsents.join(", ");
      const operatorAction =
        slaStatus === "CRITICAL"
          ? `CRITICAL SLA (${pendingDays}d pending): Contact artist directly to finalize ${missingText}`
          : slaStatus === "WARNING"
            ? `WARNING SLA (${pendingDays}d pending): Send reminder for missing ${missingText}`
            : `ON TRACK (${pendingDays}d pending): Awaiting artist consent for ${missingText}`;

      pendingItems.push({
        artworkSlug: slug,
        artworkTitle: gateItem.artwork.title,
        artistHandle: gateItem.artwork.artistHandle,
        pendingDays,
        slaStatus,
        missingConsents: gateItem.missingConsents,
        operatorAction,
      });
    }
  }

  return {
    totalPendingCount: pendingItems.length,
    onTrackCount: pendingItems.filter((i) => i.slaStatus === "ON_TRACK").length,
    warningCount: pendingItems.filter((i) => i.slaStatus === "WARNING").length,
    criticalCount: pendingItems.filter((i) => i.slaStatus === "CRITICAL").length,
    items: pendingItems,
  };
}


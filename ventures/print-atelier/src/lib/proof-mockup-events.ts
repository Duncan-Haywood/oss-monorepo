export type ProofMockupSendChannel =
  | "dm"
  | "email"
  | "instagram"
  | "pinterest"
  | "email_direct";

export type ProofMockupSendStatus = "sent" | "delivered" | "failed" | "queued";

export type ProofMockupSendEvent = {
  eventId: string;
  sentAt: string;
  prospectHandle: string;
  artistName: string;
  artworkSlug: string | null;
  channel: ProofMockupSendChannel;
  copyVersion: string;
  sceneCount: number;
  payoutLine: string | null;
  status: ProofMockupSendStatus;
};

export type ProofMockupSendSummary = {
  totalSent: number;
  deliveredCount: number;
  channelBreakdown: Record<ProofMockupSendChannel, number>;
  artworkSlugBreakdown: Record<string, number>;
  deliveryRate: number;
};

const STORAGE_KEY = "print-atelier-proof-mockup-send-events";

// In-memory fallback ledger for node/test environment
let inMemoryEventsLedger: ProofMockupSendEvent[] = [];

export function generateProofMockupSendEventId(): string {
  return `pm_send_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createProofMockupSendEvent(
  params: Omit<ProofMockupSendEvent, "eventId" | "sentAt" | "status"> & {
    eventId?: string;
    sentAt?: string;
    status?: ProofMockupSendStatus;
  },
): ProofMockupSendEvent {
  const now = new Date().toISOString();
  return {
    eventId: params.eventId ?? generateProofMockupSendEventId(),
    sentAt: params.sentAt ?? now,
    prospectHandle: params.prospectHandle,
    artistName: params.artistName,
    artworkSlug: params.artworkSlug ?? null,
    channel: params.channel,
    copyVersion: params.copyVersion,
    sceneCount: params.sceneCount,
    payoutLine: params.payoutLine ?? null,
    status: params.status ?? "sent",
  };
}

export function serializeProofMockupSendEvents(events: ProofMockupSendEvent[]): string {
  return JSON.stringify(events);
}

export function parseProofMockupSendEvents(raw: string | null): ProofMockupSendEvent[] {
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

export function getProofMockupSendEventsHistory(prospectHandle?: string): ProofMockupSendEvent[] {
  let events = inMemoryEventsLedger;
  if (typeof window !== "undefined") {
    events = parseProofMockupSendEvents(window.localStorage.getItem(STORAGE_KEY));
  }
  if (prospectHandle) {
    return events.filter((e) => e.prospectHandle === prospectHandle);
  }
  return events;
}

export function recordProofMockupSendEvent(
  event: ProofMockupSendEvent,
): ProofMockupSendEvent[] {
  let events = getProofMockupSendEventsHistory();
  events = [event, ...events.filter((e) => e.eventId !== event.eventId)].slice(0, 100);
  
  inMemoryEventsLedger = events;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeProofMockupSendEvents(events));
  }
  return events;
}

export function clearProofMockupSendEventsLedger(): void {
  inMemoryEventsLedger = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function summarizeProofMockupSendEvents(
  events: ProofMockupSendEvent[] = getProofMockupSendEventsHistory(),
): ProofMockupSendSummary {
  const totalSent = events.length;
  const deliveredCount = events.filter((e) => e.status === "delivered" || e.status === "sent").length;
  const deliveryRate = totalSent > 0 ? Math.round((deliveredCount / totalSent) * 100) : 100;

  const channelBreakdown: Record<ProofMockupSendChannel, number> = {
    dm: 0,
    email: 0,
    instagram: 0,
    pinterest: 0,
    email_direct: 0,
  };

  const artworkSlugBreakdown: Record<string, number> = {};

  for (const ev of events) {
    if (ev.channel in channelBreakdown) {
      channelBreakdown[ev.channel]++;
    }
    const slug = ev.artworkSlug ?? "unassigned";
    artworkSlugBreakdown[slug] = (artworkSlugBreakdown[slug] ?? 0) + 1;
  }

  return {
    totalSent,
    deliveredCount,
    channelBreakdown,
    artworkSlugBreakdown,
    deliveryRate,
  };
}

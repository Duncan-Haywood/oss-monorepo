export type RoomPreviewEventType =
  | "preview_opened"
  | "room_style_switched"
  | "add_to_cart_from_preview"
  | "order_completed_from_preview";

export type RoomStyleTag =
  | "living_room"
  | "gallery_wall"
  | "minimalist_bedroom"
  | "studio_workspace";

export type RoomPreviewEvent = {
  eventId: string;
  artworkSlug: string;
  artworkTitle: string;
  eventType: RoomPreviewEventType;
  roomStyle: RoomStyleTag | null;
  sourceChannel: string;
  sessionDurationSeconds: number;
  timestamp: string;
};

export type RoomPreviewAnalyticsSummary = {
  totalEvents: number;
  totalOpens: number;
  totalStyleSwitches: number;
  totalAddToCart: number;
  totalOrdersCompleted: number;
  previewConversionRatePercent: number; // (orders / opens) * 100
  addToCartRatePercent: number; // (addToCart / opens) * 100
  topRoomStyle: RoomStyleTag | null;
  channelBreakdown: Record<
    string,
    { opens: number; addToCart: number; orders: number; conversionRatePercent: number }
  >;
  estimatedCacReductionPercent: number;
};

const STORAGE_KEY = "print-atelier-room-preview-events";

let inMemoryRoomPreviewEvents: RoomPreviewEvent[] = [];

export function generateRoomPreviewEventId(): string {
  return `rpe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseRoomPreviewEvents(raw: string | null): RoomPreviewEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.eventId === "string" &&
        typeof item.artworkSlug === "string",
    );
  } catch {
    return [];
  }
}

export function serializeRoomPreviewEvents(events: RoomPreviewEvent[]): string {
  return JSON.stringify(events);
}

export function getRoomPreviewEvents(artworkSlug?: string): RoomPreviewEvent[] {
  let events = inMemoryRoomPreviewEvents;
  if (typeof window !== "undefined") {
    events = parseRoomPreviewEvents(window.localStorage.getItem(STORAGE_KEY));
  }
  if (artworkSlug) {
    return events.filter((e) => e.artworkSlug === artworkSlug);
  }
  return events;
}

export function recordRoomPreviewEvent(
  params: Omit<RoomPreviewEvent, "eventId" | "timestamp"> & {
    eventId?: string;
    timestamp?: string;
  },
): RoomPreviewEvent {
  const event: RoomPreviewEvent = {
    eventId: params.eventId ?? generateRoomPreviewEventId(),
    artworkSlug: params.artworkSlug,
    artworkTitle: params.artworkTitle,
    eventType: params.eventType,
    roomStyle: params.roomStyle ?? null,
    sourceChannel: params.sourceChannel || "direct",
    sessionDurationSeconds: Math.max(0, params.sessionDurationSeconds || 0),
    timestamp: params.timestamp ?? new Date().toISOString(),
  };

  let events = getRoomPreviewEvents();
  events = [event, ...events.filter((e) => e.eventId !== event.eventId)].slice(0, 1000);

  inMemoryRoomPreviewEvents = events;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeRoomPreviewEvents(events));
  }

  return event;
}

export function clearRoomPreviewEvents(): void {
  inMemoryRoomPreviewEvents = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function summarizeRoomPreviewAnalytics(
  events: RoomPreviewEvent[] = getRoomPreviewEvents(),
): RoomPreviewAnalyticsSummary {
  const totalEvents = events.length;
  const opens = events.filter((e) => e.eventType === "preview_opened");
  const styleSwitches = events.filter((e) => e.eventType === "room_style_switched");
  const addToCart = events.filter((e) => e.eventType === "add_to_cart_from_preview");
  const orders = events.filter((e) => e.eventType === "order_completed_from_preview");

  const totalOpens = opens.length;
  const totalStyleSwitches = styleSwitches.length;
  const totalAddToCart = addToCart.length;
  const totalOrdersCompleted = orders.length;

  const previewConversionRatePercent =
    totalOpens > 0 ? Number(((totalOrdersCompleted / totalOpens) * 100).toFixed(2)) : 0;
  const addToCartRatePercent =
    totalOpens > 0 ? Number(((totalAddToCart / totalOpens) * 100).toFixed(2)) : 0;

  // Calculate style frequency
  const styleCounts: Record<RoomStyleTag, number> = {
    living_room: 0,
    gallery_wall: 0,
    minimalist_bedroom: 0,
    studio_workspace: 0,
  };

  for (const e of events) {
    if (e.roomStyle && e.roomStyle in styleCounts) {
      styleCounts[e.roomStyle]++;
    }
  }

  let topRoomStyle: RoomStyleTag | null = null;
  let maxCount = 0;
  for (const [style, count] of Object.entries(styleCounts) as [RoomStyleTag, number][]) {
    if (count > maxCount) {
      maxCount = count;
      topRoomStyle = style;
    }
  }

  // Channel breakdown
  const channelMap: Record<
    string,
    { opens: number; addToCart: number; orders: number }
  > = {};

  for (const e of events) {
    const ch = e.sourceChannel || "direct";
    if (!channelMap[ch]) {
      channelMap[ch] = { opens: 0, addToCart: 0, orders: 0 };
    }
    if (e.eventType === "preview_opened") channelMap[ch].opens++;
    if (e.eventType === "add_to_cart_from_preview") channelMap[ch].addToCart++;
    if (e.eventType === "order_completed_from_preview") channelMap[ch].orders++;
  }

  const channelBreakdown: Record<
    string,
    { opens: number; addToCart: number; orders: number; conversionRatePercent: number }
  > = {};

  for (const [ch, data] of Object.entries(channelMap)) {
    const convRate =
      data.opens > 0 ? Number(((data.orders / data.opens) * 100).toFixed(2)) : 0;
    channelBreakdown[ch] = {
      ...data,
      conversionRatePercent: convRate,
    };
  }

  // Estimated CAC reduction from preview engagement (up to 25% reduction based on conversion lift)
  const estimatedCacReductionPercent = Math.min(
    25,
    Number((previewConversionRatePercent * 2.5).toFixed(1)),
  );

  return {
    totalEvents,
    totalOpens,
    totalStyleSwitches,
    totalAddToCart,
    totalOrdersCompleted,
    previewConversionRatePercent,
    addToCartRatePercent,
    topRoomStyle,
    channelBreakdown,
    estimatedCacReductionPercent,
  };
}

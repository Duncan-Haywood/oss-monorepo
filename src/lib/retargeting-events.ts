import type { CheckoutLineItem } from "./checkout";

export type RetargetingPlatform = "meta" | "google" | "pinterest";

export type CheckoutAbandonEvent = {
  eventId: string;
  sessionId: string;
  platform: RetargetingPlatform;
  eventName: string;
  cartValueCents: number;
  currency: string;
  lineItemSlugs: string[];
  shippingRegion: string;
  createdAt: string;
  pixelReady: boolean;
  blockers: string[];
  payloadPreview: Record<string, string | number | string[]>;
};

export type RetargetingEnvStatus = {
  metaReady: boolean;
  googleReady: boolean;
  pinterestReady: boolean;
  platformsReady: number;
  blockers: string[];
};

const PLATFORM_EVENT_NAMES: Record<RetargetingPlatform, string> = {
  meta: "InitiateCheckout",
  google: "begin_checkout",
  pinterest: "checkout",
};

function generateEventId(): string {
  return `rt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getRetargetingEnvStatus(
  env: Record<string, string | undefined> = {},
): RetargetingEnvStatus {
  const blockers: string[] = [];
  const metaReady = Boolean(env.META_PIXEL_ID?.trim() && env.META_ACCESS_TOKEN?.trim());
  const googleReady = Boolean(env.GOOGLE_ADS_CUSTOMER_ID?.trim());
  const pinterestReady = Boolean(
    env.PINTEREST_AD_ACCOUNT_ID?.trim() && env.PINTEREST_ACCESS_TOKEN?.trim(),
  );

  if (!metaReady) blockers.push("Meta pixel + access token");
  if (!googleReady) blockers.push("Google Ads customer ID");
  if (!pinterestReady) blockers.push("Pinterest ad account + token");

  const platformsReady = [metaReady, googleReady, pinterestReady].filter(Boolean).length;

  return { metaReady, googleReady, pinterestReady, platformsReady, blockers };
}

export function buildCheckoutAbandonPixelPayload(
  platform: RetargetingPlatform,
  sessionId: string,
  lineItems: CheckoutLineItem[],
  cartValueCents: number,
  shippingRegion: string,
): Record<string, string | number | string[]> {
  const slugs = lineItems.map((item) => item.artworkSlug);
  const contentIds = slugs.map((slug) => `print:${slug}`);

  if (platform === "meta") {
    return {
      event_name: PLATFORM_EVENT_NAMES.meta,
      event_id: sessionId,
      content_ids: contentIds,
      content_type: "product",
      value: cartValueCents / 100,
      currency: "USD",
      num_items: lineItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  if (platform === "google") {
    return {
      event: PLATFORM_EVENT_NAMES.google,
      transaction_id: sessionId,
      value: cartValueCents / 100,
      currency: "USD",
      items: slugs,
      shipping_region: shippingRegion,
    };
  }

  return {
    event_name: PLATFORM_EVENT_NAMES.pinterest,
    event_id: sessionId,
    value: cartValueCents / 100,
    currency: "USD",
    line_items: slugs,
    shipping_region: shippingRegion,
  };
}

export function buildCheckoutSessionRetargetingEvents(
  sessionId: string,
  lineItems: CheckoutLineItem[],
  cartValueCents: number,
  shippingRegion: string,
  env: Record<string, string | undefined> = {},
  createdAt = new Date().toISOString(),
): CheckoutAbandonEvent[] {
  const envStatus = getRetargetingEnvStatus(env);
  const platforms: RetargetingPlatform[] = ["meta", "google", "pinterest"];

  return platforms.map((platform) => {
    const pixelReady =
      platform === "meta"
        ? envStatus.metaReady
        : platform === "google"
          ? envStatus.googleReady
          : envStatus.pinterestReady;

    const blockers = pixelReady
      ? []
      : [
          platform === "meta"
            ? "Configure META_PIXEL_ID and META_ACCESS_TOKEN"
            : platform === "google"
              ? "Configure GOOGLE_ADS_CUSTOMER_ID"
              : "Configure PINTEREST_AD_ACCOUNT_ID and PINTEREST_ACCESS_TOKEN",
        ];

    return {
      eventId: generateEventId(),
      sessionId,
      platform,
      eventName: PLATFORM_EVENT_NAMES[platform],
      cartValueCents,
      currency: "usd",
      lineItemSlugs: lineItems.map((item) => item.artworkSlug),
      shippingRegion,
      createdAt,
      pixelReady,
      blockers,
      payloadPreview: buildCheckoutAbandonPixelPayload(
        platform,
        sessionId,
        lineItems,
        cartValueCents,
        shippingRegion,
      ),
    };
  });
}

export type RetargetingEventSummary = {
  totalEvents: number;
  pixelReadyEvents: number;
  uniqueSessions: number;
  platformsReady: number;
  recentEvents: CheckoutAbandonEvent[];
  envStatus: RetargetingEnvStatus;
};

const eventStore: CheckoutAbandonEvent[] = [];

export function recordCheckoutSessionRetargetingEvents(
  events: CheckoutAbandonEvent[],
): CheckoutAbandonEvent[] {
  eventStore.unshift(...events);
  if (eventStore.length > 100) {
    eventStore.length = 100;
  }
  return events;
}

export function getCheckoutAbandonEvents(): CheckoutAbandonEvent[] {
  return [...eventStore];
}

export function buildRetargetingEventSummary(
  env: Record<string, string | undefined> = {},
): RetargetingEventSummary {
  const envStatus = getRetargetingEnvStatus(env);
  const uniqueSessions = new Set(eventStore.map((event) => event.sessionId)).size;

  return {
    totalEvents: eventStore.length,
    pixelReadyEvents: eventStore.filter((event) => event.pixelReady).length,
    uniqueSessions,
    platformsReady: envStatus.platformsReady,
    recentEvents: eventStore.slice(0, 12),
    envStatus,
  };
}

export function clearRetargetingEventsForTests(): void {
  eventStore.length = 0;
}

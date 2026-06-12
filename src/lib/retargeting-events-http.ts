import type { CheckoutAbandonEvent } from "./retargeting-events";
import { getRetargetingEnvStatus } from "./retargeting-events";

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type RetargetingPlatformHttp = "meta" | "google" | "pinterest";

export type RetargetingHttpResult = {
  platform: RetargetingPlatformHttp;
  ok: boolean;
  statusCode: number;
  responseSnippet: string;
  bytesSent: number;
  endpoint: string;
};

export type CheckoutRetargetingLiveResult = {
  events: CheckoutAbandonEvent[];
  liveFired: number;
  httpResults: RetargetingHttpResult[];
  simulated: boolean;
};

function buildMetaCapiEndpoint(pixelId: string, accessToken: string): string {
  return `https://graph.facebook.com/v19.0/${pixelId.trim()}/events?access_token=${encodeURIComponent(accessToken.trim())}`;
}

function buildGoogleConversionEndpoint(customerId: string): string {
  const normalized = customerId.replace(/[^0-9]/g, "");
  return `https://googleads.googleapis.com/v16/customers/${normalized}:uploadClickConversions`;
}

function buildPinterestEventsEndpoint(adAccountId: string): string {
  return `https://api.pinterest.com/v5/ad_accounts/${adAccountId.trim()}/events`;
}

export function buildMetaCapiPayload(event: CheckoutAbandonEvent): string {
  const preview = event.payloadPreview;
  const contentIds = Array.isArray(preview.content_ids)
    ? preview.content_ids
    : event.lineItemSlugs.map((slug) => `print:${slug}`);

  const eventTime = Math.floor(new Date(event.createdAt).getTime() / 1000);

  return JSON.stringify({
    data: [
      {
        event_name: event.eventName,
        event_time: eventTime,
        event_id: event.sessionId,
        action_source: "website",
        custom_data: {
          currency: event.currency.toUpperCase(),
          value:
            typeof preview.value === "number"
              ? preview.value
              : event.cartValueCents / 100,
          content_ids: contentIds,
          content_type: "product",
          num_items:
            typeof preview.num_items === "number"
              ? preview.num_items
              : event.lineItemSlugs.length,
        },
      },
    ],
  });
}

export function buildGoogleConversionPayload(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
): string {
  const conversionActionId = env.GOOGLE_ADS_CONVERSION_ACTION_ID?.trim() ?? "begin_checkout";
  const customerId = env.GOOGLE_ADS_CUSTOMER_ID?.trim() ?? "";
  const value = event.cartValueCents / 100;

  return JSON.stringify({
    conversions: [
      {
        conversionAction: `customers/${customerId.replace(/[^0-9]/g, "")}/conversionActions/${conversionActionId}`,
        conversionDateTime: event.createdAt.replace("T", " ").replace("Z", "+00:00"),
        conversionValue: value,
        currencyCode: event.currency.toUpperCase(),
        orderId: event.sessionId,
        cartData: {
          items: event.lineItemSlugs.map((slug) => ({
            productId: `print:${slug}`,
            quantity: 1,
          })),
        },
      },
    ],
    partialFailure: true,
  });
}

export function buildPinterestCapiPayload(event: CheckoutAbandonEvent): string {
  const preview = event.payloadPreview;
  const value = typeof preview.value === "number" ? preview.value : event.cartValueCents / 100;

  return JSON.stringify({
    data: [
      {
        event_name: event.eventName,
        action_source: "web",
        event_time: Math.floor(new Date(event.createdAt).getTime() / 1000),
        event_id: event.sessionId,
        custom_data: {
          currency: event.currency.toUpperCase(),
          value: String(value),
          content_ids: event.lineItemSlugs.map((slug) => `print:${slug}`),
          num_items: event.lineItemSlugs.length,
          shipping_region: event.shippingRegion,
        },
      },
    ],
  });
}

export function getGoogleRetargetingHttpReady(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.GOOGLE_ADS_CUSTOMER_ID?.trim() &&
      env.GOOGLE_ADS_ACCESS_TOKEN?.trim() &&
      env.GOOGLE_ADS_CONVERSION_ACTION_ID?.trim(),
  );
}

export function getPinterestRetargetingHttpReady(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.PINTEREST_AD_ACCOUNT_ID?.trim() && env.PINTEREST_ACCESS_TOKEN?.trim(),
  );
}

export async function fireMetaCapiEvent(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike = fetch,
): Promise<RetargetingHttpResult> {
  const pixelId = env.META_PIXEL_ID?.trim() ?? "";
  const accessToken = env.META_ACCESS_TOKEN?.trim() ?? "";
  const endpoint = buildMetaCapiEndpoint(pixelId, accessToken);
  const body = buildMetaCapiPayload(event);

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const responseText = await response.text();

  return {
    platform: "meta",
    ok: response.ok,
    statusCode: response.status,
    responseSnippet: responseText.slice(0, 240),
    bytesSent: body.length,
    endpoint: `https://graph.facebook.com/v19.0/${pixelId}/events`,
  };
}

export async function fireGoogleConversionEvent(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike = fetch,
): Promise<RetargetingHttpResult> {
  const customerId = env.GOOGLE_ADS_CUSTOMER_ID?.trim() ?? "";
  const endpoint = buildGoogleConversionEndpoint(customerId);
  const body = buildGoogleConversionPayload(event, env);

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GOOGLE_ADS_ACCESS_TOKEN ?? ""}`,
      "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "print-atelier-scaffold",
    },
    body,
  });

  const responseText = await response.text();

  return {
    platform: "google",
    ok: response.ok,
    statusCode: response.status,
    responseSnippet: responseText.slice(0, 240),
    bytesSent: body.length,
    endpoint,
  };
}

export async function firePinterestCapiEvent(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike = fetch,
): Promise<RetargetingHttpResult> {
  const adAccountId = env.PINTEREST_AD_ACCOUNT_ID?.trim() ?? "";
  const endpoint = buildPinterestEventsEndpoint(adAccountId);
  const body = buildPinterestCapiPayload(event);

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PINTEREST_ACCESS_TOKEN ?? ""}`,
    },
    body,
  });

  const responseText = await response.text();

  return {
    platform: "pinterest",
    ok: response.ok,
    statusCode: response.status,
    responseSnippet: responseText.slice(0, 240),
    bytesSent: body.length,
    endpoint,
  };
}

async function firePlatformRetargetingEvent(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
  fetchFn: FetchLike,
): Promise<{ http: RetargetingHttpResult; updated: CheckoutAbandonEvent; live: boolean }> {
  let http: RetargetingHttpResult;

  if (event.platform === "meta") {
    http = await fireMetaCapiEvent(event, env, fetchFn);
  } else if (event.platform === "google") {
    http = await fireGoogleConversionEvent(event, env, fetchFn);
  } else {
    http = await firePinterestCapiEvent(event, env, fetchFn);
  }

  const live = http.ok;
  const blockerLabel =
    event.platform === "meta"
      ? `Meta CAPI HTTP ${http.statusCode}`
      : event.platform === "google"
        ? `Google conversion HTTP ${http.statusCode}`
        : `Pinterest CAPI HTTP ${http.statusCode}`;

  return {
    http,
    live,
    updated: {
      ...event,
      blockers: live ? event.blockers : [...event.blockers, blockerLabel],
      payloadPreview: {
        ...event.payloadPreview,
        http_status: http.statusCode,
        http_ok: live ? 1 : 0,
        live_fired: live ? 1 : 0,
      },
    },
  };
}

function shouldFireLive(
  event: CheckoutAbandonEvent,
  env: Record<string, string | undefined>,
): boolean {
  if (!event.pixelReady) {
    return false;
  }
  if (event.platform === "meta") {
    return getRetargetingEnvStatus(env).metaReady;
  }
  if (event.platform === "google") {
    return getGoogleRetargetingHttpReady(env);
  }
  return getPinterestRetargetingHttpReady(env);
}

export async function executeCheckoutRetargetingLive(
  events: CheckoutAbandonEvent[],
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<CheckoutRetargetingLiveResult> {
  const httpResults: RetargetingHttpResult[] = [];
  let liveFired = 0;

  const updatedEvents = await Promise.all(
    events.map(async (event) => {
      if (!shouldFireLive(event, env)) {
        return event;
      }

      if (!fetchFn) {
        return {
          ...event,
          blockers: [
            ...event.blockers,
            "HTTP client not configured — CAPI/conversion payload preview only",
          ],
        };
      }

      const result = await firePlatformRetargetingEvent(event, env, fetchFn);
      httpResults.push(result.http);

      if (result.live) {
        liveFired += 1;
      }

      return result.updated;
    }),
  );

  const anyPlatformReady =
    getRetargetingEnvStatus(env).metaReady ||
    getGoogleRetargetingHttpReady(env) ||
    getPinterestRetargetingHttpReady(env);

  return {
    events: updatedEvents,
    liveFired,
    httpResults,
    simulated: !fetchFn || !anyPlatformReady,
  };
}

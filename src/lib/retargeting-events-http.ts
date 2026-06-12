import type { CheckoutAbandonEvent } from "./retargeting-events";
import { getRetargetingEnvStatus } from "./retargeting-events";

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type RetargetingHttpResult = {
  platform: "meta";
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

export async function executeCheckoutRetargetingLive(
  events: CheckoutAbandonEvent[],
  env: Record<string, string | undefined> = {},
  fetchFn?: FetchLike,
): Promise<CheckoutRetargetingLiveResult> {
  const envStatus = getRetargetingEnvStatus(env);
  const httpResults: RetargetingHttpResult[] = [];
  let liveFired = 0;

  const updatedEvents = await Promise.all(
    events.map(async (event) => {
      if (event.platform !== "meta" || !event.pixelReady || !envStatus.metaReady) {
        return event;
      }

      if (!fetchFn) {
        return {
          ...event,
          blockers: [...event.blockers, "HTTP client not configured — CAPI payload preview only"],
        };
      }

      const http = await fireMetaCapiEvent(event, env, fetchFn);
      httpResults.push(http);

      if (http.ok) {
        liveFired += 1;
      }

      return {
        ...event,
        blockers: http.ok ? event.blockers : [...event.blockers, `Meta CAPI HTTP ${http.statusCode}`],
        payloadPreview: {
          ...event.payloadPreview,
          http_status: http.statusCode,
          http_ok: http.ok ? 1 : 0,
          live_fired: http.ok ? 1 : 0,
        },
      };
    }),
  );

  return {
    events: updatedEvents,
    liveFired,
    httpResults,
    simulated: !fetchFn || !envStatus.metaReady,
  };
}

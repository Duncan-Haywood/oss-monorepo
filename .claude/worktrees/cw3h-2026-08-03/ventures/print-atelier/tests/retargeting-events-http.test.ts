import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGoogleConversionPayload,
  buildMetaCapiPayload,
  buildPinterestCapiPayload,
  executeCheckoutRetargetingLive,
  fireGoogleConversionEvent,
  fireMetaCapiEvent,
  firePinterestCapiEvent,
} from "../src/lib/retargeting-events-http.ts";
import {
  buildCheckoutSessionRetargetingEvents,
  clearRetargetingEventsForTests,
} from "../src/lib/retargeting-events.ts";
import type { CheckoutLineItem } from "../src/lib/checkout.ts";

const sampleLineItems: CheckoutLineItem[] = [
  {
    artworkSlug: "midnight-coast",
    title: "Midnight Coast",
    artistName: "Elena Rostova",
    retailPrice: 85,
    fulfillmentCost: 28,
    quantity: 1,
  },
];

const metaEnv = {
  META_PIXEL_ID: "px_123",
  META_ACCESS_TOKEN: "tok_abc",
};

test("buildMetaCapiPayload serializes InitiateCheckout event for Meta CAPI", () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_meta_1",
    sampleLineItems,
    9500,
    "US",
    metaEnv,
  );
  const metaEvent = events.find((event) => event.platform === "meta");
  assert.ok(metaEvent);

  const body = buildMetaCapiPayload(metaEvent!);
  const parsed = JSON.parse(body) as {
    data: Array<{ event_name: string; custom_data: { content_ids: string[] } }>;
  };

  assert.equal(parsed.data[0]?.event_name, "InitiateCheckout");
  assert.deepEqual(parsed.data[0]?.custom_data.content_ids, ["print:midnight-coast"]);
});

test("fireMetaCapiEvent performs HTTP when fetch is provided", async () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_meta_2",
    sampleLineItems,
    8500,
    "US",
    metaEnv,
  );
  const metaEvent = events.find((event) => event.platform === "meta");
  assert.ok(metaEvent);

  const result = await fireMetaCapiEvent(metaEvent!, metaEnv, async () => ({
    ok: true,
    status: 200,
    text: async () => '{"events_received":1}',
  }));

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.ok(result.bytesSent > 0);
  assert.match(result.endpoint, /px_123/);
});

test("executeCheckoutRetargetingLive marks meta events as live fired on HTTP success", async () => {
  clearRetargetingEventsForTests();
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_meta_3",
    sampleLineItems,
    8500,
    "US",
    metaEnv,
  );

  const live = await executeCheckoutRetargetingLive(events, metaEnv, async () => ({
    ok: true,
    status: 200,
    text: async () => '{"events_received":1}',
  }));

  assert.equal(live.liveFired, 1);
  assert.equal(live.simulated, false);
  assert.equal(live.httpResults.length, 1);
  assert.equal(live.events.find((event) => event.platform === "meta")?.payloadPreview.live_fired, 1);
});

const googleEnv = {
  GOOGLE_ADS_CUSTOMER_ID: "1234567890",
  GOOGLE_ADS_ACCESS_TOKEN: "google_tok",
  GOOGLE_ADS_CONVERSION_ACTION_ID: "987654321",
};

const pinterestEnv = {
  PINTEREST_AD_ACCOUNT_ID: "act_123",
  PINTEREST_ACCESS_TOKEN: "pin_tok",
};

test("buildGoogleConversionPayload serializes begin_checkout for Google Ads upload", () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_google_1",
    sampleLineItems,
    9500,
    "US",
    googleEnv,
  );
  const googleEvent = events.find((event) => event.platform === "google");
  assert.ok(googleEvent);

  const body = buildGoogleConversionPayload(googleEvent!, googleEnv);
  const parsed = JSON.parse(body) as {
    conversions: Array<{ orderId: string; cartData: { items: Array<{ productId: string }> } }>;
  };

  assert.equal(parsed.conversions[0]?.orderId, "chk_google_1");
  assert.equal(parsed.conversions[0]?.cartData.items[0]?.productId, "print:midnight-coast");
});

test("fireGoogleConversionEvent performs HTTP when fetch is provided", async () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_google_2",
    sampleLineItems,
    8500,
    "US",
    googleEnv,
  );
  const googleEvent = events.find((event) => event.platform === "google");
  assert.ok(googleEvent);

  const result = await fireGoogleConversionEvent(googleEvent!, googleEnv, async () => ({
    ok: true,
    status: 200,
    text: async () => '{"results":[]}',
  }));

  assert.equal(result.ok, true);
  assert.equal(result.platform, "google");
  assert.match(result.endpoint, /customers\/1234567890/);
});

test("buildPinterestCapiPayload serializes checkout event for Pinterest CAPI", () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_pin_1",
    sampleLineItems,
    9500,
    "US",
    pinterestEnv,
  );
  const pinEvent = events.find((event) => event.platform === "pinterest");
  assert.ok(pinEvent);

  const body = buildPinterestCapiPayload(pinEvent!);
  const parsed = JSON.parse(body) as {
    data: Array<{ event_name: string; custom_data: { content_ids: string[] } }>;
  };

  assert.equal(parsed.data[0]?.event_name, "checkout");
  assert.deepEqual(parsed.data[0]?.custom_data.content_ids, ["print:midnight-coast"]);
});

test("executeCheckoutRetargetingLive fires all three platforms when credentials pass", async () => {
  clearRetargetingEventsForTests();
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_all_1",
    sampleLineItems,
    8500,
    "US",
    { ...metaEnv, ...googleEnv, ...pinterestEnv },
  );

  const live = await executeCheckoutRetargetingLive(
    events,
    { ...metaEnv, ...googleEnv, ...pinterestEnv },
    async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    }),
  );

  assert.equal(live.liveFired, 3);
  assert.equal(live.httpResults.length, 3);
});

test("firePinterestCapiEvent performs HTTP when fetch is provided", async () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_pin_2",
    sampleLineItems,
    8500,
    "US",
    pinterestEnv,
  );
  const pinEvent = events.find((event) => event.platform === "pinterest");
  assert.ok(pinEvent);

  const result = await firePinterestCapiEvent(pinEvent!, pinterestEnv, async () => ({
    ok: true,
    status: 200,
    text: async () => '{"num_events_received":1}',
  }));

  assert.equal(result.ok, true);
  assert.equal(result.platform, "pinterest");
  assert.match(result.endpoint, /act_123/);
});

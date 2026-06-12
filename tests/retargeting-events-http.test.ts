import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMetaCapiPayload,
  executeCheckoutRetargetingLive,
  fireMetaCapiEvent,
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

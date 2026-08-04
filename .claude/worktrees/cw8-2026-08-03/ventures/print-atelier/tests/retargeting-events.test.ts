import assert from "node:assert/strict";
import { test } from "node:test";

import type { CheckoutLineItem } from "../src/lib/checkout.ts";
import {
  buildCheckoutSessionRetargetingEvents,
  clearRetargetingEventsForTests,
  getRetargetingEnvStatus,
  recordCheckoutSessionRetargetingEvents,
  buildRetargetingEventSummary,
} from "../src/lib/retargeting-events.ts";

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

test("getRetargetingEnvStatus reports missing pixel credentials", () => {
  const status = getRetargetingEnvStatus({});
  assert.equal(status.platformsReady, 0);
  assert.ok(status.blockers.length >= 3);
});

test("buildCheckoutSessionRetargetingEvents creates per-platform abandon payloads", () => {
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_test_1",
    sampleLineItems,
    9500,
    "US",
    {
      META_PIXEL_ID: "px_1",
      META_ACCESS_TOKEN: "tok_1",
      GOOGLE_ADS_CUSTOMER_ID: "123",
      PINTEREST_AD_ACCOUNT_ID: "pin_1",
      PINTEREST_ACCESS_TOKEN: "pin_tok",
    },
  );

  assert.equal(events.length, 3);
  assert.ok(events.every((event) => event.pixelReady));
  assert.equal(events[0]?.lineItemSlugs[0], "midnight-coast");
  assert.equal(events[0]?.cartValueCents, 9500);
});

test("recordCheckoutSessionRetargetingEvents stores session events for summary", () => {
  clearRetargetingEventsForTests();
  const events = buildCheckoutSessionRetargetingEvents(
    "chk_test_2",
    sampleLineItems,
    8500,
    "US",
  );
  recordCheckoutSessionRetargetingEvents(events);
  const summary = buildRetargetingEventSummary({});
  assert.equal(summary.totalEvents, 3);
  assert.equal(summary.uniqueSessions, 1);
  clearRetargetingEventsForTests();
});

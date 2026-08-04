import test from "node:test";
import assert from "node:assert/strict";

import { checkCapiEventDeliveryHealth } from "../src/lib/capi-health";
import type { CheckoutAbandonEvent } from "../src/lib/retargeting-events";

test("checkCapiEventDeliveryHealth reports healthy status when all 3 platforms are configured", () => {
  const report = checkCapiEventDeliveryHealth({
    env: {
      META_PIXEL_ID: "123456",
      META_ACCESS_TOKEN: "meta_tok",
      GOOGLE_ADS_CUSTOMER_ID: "goog_123",
      PINTEREST_AD_ACCOUNT_ID: "pin_123",
      PINTEREST_ACCESS_TOKEN: "pin_tok",
    },
    eventsOverride: [],
  });

  assert.equal(report.overallStatus, "healthy");
  assert.equal(report.platformsReadyCount, 3);
  assert.equal(report.overallDeliveryRatePercent, 100);
  assert.equal(report.platformHealth.meta.status, "healthy");
  assert.equal(report.platformHealth.google.status, "healthy");
  assert.equal(report.platformHealth.pinterest.status, "healthy");
  assert.match(report.summaryLabel, /healthy across all 3 platforms/);
});

test("checkCapiEventDeliveryHealth reports degraded status when credentials are missing for a platform", () => {
  const report = checkCapiEventDeliveryHealth({
    env: {
      META_PIXEL_ID: "123456",
      META_ACCESS_TOKEN: "meta_tok",
    },
    eventsOverride: [],
  });

  assert.equal(report.overallStatus, "degraded");
  assert.equal(report.platformsReadyCount, 1);
  assert.equal(report.platformHealth.meta.status, "healthy");
  assert.equal(report.platformHealth.google.status, "disabled");
  assert.equal(report.platformHealth.pinterest.status, "disabled");
  assert.ok(report.blockers.some((b) => b.includes("Google Ads customer ID")));
});

test("checkCapiEventDeliveryHealth reports critical status when no credentials are configured", () => {
  const report = checkCapiEventDeliveryHealth({
    env: {},
    eventsOverride: [],
  });

  assert.equal(report.overallStatus, "critical");
  assert.equal(report.platformsReadyCount, 0);
  assert.match(report.summaryLabel, /Critical CAPI health alert/);
});

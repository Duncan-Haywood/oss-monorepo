import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getPilotApiUrl,
  liveKpiView,
  mapLiveKpis,
  payloadHasActivity,
  type LiveKpiPayload,
} from "../pilot-kpis.js";

const liveToday: LiveKpiPayload = {
  source: "live",
  date: "2026-08-25",
  resolvedFrom: "requested",
  entries: 10,
  bounces: 2,
  purchases: 2,
  conversion_rate: 0.2,
  revenue_cents: 3000,
  revenue_per_entrant_cents: 300,
  avg_basket_cents: 1500,
  vsPriorWeek: {
    date: "2026-08-18",
    entries: 8,
    conversion_rate: 0.125,
    revenue_cents: 2000,
  },
};

test("mapLiveKpis converts cents and rates into owner-facing Euro figures", () => {
  const kpis = mapLiveKpis(liveToday);
  assert.equal(kpis.entries, 10);
  assert.equal(kpis.purchases, 2);
  assert.equal(kpis.revenueEur, 30);
  assert.equal(kpis.avgBasketEur, 15);
  assert.equal(kpis.conversionPct, 20);
  assert.equal(kpis.bouncePct, 20);
  assert.equal(kpis.engaged, null);
  assert.deepEqual(kpis.vsLastWeek, {
    entries: "+2 vs last week",
    conversion: "+7.5 pts",
    revenue: "+50%",
  });
});

test("liveKpiView names last-activity days so an empty today is not sold as today's numbers", () => {
  const view = liveKpiView({ ...liveToday, resolvedFrom: "latest", date: "2026-08-19" });
  assert.equal(view.source, "live");
  assert.match(view.message, /last activity 2026-08-19/);
});

test("payloadHasActivity is false for a zeroed today", () => {
  assert.equal(
    payloadHasActivity({
      ...liveToday,
      entries: 0,
      bounces: 0,
      purchases: 0,
      conversion_rate: 0,
      revenue_cents: 0,
      revenue_per_entrant_cents: 0,
      avg_basket_cents: 0,
      vsPriorWeek: null,
    }),
    false,
  );
});

test("getPilotApiUrl trims a trailing slash and treats blank as unset", () => {
  assert.equal(getPilotApiUrl("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  assert.equal(getPilotApiUrl("   "), undefined);
  assert.equal(getPilotApiUrl(undefined), undefined);
});

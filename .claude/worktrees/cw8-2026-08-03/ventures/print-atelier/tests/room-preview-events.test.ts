import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordRoomPreviewEvent,
  getRoomPreviewEvents,
  summarizeRoomPreviewAnalytics,
  clearRoomPreviewEvents,
} from "../src/lib/room-preview-events.ts";

test("records preview event and retrieves it cleanly", () => {
  clearRoomPreviewEvents();

  const event = recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "preview_opened",
    roomStyle: "living_room",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 45,
  });

  assert.ok(event.eventId.startsWith("rpe_"));
  assert.equal(event.artworkSlug, "urban-geometry");

  const events = getRoomPreviewEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "preview_opened");
});

test("filters events by artwork slug", () => {
  clearRoomPreviewEvents();

  recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "preview_opened",
    roomStyle: "living_room",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 30,
  });

  recordRoomPreviewEvent({
    artworkSlug: "coastal-serenity",
    artworkTitle: "Coastal Serenity",
    eventType: "preview_opened",
    roomStyle: "minimalist_bedroom",
    sourceChannel: "google_search",
    sessionDurationSeconds: 60,
  });

  const urbanEvents = getRoomPreviewEvents("urban-geometry");
  assert.equal(urbanEvents.length, 1);
  assert.equal(urbanEvents[0].artworkTitle, "Urban Geometry No. 1");
});

test("calculates room preview analytics summary correctly", () => {
  clearRoomPreviewEvents();

  recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "preview_opened",
    roomStyle: "living_room",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 15,
  });

  recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "room_style_switched",
    roomStyle: "gallery_wall",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 30,
  });

  recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "add_to_cart_from_preview",
    roomStyle: "gallery_wall",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 50,
  });

  recordRoomPreviewEvent({
    artworkSlug: "urban-geometry",
    artworkTitle: "Urban Geometry No. 1",
    eventType: "order_completed_from_preview",
    roomStyle: "gallery_wall",
    sourceChannel: "meta_ads",
    sessionDurationSeconds: 120,
  });

  const summary = summarizeRoomPreviewAnalytics();
  assert.equal(summary.totalEvents, 4);
  assert.equal(summary.totalOpens, 1);
  assert.equal(summary.totalAddToCart, 1);
  assert.equal(summary.totalOrdersCompleted, 1);
  assert.equal(summary.previewConversionRatePercent, 100);
  assert.equal(summary.topRoomStyle, "gallery_wall");
  assert.equal(summary.channelBreakdown.meta_ads.orders, 1);
  assert.ok(summary.estimatedCacReductionPercent > 0);
});

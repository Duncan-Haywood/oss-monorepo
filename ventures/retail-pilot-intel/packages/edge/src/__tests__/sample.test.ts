import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSampleAggregateEvent } from "../sample.js";

test("buildSampleAggregateEvent tags itself as a stub so analytics can exclude it from real KPIs", () => {
  const event = buildSampleAggregateEvent("store-1", new Date("2026-08-19T09:42:17Z"));
  assert.equal(event.metadata?.model, "stub");
});

test("buildSampleAggregateEvent describes one door entry", () => {
  const event = buildSampleAggregateEvent("store-1", new Date("2026-08-19T09:42:17Z"));
  assert.equal(event.store_id, "store-1");
  assert.equal(event.source, "door_cv");
  assert.equal(event.metric, "entry");
  assert.equal(event.zone_id, "door_main");
  assert.equal(event.value, 1);
  assert.equal(event.unit, "count");
});

test("buildSampleAggregateEvent buckets to the top of the hour, matching a real 1-hour rollup window", () => {
  const now = new Date("2026-08-19T09:42:17.123Z");
  const event = buildSampleAggregateEvent("store-1", now);
  assert.equal(event.bucket_start, "2026-08-19T09:00:00.000Z");
  assert.equal(event.bucket_end, now.toISOString());
});

test("buildSampleAggregateEvent gives each call a distinct event_id", () => {
  const now = new Date("2026-08-19T09:42:17Z");
  const first = buildSampleAggregateEvent("store-1", now);
  const second = buildSampleAggregateEvent("store-1", now);
  assert.notEqual(first.event_id, second.event_id);
});

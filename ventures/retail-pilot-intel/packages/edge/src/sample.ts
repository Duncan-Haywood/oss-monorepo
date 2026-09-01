import { randomUUID } from "node:crypto";
import type { AggregateEvent } from "@retail-pilot/schemas";

/**
 * Builds a synthetic AggregateEvent for pipeline smoke-testing.
 *
 * Real vision events come from the (not yet built) RTSP door-camera ingest.
 * This exists so `--sample` and the CI bootstrap can exercise the rest of
 * the pipeline (sync, storage, reporting) without a camera. `metadata.model`
 * must stay "stub": packages/analytics keys off exactly that value to keep
 * this synthetic data out of a real store's KPI totals (see
 * `isSyntheticAggregate` in packages/analytics/src/db.ts).
 */
export function buildSampleAggregateEvent(storeId: string, now: Date): AggregateEvent {
  const bucketStart = new Date(now);
  bucketStart.setUTCMinutes(0, 0, 0);

  return {
    event_id: randomUUID(),
    store_id: storeId,
    source: "door_cv",
    metric: "entry",
    zone_id: "door_main",
    bucket_start: bucketStart.toISOString(),
    bucket_end: now.toISOString(),
    value: 1,
    unit: "count",
    metadata: { model: "stub", version: "0.1.0" },
  };
}

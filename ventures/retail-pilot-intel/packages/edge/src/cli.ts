import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AggregateEvent } from "@retail-pilot/schemas";

const storeId = process.env.STORE_ID ?? "pilot-leather-01";
const sample = process.argv.includes("--sample");
const outDir = resolve("data/aggregates/outbox");

if (!sample) {
  // Exit non-zero: a scheduled ingest that produced no events has failed, and a
  // cron that reads exit 0 here would report a dead camera feed as healthy.
  console.error("Edge ingest not connected to RTSP. Use --sample for a test event.");
  process.exit(1);
}

const now = new Date();
const bucketStart = new Date(now);
bucketStart.setUTCMinutes(0, 0, 0);

const event: AggregateEvent = {
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
  // Generated here, not seen by a camera. Analytics uses this to refuse to
  // report a measured funnel rather than to print one that is 100% by
  // construction.
  synthetic: true,
};

mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, `aggregate_${event.event_id}.json`);
writeFileSync(path, JSON.stringify(event, null, 2));
console.log(`Wrote sample aggregate: ${path}`);

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AggregateEvent } from "@retail-pilot/schemas";

const storeId = process.env.STORE_ID ?? "pilot-leather-01";
const sample = process.argv.includes("--sample");
const outDir = resolve("data/aggregates/outbox");

if (!sample) {
  console.error("Edge ingest not connected to RTSP. Use --sample for a test event.");
  process.exit(0);
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
};

mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, `aggregate_${event.event_id}.json`);
writeFileSync(path, JSON.stringify(event, null, 2));
console.log(`Wrote sample aggregate: ${path}`);

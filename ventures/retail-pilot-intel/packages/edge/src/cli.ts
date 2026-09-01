import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSampleAggregateEvent } from "./sample.js";

const storeId = process.env.STORE_ID ?? "pilot-leather-01";
const sample = process.argv.includes("--sample");
const outDir = resolve("data/aggregates/outbox");

if (!sample) {
  console.error("Edge ingest not connected to RTSP. Use --sample for a test event.");
  process.exit(0);
}

const event = buildSampleAggregateEvent(storeId, new Date());

mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, `aggregate_${event.event_id}.json`);
writeFileSync(path, JSON.stringify(event, null, 2));
console.log(`Wrote sample aggregate: ${path}`);

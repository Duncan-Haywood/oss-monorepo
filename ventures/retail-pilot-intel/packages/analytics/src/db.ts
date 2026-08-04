import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AggregateEvent, SaleEvent } from "@retail-pilot/schemas";

export const DEFAULT_DB = resolve("data/pilot.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS aggregate_events (
  event_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  source TEXT NOT NULL,
  metric TEXT NOT NULL,
  zone_id TEXT,
  sku TEXT,
  bucket_start TEXT NOT NULL,
  bucket_end TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT DEFAULT 'count',
  synthetic INTEGER NOT NULL DEFAULT 0,
  payload JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS sale_events (
  event_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  basket_id TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_cents INTEGER,
  payment_class TEXT,
  synthetic INTEGER NOT NULL DEFAULT 0,
  payload JSON NOT NULL
);
`;

/**
 * Databases created before provenance tracking existed have no `synthetic`
 * column, and every row already in them was written by the stub generators.
 * Backfill those rows as synthetic: an event whose provenance was never
 * recorded is not evidence that anything was observed, and guessing "observed"
 * would let the old stub rows go on producing a 100% conversion rate.
 */
function ensureSyntheticColumn(db: DatabaseSync, table: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((c) => c.name === "synthetic")) return;
  db.exec(
    `ALTER TABLE ${table} ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0`,
  );
  db.exec(`UPDATE ${table} SET synthetic = 1`);
}

export function openDb(path = DEFAULT_DB): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  ensureSyntheticColumn(db, "aggregate_events");
  ensureSyntheticColumn(db, "sale_events");
  return db;
}

export function insertAggregate(db: DatabaseSync, event: AggregateEvent): void {
  db.prepare(
    `INSERT OR REPLACE INTO aggregate_events
     (event_id, store_id, source, metric, zone_id, sku, bucket_start, bucket_end, value, unit, synthetic, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.event_id,
    event.store_id,
    event.source,
    event.metric,
    event.zone_id ?? null,
    event.sku ?? null,
    event.bucket_start,
    event.bucket_end,
    event.value,
    event.unit ?? "count",
    event.synthetic ? 1 : 0,
    JSON.stringify(event),
  );
}

export function insertSale(db: DatabaseSync, event: SaleEvent): void {
  db.prepare(
    `INSERT OR REPLACE INTO sale_events
     (event_id, store_id, basket_id, closed_at, currency, total_cents, payment_class, synthetic, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.event_id,
    event.store_id,
    event.basket_id,
    event.closed_at,
    event.currency,
    event.total_cents ?? null,
    event.payment_class ?? null,
    event.synthetic ? 1 : 0,
    JSON.stringify(event),
  );
}

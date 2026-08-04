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
  payload JSON NOT NULL
);
`;

export function openDb(path = DEFAULT_DB): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function insertAggregate(db: DatabaseSync, event: AggregateEvent): void {
  db.prepare(
    `INSERT OR REPLACE INTO aggregate_events
     (event_id, store_id, source, metric, zone_id, sku, bucket_start, bucket_end, value, unit, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify(event),
  );
}

export function insertSale(db: DatabaseSync, event: SaleEvent): void {
  db.prepare(
    `INSERT OR REPLACE INTO sale_events
     (event_id, store_id, basket_id, closed_at, currency, total_cents, payment_class, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.event_id,
    event.store_id,
    event.basket_id,
    event.closed_at,
    event.currency,
    event.total_cents ?? null,
    event.payment_class ?? null,
    JSON.stringify(event),
  );
}

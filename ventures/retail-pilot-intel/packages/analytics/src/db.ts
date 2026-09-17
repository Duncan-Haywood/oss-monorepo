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
 * A store's real pilot.db predates the `synthetic` column on an upgrade.
 * SQLite's CREATE TABLE IF NOT EXISTS won't add it to an existing table, and
 * the INSERT statements below name the column explicitly, so an un-migrated
 * file would fail every insert with "no such column: synthetic".
 */
function migrateSyntheticColumn(db: DatabaseSync, table: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
      throw error;
    }
  }
}

export function openDb(path = DEFAULT_DB): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrateSyntheticColumn(db, "aggregate_events");
  migrateSyntheticColumn(db, "sale_events");
  return db;
}

/**
 * Sample/stub data lets the pipeline be exercised end-to-end without a
 * camera or a POS connection (see packages/edge and packages/pos --sample).
 * It must never be mistaken for a real door count or sale: a stub event
 * merged into a live store's KPI report would silently inflate conversion
 * and revenue numbers shown to the pilot customer, with no column to
 * separate it back out afterwards.
 */
export function isSyntheticAggregate(event: AggregateEvent): boolean {
  return event.metadata?.model === "stub";
}

export function isSyntheticSale(event: SaleEvent): boolean {
  return event.pos_vendor === "stub";
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
    isSyntheticAggregate(event) ? 1 : 0,
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
    isSyntheticSale(event) ? 1 : 0,
    JSON.stringify(event),
  );
}

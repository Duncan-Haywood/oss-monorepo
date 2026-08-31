import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AggregateEvent, SaleEvent } from "@retail-pilot/schemas";

export function withTempDb<T>(fn: (dbPath: string) => T): T;
export function withTempDb<T>(fn: (dbPath: string) => Promise<T>): Promise<T>;
export function withTempDb<T>(fn: (dbPath: string) => T | Promise<T>): T | Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "analytics-test-"));
  const dbPath = join(dir, "pilot.db");
  const cleanup = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const result = fn(dbPath);
    if (result instanceof Promise) {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function aggregateEvent(overrides: Partial<AggregateEvent> = {}): AggregateEvent {
  return {
    event_id: "agg-1",
    store_id: "store-1",
    source: "door_cv",
    metric: "entry",
    bucket_start: "2026-08-19T09:00:00Z",
    bucket_end: "2026-08-19T09:15:00Z",
    value: 4,
    ...overrides,
  };
}

export function saleEvent(overrides: Partial<SaleEvent> = {}): SaleEvent {
  return {
    event_id: "sale-1",
    store_id: "store-1",
    basket_id: "basket-1",
    closed_at: "2026-08-19T09:30:00Z",
    currency: "EUR",
    line_items: [{ sku: "sku-1", quantity: 1, unit_price_cents: 1000 }],
    total_cents: 1000,
    payment_class: "card",
    ...overrides,
  };
}

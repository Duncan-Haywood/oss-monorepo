/** Canonical event shapes (mirror JSON schemas in json/). */

export type AggregateMetric =
  | "entry"
  | "exit"
  | "bounce"
  | "engaged_visit"
  | "zone_dwell_seconds"
  | "touch"
  | "look_in"
  | "pass_by";

export type AggregateSource = "door_cv" | "fixture_cv" | "scanner" | "rfid";

export interface AggregateEvent {
  event_id: string;
  store_id: string;
  source: AggregateSource;
  metric: AggregateMetric;
  zone_id?: string;
  sku?: string;
  bucket_start: string;
  bucket_end: string;
  value: number;
  unit?: "count" | "seconds";
  metadata?: Record<string, unknown>;
}

export interface SaleLineItem {
  sku: string;
  quantity: number;
  unit_price_cents: number;
  description?: string;
}

export type PaymentClass = "cash" | "card" | "mixed" | "other" | "unknown";

export interface SaleEvent {
  event_id: string;
  store_id: string;
  basket_id: string;
  closed_at: string;
  currency: string;
  line_items: SaleLineItem[];
  total_cents?: number;
  payment_class?: PaymentClass;
  pos_vendor?: string;
  raw_reference?: string;
}

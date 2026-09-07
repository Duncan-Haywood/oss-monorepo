import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXAMPLE_INSTALLATIONS,
  canonicalizeTopic,
  captureSummary,
  inferSource,
  normalizeExport,
  parseJson,
  recordCaptureUsage,
  setUsageOptOut,
} from "./capture.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dump = JSON.parse(readFileSync(join(root, "examples/app-installations.json"), "utf8"));
const before = JSON.parse(readFileSync(join(root, "examples/before.json"), "utf8"));

test("normalizes the GraphQL appInstallations fixture", () => {
  const inventory = normalizeExport(dump);
  assert.equal(inventory.source, "shopify-app-installations");
  assert.deepEqual(inventory.apps.map((app) => app.id), ["app-analytics", "app-shipping"]);
  assert.deepEqual(inventory.apps[0].scopes, ["read_analytics"]);
  assert.deepEqual(inventory.apps[0].declared_scopes, ["read_analytics", "read_reports"]);
  assert.deepEqual(inventory.apps[0].webhooks, ["app/uninstalled"]);
});

test("canonicalizes GraphQL webhook enums without inventing topics", () => {
  assert.equal(canonicalizeTopic("APP_UNINSTALLED"), "app/uninstalled");
  assert.equal(canonicalizeTopic("orders/create"), "orders/create");
  assert.equal(canonicalizeTopic("CUSTOMERS_DATA_REQUEST"), "customers/data_request");
  assert.equal(canonicalizeTopic("CUSTOMERS_PURCHASING_SUMMARY"), "customers/purchasing_summary");
  assert.equal(canonicalizeTopic("ORDERS_PARTIALLY_FULFILLED"), "orders/partially_fulfilled");
  assert.equal(canonicalizeTopic("VARIANTS_OUT_OF_STOCK"), "variants/out_of_stock");
});

test("GraphQL compliance enums compare unchanged against REST inventory", () => {
  const graphql = {
    data: {
      appInstallations: {
        edges: [
          {
            node: {
              app: { handle: "compliance-app" },
              accessScopes: [{ handle: "read_customers" }],
              webhookSubscriptions: {
                edges: [
                  { node: { topic: "CUSTOMERS_DATA_REQUEST" } },
                  { node: { topic: "CUSTOMERS_REDACT" } },
                  { node: { topic: "SHOP_REDACT" } },
                ],
              },
            },
          },
        ],
      },
    },
    api_version: "2026-07",
    captured_at: "2026-08-24T10:00:00Z",
  };
  const rest = {
    captured_at: "2026-08-25T10:00:00Z",
    api_version: "2026-07",
    source: "rest",
    authorization_state: "active",
    apps: [
      {
        id: "compliance-app",
        scopes: ["read_customers"],
        webhooks: ["customers/data_request", "customers/redact", "shop/redact"],
      },
    ],
  };
  const before = normalizeExport(graphql);
  assert.deepEqual(before.apps[0].webhooks, ["customers/data_request", "customers/redact", "shop/redact"]);
  assert.deepEqual(normalizeExport(rest).apps[0].webhooks, before.apps[0].webhooks);
});

test("browser example dump matches the Python fixture shape", () => {
  assert.deepEqual(EXAMPLE_INSTALLATIONS.data.appInstallations.edges[0].node.app.handle, dump.data.appInstallations.edges[0].node.app.handle);
  const inventory = normalizeExport(EXAMPLE_INSTALLATIONS);
  assert.equal(inventory.apps.length, 2);
});

test("refuses to treat declared scopes as granted", () => {
  assert.throws(
    () => normalizeExport({ api_version: "2026-07", apps: [{ handle: "reports", requestedAccessScopes: [{ handle: "read_reports" }] }] }),
    /declared scopes but no granted scopes/,
  );
});

test("requires api_version instead of inventing one", () => {
  const payload = { apps: [{ id: "app-shipping", scopes: ["read_products"], webhooks: [] }] };
  assert.throws(() => normalizeExport(payload), /api_version/);
  const inventory = normalizeExport(payload, { api_version: "2026-07", now: new Date("2026-08-25T00:00:00Z") });
  assert.equal(inventory.api_version, "2026-07");
  assert.equal(inventory.captured_at, "2026-08-25T00:00:00Z");
});

test("records a webhook limitation when the field is absent", () => {
  const inventory = normalizeExport(
    { api_version: "2026-07", apps: [{ id: "app-shipping", scopes: ["read_products"] }] },
    { captured_at: "2026-08-25T00:00:00Z" },
  );
  assert.deepEqual(inventory.limitations, ["webhooks_not_in_export"]);
  assert.match(captureSummary(inventory), /Do not treat webhook diffs/);
});

test("passes through a canonical inventory", () => {
  const inventory = normalizeExport(before);
  assert.deepEqual(inventory.apps[0].scopes, ["read_analytics"]);
});

test("rejects unknown JSON and malformed text", () => {
  assert.throws(() => normalizeExport({ orders: [] }, { api_version: "2026-07" }), /app inventory/);
  assert.throws(() => parseJson("{"), /cannot read export/);
});

test("usage events stay aggregate and honor opt-out", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  recordCaptureUsage("inventory_normalized", storage, false);
  recordCaptureUsage("inventory_downloaded", storage, false);
  const recorded = JSON.parse(store.get("shopify-permission-drift-usage"));
  assert.equal(recorded.inventory_normalized, 1);
  assert.equal(recorded.inventory_downloaded, 1);
  setUsageOptOut(true, storage);
  assert.equal(store.has("shopify-permission-drift-usage"), false);
  recordCaptureUsage("inventory_copied", storage, true);
  assert.equal(store.has("shopify-permission-drift-usage"), false);
});

test("infers installations source", () => {
  assert.equal(inferSource(dump), "shopify-app-installations");
});

test("webhook coverage survives canonical JSON re-import", () => {
  for (const supplied of [false, true]) {
    const app = { id: "app-shipping", scopes: ["read_products"] };
    if (supplied) app.webhooks = [];
    const inventory = normalizeExport({ api_version: "2026-07", apps: [app] });
    const restored = normalizeExport(JSON.parse(JSON.stringify(inventory)));
    assert.deepEqual(restored.apps[0].webhooks, []);
    assert.equal(restored.apps[0].webhook_coverage, supplied ? "complete" : "absent");
    assert.equal(captureSummary(restored), captureSummary(inventory));
  }
});

/** Normalize a customer-authorized Shopify app export into inventory JSON.
 *
 * Same rules as src/capture_inventory.py: local transform only, no Shopify
 * API, no inferred granted scopes. Declared/requested scopes stay on
 * `declared_scopes` and never fill the granted `scopes` list.
 */

const REQUIRED = ["captured_at", "api_version", "source", "authorization_state", "apps"];
const USAGE_KEY = "shopify-permission-drift-usage";

export const EXAMPLE_INSTALLATIONS = {
  data: {
    appInstallations: {
      edges: [
        {
          node: {
            id: "gid://shopify/AppInstallation/1",
            app: { id: "gid://shopify/App/101", handle: "app-analytics" },
            accessScopes: [{ handle: "read_analytics" }],
            requestedAccessScopes: [{ handle: "read_analytics" }, { handle: "read_reports" }],
            webhookSubscriptions: { edges: [{ node: { topic: "APP_UNINSTALLED" } }] },
          },
        },
        {
          node: {
            id: "gid://shopify/AppInstallation/2",
            app: { handle: "app-shipping" },
            accessScopes: [{ handle: "read_products" }],
            webhookSubscriptions: { edges: [] },
          },
        },
      ],
    },
  },
  api_version: "2026-07",
  captured_at: "2026-08-24T10:00:00Z",
  authorization_state: "active",
};

function parseCapturedAt(value) {
  const parsed = Date.parse(String(value).replace("Z", "+00:00"));
  if (Number.isNaN(parsed)) {
    throw new Error("inventory captured_at must be an ISO 8601 timestamp");
  }
  return parsed;
}

export function validateInventory(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || REQUIRED.some((key) => !(key in data))) {
    throw new Error("inventory must include captured_at, api_version, source, authorization_state, and apps");
  }
  for (const field of REQUIRED.slice(0, -1)) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      throw new Error(`inventory ${field} must be a non-empty string`);
    }
  }
  parseCapturedAt(data.captured_at);
  if (!Array.isArray(data.apps)) {
    throw new Error("inventory apps must be a list");
  }
  return data;
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot read export: ${error.message}`);
  }
}

function unwrapData(payload) {
  return payload && typeof payload === "object" && payload.data && typeof payload.data === "object" ? payload.data : payload;
}

function nodes(container) {
  if (Array.isArray(container)) return container;
  if (!container || typeof container !== "object") return null;
  if (Array.isArray(container.nodes)) return container.nodes;
  if (Array.isArray(container.edges)) {
    return container.edges.map((edge) => (edge && typeof edge === "object" && edge.node ? edge.node : edge));
  }
  return null;
}

export function extractAppRecords(payload) {
  if (Array.isArray(payload)) {
    if (payload.every((item) => item && typeof item === "object")) return payload;
    return payload.length === 0 ? [] : null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload.apps)) return payload.apps;

  const body = unwrapData(payload);
  if (body && typeof body === "object") {
    for (const key of ["appInstallations", "currentAppInstallations", "applications"]) {
      if (key in body) {
        const found = nodes(body[key]);
        if (found) return found;
      }
    }
    if (body.currentAppInstallation && typeof body.currentAppInstallation === "object") {
      return [body.currentAppInstallation];
    }
    if (Array.isArray(body.apps)) return body.apps;
  }
  for (const key of ["appInstallations", "applications"]) {
    if (key in payload) {
      const found = nodes(payload[key]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * GraphQL enums whose action segment contains underscores. Splitting on the
 * last "_" invents a different REST topic (CUSTOMERS_DATA_REQUEST →
 * customers_data/request instead of customers/data_request) and makes an
 * unchanged GraphQL vs REST inventory look like webhook drift.
 */
const GRAPHQL_TOPIC_REST = {
  APP_SCOPES_UPDATE: "app/scopes_update",
  APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT: "app_subscriptions/approaching_capped_amount",
  AUDIT_EVENTS_ADMIN_API_ACTIVITY: "audit_events/admin_api_activity",
  CUSTOMERS_DATA_REQUEST: "customers/data_request",
  CUSTOMERS_PURCHASING_SUMMARY: "customers/purchasing_summary",
  DISCOUNTS_REDEEMCODE_ADDED: "discounts/redeemcode_added",
  DISCOUNTS_REDEEMCODE_REMOVED: "discounts/redeemcode_removed",
  FULFILLMENT_ORDERS_CANCELLATION_REQUEST_ACCEPTED: "fulfillment_orders/cancellation_request_accepted",
  FULFILLMENT_ORDERS_CANCELLATION_REQUEST_REJECTED: "fulfillment_orders/cancellation_request_rejected",
  FULFILLMENT_ORDERS_CANCELLATION_REQUEST_SUBMITTED: "fulfillment_orders/cancellation_request_submitted",
  FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_ACCEPTED: "fulfillment_orders/fulfillment_request_accepted",
  FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_REJECTED: "fulfillment_orders/fulfillment_request_rejected",
  FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED: "fulfillment_orders/fulfillment_request_submitted",
  FULFILLMENT_ORDERS_FULFILLMENT_SERVICE_FAILED_TO_COMPLETE: "fulfillment_orders/fulfillment_service_failed_to_complete",
  FULFILLMENT_ORDERS_HOLD_RELEASED: "fulfillment_orders/hold_released",
  FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_LOCAL_DELIVERY: "fulfillment_orders/line_items_prepared_for_local_delivery",
  FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_PICKUP: "fulfillment_orders/line_items_prepared_for_pickup",
  FULFILLMENT_ORDERS_ORDER_ROUTING_COMPLETE: "fulfillment_orders/order_routing_complete",
  FULFILLMENT_ORDERS_PLACED_ON_HOLD: "fulfillment_orders/placed_on_hold",
  FULFILLMENT_ORDERS_SCHEDULED_FULFILLMENT_ORDER_READY: "fulfillment_orders/scheduled_fulfillment_order_ready",
  INVENTORY_SHIPMENTS_ADD_ITEMS: "inventory_shipments/add_items",
  INVENTORY_SHIPMENTS_MARK_IN_TRANSIT: "inventory_shipments/mark_in_transit",
  INVENTORY_SHIPMENTS_RECEIVE_ITEMS: "inventory_shipments/receive_items",
  INVENTORY_SHIPMENTS_REMOVE_ITEMS: "inventory_shipments/remove_items",
  INVENTORY_SHIPMENTS_UPDATE_ITEM_QUANTITIES: "inventory_shipments/update_item_quantities",
  INVENTORY_SHIPMENTS_UPDATE_TRACKING: "inventory_shipments/update_tracking",
  INVENTORY_TRANSFERS_ADD_ITEMS: "inventory_transfers/add_items",
  INVENTORY_TRANSFERS_READY_TO_SHIP: "inventory_transfers/ready_to_ship",
  INVENTORY_TRANSFERS_REMOVE_ITEMS: "inventory_transfers/remove_items",
  INVENTORY_TRANSFERS_UPDATE_ITEM_QUANTITIES: "inventory_transfers/update_item_quantities",
  ORDERS_PARTIALLY_FULFILLED: "orders/partially_fulfilled",
  ORDERS_RISK_ASSESSMENT_CHANGED: "orders/risk_assessment_changed",
  ORDERS_SHOPIFY_PROTECT_ELIGIBILITY_CHANGED: "orders/shopify_protect_eligibility_changed",
  PRODUCT_FEEDS_FULL_SYNC: "product_feeds/full_sync",
  PRODUCT_FEEDS_FULL_SYNC_FINISH: "product_feeds/full_sync_finish",
  PRODUCT_FEEDS_INCREMENTAL_SYNC: "product_feeds/incremental_sync",
  REVERSE_DELIVERIES_ATTACH_DELIVERABLE: "reverse_deliveries/attach_deliverable",
  VARIANTS_IN_STOCK: "variants/in_stock",
  VARIANTS_OUT_OF_STOCK: "variants/out_of_stock",
};

export function canonicalizeTopic(topic) {
  if (!topic || topic.includes("/")) return topic;
  if (GRAPHQL_TOPIC_REST[topic]) return GRAPHQL_TOPIC_REST[topic];
  if (topic === topic.toUpperCase() && topic.includes("_")) {
    const index = topic.lastIndexOf("_");
    return `${topic.slice(0, index).toLowerCase()}/${topic.slice(index + 1).toLowerCase()}`;
  }
  return topic;
}

function stringList(value, field, appId) {
  if (value === undefined || value === null) {
    throw new Error(`app ${appId} is missing ${field}`);
  }
  let items = [];
  if (typeof value === "string") {
    items = value.split(",").map((part) => part.trim()).filter(Boolean);
  } else if (Array.isArray(value)) {
    items = value.map((item) => {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const handle = item.handle || item.topic || item.name;
        if (typeof handle === "string" && handle.trim()) return handle.trim();
        throw new Error(`app ${appId} ${field} entries must be strings or objects with handle/topic`);
      }
      throw new Error(`app ${appId} must contain a string ${field} list`);
    });
  } else {
    throw new Error(`app ${appId} ${field} must be a string or list`);
  }
  if (field === "webhooks") items = items.map(canonicalizeTopic);
  if (items.length !== new Set(items).size) {
    throw new Error(`app ${appId} contains duplicate ${field}`);
  }
  return items;
}

function scopeValue(app) {
  for (const key of ["scopes", "accessScopes", "access_scopes", "granted_scopes", "grantedScopes"]) {
    if (key in app) return app[key];
  }
  return undefined;
}

function declaredValue(app) {
  for (const key of ["declared_scopes", "declaredScopes", "requestedAccessScopes", "requested_access_scopes"]) {
    if (key in app) return app[key];
  }
  if (app.app && typeof app.app === "object") {
    for (const key of ["requestedAccessScopes", "requested_access_scopes", "declared_scopes"]) {
      if (key in app.app) return app.app[key];
    }
  }
  return undefined;
}

function webhookValue(app) {
  for (const key of ["webhooks", "webhook_topics", "webhookTopics"]) {
    if (key in app) return { value: app[key], present: true };
  }
  if ("webhookSubscriptions" in app) {
    const found = nodes(app.webhookSubscriptions);
    return { value: found === null ? app.webhookSubscriptions : found, present: true };
  }
  return { value: undefined, present: false };
}

function appId(app) {
  const nested = app.app && typeof app.app === "object" ? app.app : {};
  for (const candidate of [app.handle, nested.handle, app.id, nested.id, app.api_key, app.apiKey, app.api_client_id, app.client_id]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  throw new Error("each app must have a non-empty string id");
}

export function normalizeApp(app) {
  if (!app || typeof app !== "object") throw new Error("each app must be an object");
  const id = appId(app);
  const granted = scopeValue(app);
  const declared = declaredValue(app);
  if (granted === undefined && declared !== undefined) {
    throw new Error(`app ${id} has declared scopes but no granted scopes; refusing to treat declared scopes as granted`);
  }
  if (granted === undefined) throw new Error(`app ${id} is missing granted scopes`);
  const { value: webhooks, present } = webhookValue(app);
  const record = {
    id,
    scopes: stringList(granted, "scopes", id),
    webhooks: present ? stringList(webhooks, "webhooks", id) : [],
  };
  if (declared !== undefined) record.declared_scopes = stringList(declared, "declared_scopes", id);
  // A normalized capture uses [] for omitted webhooks; preserve that uncertainty.
  if (!present || app.webhook_coverage === "absent") record.webhook_coverage = "absent";
  else record.webhook_coverage = "complete";
  return record;
}

export function inferSource(payload) {
  const body = unwrapData(payload);
  if (payload && typeof payload === "object" && typeof payload.source === "string" && payload.source.trim()) {
    return payload.source.trim();
  }
  if (body && typeof body === "object" && ("appInstallations" in body || "currentAppInstallation" in body)) {
    return "shopify-app-installations";
  }
  if (payload && typeof payload === "object" && "applications" in payload) {
    return "shopify-applications-export";
  }
  return "normalized-export";
}

function isCanonicalInventory(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) && REQUIRED.every((key) => key in payload);
}

function assertUniqueIds(apps) {
  const seen = new Set();
  for (const app of apps) {
    if (!app || typeof app !== "object" || typeof app.id !== "string" || !app.id) {
      throw new Error("each app must have a non-empty string id");
    }
    if (seen.has(app.id)) throw new Error(`duplicate app id: ${app.id}`);
    seen.add(app.id);
  }
}

function isoNow(now) {
  const date = now instanceof Date ? now : new Date();
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function normalizeExport(payload, options = {}) {
  const { captured_at: capturedAt, api_version: apiVersion, source, authorization_state: authorizationState, now } = options;
  if (isCanonicalInventory(payload)) {
    const inventory = {
      captured_at: capturedAt || payload.captured_at,
      api_version: apiVersion || payload.api_version,
      source: source || payload.source,
      authorization_state: authorizationState || payload.authorization_state,
      apps: payload.apps.map((app) => (app && typeof app === "object" ? normalizeApp(app) : app)),
    };
    if (Array.isArray(payload.limitations)) inventory.limitations = [...payload.limitations];
    validateInventory(inventory);
    assertUniqueIds(inventory.apps);
    return inventory;
  }

  const records = extractAppRecords(payload);
  if (records === null) {
    throw new Error("export is not a Shopify app inventory or appInstallations payload");
  }
  const apps = records.map(normalizeApp);
  assertUniqueIds(apps);

  const resolvedApiVersion = apiVersion || (payload && typeof payload.api_version === "string" ? payload.api_version : undefined);
  if (!resolvedApiVersion || !String(resolvedApiVersion).trim()) {
    throw new Error("export does not include api_version; pass --api-version rather than guessing");
  }

  const limitations = [];
  if (apps.some((app) => app.webhook_coverage === "absent")) limitations.push("webhooks_not_in_export");

  const inventory = {
    captured_at:
      capturedAt ||
      (payload && typeof payload.captured_at === "string" && payload.captured_at.trim() ? payload.captured_at : isoNow(now)),
    api_version: String(resolvedApiVersion).trim(),
    source: source || inferSource(payload),
    authorization_state:
      authorizationState ||
      (payload && typeof payload.authorization_state === "string" && payload.authorization_state.trim()
        ? payload.authorization_state.trim()
        : "active"),
    apps: apps.map((app) => {
      const next = { id: app.id, scopes: app.scopes, webhooks: app.webhooks };
      if (app.declared_scopes) next.declared_scopes = app.declared_scopes;
      if (app.webhook_coverage === "absent") next.webhook_coverage = "absent";
      return next;
    }),
  };
  if (limitations.length) inventory.limitations = limitations;
  return validateInventory(inventory);
}

export function captureSummary(inventory) {
  const lines = [
    "Shopify app inventory capture",
    `Captured at: ${inventory.captured_at}`,
    `API version: ${inventory.api_version}`,
    `Source: ${inventory.source}`,
    `Authorization state: ${inventory.authorization_state}`,
    `Apps: ${inventory.apps.length}`,
  ];
  for (const app of inventory.apps) {
    const declared = Array.isArray(app.declared_scopes) ? `, declared ${app.declared_scopes.length}` : "";
    const webhookNote = app.webhook_coverage === "absent" ? " (webhooks not in export)" : "";
    lines.push(`- ${app.id}: ${app.scopes.length} granted scopes, ${app.webhooks.length} webhooks${declared}${webhookNote}`);
  }
  if (inventory.limitations?.length) {
    lines.push("", "Limitations");
    for (const item of inventory.limitations) lines.push(`- ${item}`);
    if (inventory.limitations.includes("webhooks_not_in_export")) {
      lines.push("Do not treat webhook diffs as evidence for this capture.");
    }
  }
  lines.push("", "Evidence only. This is not a Shopify API call, security certification, or policy interpretation.");
  return lines.join("\n");
}

export function recordCaptureUsage(event, storage = globalThis.localStorage, optOut = false) {
  if (optOut || !storage) return;
  let current = {};
  try {
    current = JSON.parse(storage.getItem(USAGE_KEY) || "{}");
  } catch {
    current = {};
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = Number(current[event] || 0) + 1;
  try {
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function setUsageOptOut(value, storage = globalThis.localStorage) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && storage) {
    try {
      storage.removeItem(USAGE_KEY);
    } catch {
      /* storage is optional */
    }
  }
}

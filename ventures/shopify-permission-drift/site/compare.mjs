/** Browser-local Shopify permission inventory comparison.
 *
 * Same rules as src/permission_drift.py: evidence only, no Shopify API,
 * no inferred scopes, no "safe/unsafe" verdict. Invalid or reversed
 * captures stay inconclusive rather than looking unchanged.
 */

export const EXAMPLE_BEFORE = {
  captured_at: "2026-08-24T10:00:00Z",
  api_version: "2026-07",
  source: "merchant-export",
  authorization_state: "active",
  apps: [
    { id: "app-analytics", scopes: ["read_analytics"], webhooks: ["app/uninstalled"] },
    { id: "app-shipping", scopes: ["read_products"], webhooks: [] },
  ],
};

export const EXAMPLE_AFTER = {
  captured_at: "2026-08-24T12:00:00Z",
  api_version: "2026-07",
  source: "merchant-export",
  authorization_state: "active",
  apps: [
    {
      id: "app-analytics",
      scopes: ["read_analytics", "read_reports"],
      webhooks: ["app/uninstalled", "shop/update"],
    },
    { id: "app-shipping", scopes: ["read_products"], webhooks: [] },
  ],
};

const REQUIRED = ["captured_at", "api_version", "source", "authorization_state", "apps"];

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

export function parseInventory(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot read inventory: ${error.message}`);
  }
  return validateInventory(data);
}

function mapping(inventory) {
  const result = new Map();
  for (const app of inventory.apps) {
    if (!app || typeof app !== "object" || typeof app.id !== "string" || !app.id) {
      throw new Error("each app must have a non-empty string id");
    }
    if (result.has(app.id)) {
      throw new Error(`duplicate app id: ${app.id}`);
    }
    for (const field of ["scopes", "webhooks"]) {
      if (!Array.isArray(app[field]) || !app[field].every((item) => typeof item === "string")) {
        throw new Error(`app ${app.id} must contain a string ${field} list`);
      }
      if (app[field].length !== new Set(app[field]).size) {
        throw new Error(`app ${app.id} contains duplicate ${field}`);
      }
    }
    result.set(app.id, app);
  }
  return result;
}

export function compare(before, after) {
  const oldMap = mapping(before);
  const newMap = mapping(after);
  const changes = [];
  const ids = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort();
  for (const appId of ids) {
    if (!oldMap.has(appId)) {
      changes.push({ app: appId, kind: "app_added" });
      continue;
    }
    if (!newMap.has(appId)) {
      changes.push({ app: appId, kind: "app_removed" });
      continue;
    }
    for (const field of ["scopes", "webhooks"]) {
      const added = [...new Set(newMap.get(appId)[field])].filter((item) => !oldMap.get(appId)[field].includes(item)).sort();
      const removed = [...new Set(oldMap.get(appId)[field])].filter((item) => !newMap.get(appId)[field].includes(item)).sort();
      if (added.length || removed.length) {
        changes.push({ app: appId, kind: `${field}_changed`, added, removed });
      }
    }
  }
  for (const field of ["authorization_state", "api_version"]) {
    if (before[field] !== after[field]) {
      changes.push({ kind: `${field}_changed`, before: before[field], after: after[field] });
    }
  }
  if (parseCapturedAt(after.captured_at) < parseCapturedAt(before.captured_at)) {
    changes.push({
      kind: "capture_order_invalid",
      before: before.captured_at,
      after: after.captured_at,
    });
  }
  const metadata = {
    before_source: before.source,
    after_source: after.source,
    before_captured_at: before.captured_at,
    after_captured_at: after.captured_at,
  };
  const inconclusive = changes.some((change) => change.kind === "capture_order_invalid");
  const status = inconclusive ? "inconclusive" : changes.length ? "changed" : "unchanged";
  return { status, metadata, changes, review_required: Boolean(changes.length) };
}

function listPhrase(items, empty = "none") {
  return items.length ? items.join(", ") : empty;
}

export function formatChange(change) {
  switch (change.kind) {
    case "app_added":
      return `App added: ${change.app}`;
    case "app_removed":
      return `App removed: ${change.app}`;
    case "scopes_changed":
      return `Scopes changed on ${change.app}: added ${listPhrase(change.added)}; removed ${listPhrase(change.removed)}`;
    case "webhooks_changed":
      return `Webhooks changed on ${change.app}: added ${listPhrase(change.added)}; removed ${listPhrase(change.removed)}`;
    case "authorization_state_changed":
      return `Authorization state changed: ${change.before} → ${change.after}`;
    case "api_version_changed":
      return `API version changed: ${change.before} → ${change.after}`;
    case "capture_order_invalid":
      return `Capture order is reversed: after (${change.after}) is earlier than before (${change.before})`;
    default:
      return change.kind;
  }
}

export function ticketSummary(report) {
  const lines = [
    "Shopify permission drift record",
    `Status: ${report.status}`,
    `Review required: ${report.review_required ? "yes" : "no"}`,
    `Before: ${report.metadata.before_source} at ${report.metadata.before_captured_at}`,
    `After: ${report.metadata.after_source} at ${report.metadata.after_captured_at}`,
    "",
    "Changes:",
  ];
  if (!report.changes.length) {
    lines.push("- none");
  } else {
    for (const change of report.changes) {
      lines.push(`- ${formatChange(change)}`);
    }
  }
  lines.push("");
  lines.push("Evidence only. The merchant decides what each change means. This is not a security certification or Shopify policy interpretation.");
  return lines.join("\n");
}

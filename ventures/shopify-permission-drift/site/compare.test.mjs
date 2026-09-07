import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXAMPLE_AFTER,
  EXAMPLE_BEFORE,
  compare,
  formatChange,
  parseInventory,
  ticketSummary,
  validateInventory,
} from "./compare.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const beforePath = join(root, "examples/before.json");
const afterPath = join(root, "examples/after.json");
const python = join(root, "src/permission_drift.py");

function pythonReport(before, after) {
  const stdout = execFileSync("python3", [python, before, after, "--format", "json"], {
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("example fixtures match the CLI examples on disk", () => {
  assert.deepEqual(EXAMPLE_BEFORE, JSON.parse(readFileSync(beforePath, "utf8")));
  assert.deepEqual(EXAMPLE_AFTER, JSON.parse(readFileSync(afterPath, "utf8")));
});

test("detects scope and webhook changes on the shipped fixtures", () => {
  const report = compare(EXAMPLE_BEFORE, EXAMPLE_AFTER);
  assert.equal(report.status, "changed");
  assert.deepEqual(report.changes.map((change) => change.kind), ["scopes_changed", "webhooks_changed"]);
  assert.equal(report.review_required, true);
  assert.deepEqual(report.changes[0].added, ["read_reports"]);
  assert.deepEqual(report.changes[1].added, ["shop/update"]);
});

test("identical inventories are unchanged", () => {
  const report = compare(EXAMPLE_BEFORE, EXAMPLE_BEFORE);
  assert.equal(report.status, "unchanged");
  assert.equal(report.review_required, false);
  assert.deepEqual(report.changes, []);
});

test("marks reversed capture order inconclusive", () => {
  const report = compare(EXAMPLE_AFTER, EXAMPLE_BEFORE);
  assert.equal(report.status, "inconclusive");
  assert.equal(report.review_required, true);
  assert.equal(report.changes.at(-1).kind, "capture_order_invalid");
});

test("browser compare matches the Python CLI on the shipped fixtures", () => {
  const fromJs = compare(EXAMPLE_BEFORE, EXAMPLE_AFTER);
  const fromPy = pythonReport(beforePath, afterPath);
  assert.deepEqual(fromJs, fromPy);
});

test("browser compare matches the Python CLI on reversed captures", () => {
  assert.deepEqual(compare(EXAMPLE_AFTER, EXAMPLE_BEFORE), pythonReport(afterPath, beforePath));
});

test("rejects missing fields, bad timestamps, and duplicate scopes", () => {
  assert.throws(() => parseInventory("{"), /cannot read inventory/);
  assert.throws(() => validateInventory({ captured_at: "nope" }), /must include/);
  assert.throws(
    () => validateInventory({ ...EXAMPLE_BEFORE, captured_at: "not-a-timestamp" }),
    /ISO 8601/,
  );
  assert.throws(
    () =>
      compare(
        {
          ...EXAMPLE_BEFORE,
          apps: [{ ...EXAMPLE_BEFORE.apps[0], scopes: ["read_analytics", "read_analytics"] }],
        },
        EXAMPLE_AFTER,
      ),
    /duplicate scopes/,
  );
});

test("reports added and removed apps and store-level fields", () => {
  const after = {
    ...EXAMPLE_AFTER,
    authorization_state: "revoked",
    api_version: "2026-10",
    apps: [
      { id: "app-new", scopes: ["read_orders"], webhooks: [] },
    ],
  };
  const report = compare(EXAMPLE_BEFORE, after);
  const kinds = report.changes.map((change) => change.kind);
  // App ids are walked in sorted order: app-analytics removed, app-new added,
  // app-shipping removed, then store-level fields.
  assert.deepEqual(kinds, [
    "app_removed",
    "app_added",
    "app_removed",
    "authorization_state_changed",
    "api_version_changed",
  ]);
  assert.equal(report.changes[1].app, "app-new");
});

test("ticket summary is review-ready and does not invent a verdict", () => {
  const text = ticketSummary(compare(EXAMPLE_BEFORE, EXAMPLE_AFTER));
  assert.match(text, /Status: changed/);
  assert.match(text, /added read_reports/);
  assert.match(text, /added shop\/update/);
  assert.match(text, /not a security certification/);
  assert.equal(formatChange({ app: "x", kind: "app_added" }), "App added: x");
});

test("absent webhook coverage is not reported as webhooks removed", () => {
  // Capture writes webhooks: [] + webhook_coverage: "absent" when the GraphQL
  // dump omitted webhookSubscriptions. Diffing that against a complete before
  // inventory used to invent "removed app/uninstalled" — the product's core
  // false-positive on its own evidence axis.
  const afterAbsent = {
    ...EXAMPLE_BEFORE,
    captured_at: "2026-08-24T12:00:00Z",
    limitations: ["webhooks_not_in_export"],
    apps: EXAMPLE_BEFORE.apps.map((app) => ({
      ...app,
      webhooks: [],
      webhook_coverage: "absent",
    })),
  };
  const report = compare(EXAMPLE_BEFORE, afterAbsent);
  assert.equal(report.status, "inconclusive");
  assert.equal(report.review_required, true);
  assert.deepEqual(
    report.changes.map((change) => change.kind),
    ["webhooks_not_compared", "webhooks_not_compared"],
  );
  assert.ok(!report.changes.some((change) => change.kind === "webhooks_changed"));
  assert.match(
    formatChange(report.changes[0]),
    /Webhooks not compared on app-analytics.*Do not treat webhook diffs as evidence/,
  );
});

test("scope drift still surfaces when webhooks cannot be compared", () => {
  const afterAbsent = {
    ...EXAMPLE_AFTER,
    apps: EXAMPLE_AFTER.apps.map((app) =>
      app.id === "app-analytics"
        ? { ...app, webhooks: [], webhook_coverage: "absent" }
        : app,
    ),
  };
  const report = compare(EXAMPLE_BEFORE, afterAbsent);
  assert.equal(report.status, "changed");
  const kinds = report.changes.map((change) => change.kind);
  assert.ok(kinds.includes("scopes_changed"));
  assert.ok(kinds.includes("webhooks_not_compared"));
  assert.ok(!kinds.includes("webhooks_changed"));
});

test("browser compare matches the Python CLI when webhook coverage is absent", () => {
  const afterAbsent = {
    ...EXAMPLE_BEFORE,
    captured_at: "2026-08-24T12:00:00Z",
    apps: EXAMPLE_BEFORE.apps.map((app) => ({
      ...app,
      webhooks: [],
      webhook_coverage: "absent",
    })),
  };
  const fromJs = compare(EXAMPLE_BEFORE, afterAbsent);
  // Write under the venture tree — system tmpdir is not writable in every
  // agent sandbox (errno -122), and the existing fixture parity tests already
  // shell out to the Python CLI against paths on disk.
  const dir = mkdtempSync(join(root, ".parity-"));
  try {
    const beforeFile = join(dir, "before.json");
    const afterFile = join(dir, "after.json");
    writeFileSync(beforeFile, JSON.stringify(EXAMPLE_BEFORE));
    writeFileSync(afterFile, JSON.stringify(afterAbsent));
    assert.deepEqual(fromJs, pythonReport(beforeFile, afterFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

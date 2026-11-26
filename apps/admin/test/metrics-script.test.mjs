// scripts/metrics.mjs: reads only <adminUrl>/metrics with the read-only ADMIN_METRICS_TOKEN and
// prints aggregates (no names or emails). Plain .mjs so it can use Node's http/child_process
// without type definitions (the app has no dependencies).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { describe, it } from "node:test";

const metrics = {
  contractVersion: 1,
  kind: "app",
  product: "a",
  productName: "A",
  generatedAt: "2026-11-26T00:00:00.000Z",
  windowDays: 7,
  signups: { total: 10, verified: 8, unverified: 2, lastWindow: 4, byDay: [], byWeek: [] },
  orgs: { total: 7, active: 5, activeDefinition: "x" },
  trials: { current: 1, startedInWindow: 2, converted: 1, expired: 1, note: "" },
  subscriptions: { byPlan: [], paid: 3 },
  mrr: {
    byCurrency: [{ currency: "USD", amountMinor: 29700 }],
    subscriptionsCounted: 3,
    subscriptionsUnpriced: 0,
    source: "paddle_webhook",
  },
  cancellations: { inWindow: 1, scheduled: 0 },
  failedPayments: { inWindow: null, pastDueNow: 0 },
  llmSpend: null,
};

function run(args, env) {
  const script = new URL("../scripts/metrics.mjs", import.meta.url).pathname;
  return new Promise((resolve) =>
    execFile(
      process.execPath,
      [script, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }),
    ),
  );
}

describe("agent snapshot script", () => {
  it("calls only /metrics with the metrics token; an unreachable product is listed, not zeroed", async () => {
    const seen = [];
    const server = createServer((req, res) => {
      seen.push(`${req.url} ${req.headers.authorization}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(metrics));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    const products = JSON.stringify([
      { key: "a", name: "A", kind: "app", adminUrl: `http://127.0.0.1:${port}/a/api/admin` },
      { key: "b", name: "B", kind: "app", adminUrl: "http://127.0.0.1:1/b/api/admin" },
    ]);
    const env = {
      ADMIN_PRODUCTS: products,
      ADMIN_METRICS_TOKEN: "agent-metrics-token-0123456789abcdef",
      ADMIN_SERVICE_TOKEN: "",
    };
    const r = await run(["--days", "7"], env);
    const strict = await run(["--days", "7", "--strict"], env);
    server.close();
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(seen.slice(0, 1), [
      "/a/api/admin/metrics?days=7 Bearer agent-metrics-token-0123456789abcdef",
    ]);
    assert.ok(seen.every((s) => s.startsWith("/a/api/admin/metrics")));
    const snap = JSON.parse(r.stdout);
    assert.equal(snap.totals.orgs, 7);
    assert.deepEqual(snap.unreadable, [{ name: "B", error: "unreachable" }]);
    assert.doesNotMatch(r.stdout, /@/);
    assert.equal(strict.code, 2);
  });

  it("refuses to run without a product list", async () => {
    const r = await run([], { ADMIN_PRODUCTS: "" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /ADMIN_PRODUCTS/);
  });
});

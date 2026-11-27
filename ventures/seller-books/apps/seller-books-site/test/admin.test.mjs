// Owner-console API (/seller-books/api/admin/*): service-token gate, counts (unsubscribed kept as
// suppression rows), by-day and by-source series, no token/IP-hash leaks, an audit row per read.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { handleRequest } from "../src/worker.mjs";
import { createFakeD1 } from "./fake-d1.mjs";

const TOKEN = "test-admin-service-token-0123456789abcdef";
const DAY = 86_400_000;
const auth = { Authorization: `Bearer ${TOKEN}` };
let env;

async function seed(id, email, status, source, at) {
  await env.DB.prepare(
    `INSERT INTO early_access_signups (id, email, status, consent_source, consent_text_version,
       consent_ip_hash, confirm_token_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'v1', 'iphash-secret', ?, ?, ?)`,
  )
    .bind(id, email, status, source, `chash-${id}`, at, at)
    .run();
}

beforeEach(async () => {
  env = {
    DB: createFakeD1(),
    APP_ENV: "test",
    ADMIN_SERVICE_TOKEN: TOKEN,
    ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
  };
  const now = Date.now();
  await seed("s1", "a@x.test", "confirmed", "/seller-books/early-access", now);
  await seed("s2", "b@x.test", "pending", "/seller-books/early-access", now);
  await seed("s3", "c@x.test", "confirmed", "/seller-books/pricing", now - 2 * DAY);
  await seed("s4", "d@x.test", "unsubscribed", "/seller-books/pricing", now - 60 * DAY);
});

const get = (path, headers = {}) =>
  handleRequest(new Request(`https://marisstella.app/seller-books${path}`, { headers }), env, {
    waitUntil() {},
  });
const audits = async () => (await env.DB.prepare("SELECT * FROM admin_audit_log").all()).results;

test("admin: no token 401, wrong token 403, unset token closed; nothing audited", async () => {
  assert.equal((await get("/api/admin/metrics")).status, 401);
  assert.equal((await get("/api/admin/metrics", { Authorization: "Bearer wrong" })).status, 403);
  env.ADMIN_SERVICE_TOKEN = undefined;
  assert.equal((await get("/api/admin/accounts", auth)).status, 403);
  assert.equal((await audits()).length, 0);
});

test("admin: the read-only metrics token reads metrics, never the sign-up list", async () => {
  const metrics = { Authorization: `Bearer ${"test-admin-metrics-token-0123456789abcdef"}` };
  assert.equal((await get("/api/admin/metrics", metrics)).status, 200);
  assert.equal((await get("/api/admin/accounts", metrics)).status, 403);
  const rows = await audits();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, "metrics-agent");
  assert.equal(rows[0].action, "admin.metrics_read");
});

test("admin metrics: total, confirmed, unsubscribed, by day, by source; audited; no-store", async () => {
  const res = await get("/api/admin/metrics?days=7", auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const m = await res.json();
  assert.equal(m.total, 4);
  assert.equal(m.confirmed, 2);
  assert.equal(m.unsubscribed, 1);
  assert.equal(m.lastWindow, 3);
  assert.equal(m.byDay.length, 7);
  assert.equal(m.byDay.at(-1).total, 2);
  assert.equal(m.byDay.at(-1).verified, 1);
  assert.equal(m.byDay.at(-3).total, 1);
  assert.deepEqual(m.bySource, [
    { source: "/seller-books/early-access", count: 2 },
    { source: "/seller-books/pricing", count: 2 },
  ]);
  const rows = await audits();
  assert.equal(rows[0].action, "admin.metrics_read");
  assert.equal(rows[0].actor_id, "admin-console");
});

test("admin accounts: newest first, contract fields only", async () => {
  const page = await (await get("/api/admin/accounts?limit=2", auth)).json();
  assert.equal(page.items.length, 2);
  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    "confirmed",
    "createdAt",
    "email",
    "id",
    "name",
    "source",
  ]);
  assert.doesNotMatch(JSON.stringify(page), /hash|token|consent/i);
  assert.equal((await get("/api/admin/accounts?limit=500", auth)).status, 400);
  assert.equal((await audits())[0].action, "admin.accounts_read");
});

// Owner-console API ({base}/api/admin/*): service-token gate, counts, by-day and by-source series,
// no token/IP-hash leaks, and an audit row per read.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { handler as worker } from "../src/early-access.mjs";
import { fakeD1 } from "./fake-d1.mjs";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const TOKEN = "test-admin-service-token-0123456789abcdef";
const DAY = 86_400_000;

function makeEnv(overrides = {}) {
  const env = {
    DB: fakeD1(MIGRATIONS),
    BASE_PATH: "/cmmc",
    ADMIN_SERVICE_TOKEN: TOKEN,
    ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
    ...overrides,
  };
  const now = Date.now();
  const seed = (email, status, source, at) =>
    env.DB.raw
      .prepare(
        `INSERT INTO early_access_signups (id, email, status, source, consent_text_version, ip_hash,
           confirm_token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'v1', 'iphash-secret', ?, ?, ?)`,
      )
      .run(`eas_${email[0]}`, email, status, source, `chash-${email}`, at, at);
  seed("a@x.test", "confirmed", "/early-access", now);
  seed("b@x.test", "pending", "/early-access", now);
  seed("c@x.test", "confirmed", "/pricing", now - 2 * DAY);
  seed("d@x.test", "confirmed", "/pricing", now - 60 * DAY);
  return env;
}

const get = (env, path, headers = {}) =>
  worker.fetch(new Request(`https://marisstella.app/cmmc${path}`, { headers }), env);
const auth = { Authorization: `Bearer ${TOKEN}` };
const audits = (env) => env.DB.raw.prepare("SELECT * FROM admin_audit_log").all();

test("admin: no token 401, wrong token 403, unset token closed; nothing audited", async () => {
  const env = makeEnv();
  assert.equal((await get(env, "/api/admin/metrics")).status, 401);
  assert.equal(
    (await get(env, "/api/admin/metrics", { Authorization: "Bearer wrong" })).status,
    403,
  );
  const unset = makeEnv({ ADMIN_SERVICE_TOKEN: undefined });
  assert.equal((await get(unset, "/api/admin/accounts", auth)).status, 403);
  const short = makeEnv({ ADMIN_SERVICE_TOKEN: "short" });
  assert.equal(
    (await get(short, "/api/admin/accounts", { Authorization: "Bearer short" })).status,
    403,
  );
  assert.equal(audits(env).length, 0);
});

test("admin: the read-only metrics token reads metrics, never the sign-up list", async () => {
  const env = makeEnv();
  const metrics = { Authorization: `Bearer ${"test-admin-metrics-token-0123456789abcdef"}` };
  assert.equal((await get(env, "/api/admin/metrics", metrics)).status, 200);
  assert.equal((await get(env, "/api/admin/accounts", metrics)).status, 403);
  const rows = audits(env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, "metrics-agent");
  assert.equal(rows[0].action, "admin.metrics_read");
});

test("admin metrics: total, confirmed, by day, by source; audited; no-store", async () => {
  const env = makeEnv();
  const res = await get(env, "/api/admin/metrics?days=7", auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const m = await res.json();
  assert.equal(m.kind, "early_access");
  assert.equal(m.total, 4);
  assert.equal(m.confirmed, 3);
  assert.equal(m.unsubscribed, null);
  assert.equal(m.lastWindow, 3);
  assert.equal(m.byDay.length, 7);
  assert.deepEqual(
    { total: m.byDay.at(-1).total, verified: m.byDay.at(-1).verified },
    { total: 2, verified: 1 },
  );
  assert.equal(m.byDay.at(-3).total, 1);
  assert.deepEqual(m.bySource, [
    { source: "/early-access", count: 2 },
    { source: "/pricing", count: 2 },
  ]);
  const rows = audits(env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "admin.metrics_read");
  assert.equal(rows[0].actor_id, "admin-console");
  assert.equal((await get(env, "/api/admin/metrics?days=0", auth)).status, 400);
});

test("admin accounts: newest first, contract fields only, works without TOKEN_SECRET", async () => {
  const env = makeEnv();
  const page = await (await get(env, "/api/admin/accounts?limit=2", auth)).json();
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
  assert.equal((await get(env, "/api/admin/accounts?limit=201", auth)).status, 400);
  assert.equal(audits(env)[0].action, "admin.accounts_read");
});

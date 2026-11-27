// Owner-console API (/api/admin/*): service-token gate, counts and by-day series, no token leaks,
// and an audit row per read. The form records no source page, so bySource is [] and source null.
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../worker.mjs";
import { fakeD1 } from "./d1.mjs";

const TOKEN = "test-admin-service-token-0123456789abcdef";
const DAY = 86_400_000;
const auth = { Authorization: `Bearer ${TOKEN}` };

function makeEnv(overrides = {}) {
  const env = {
    DB: fakeD1(),
    ADMIN_SERVICE_TOKEN: TOKEN,
    ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
    ...overrides,
  };
  const now = Date.now();
  const seed = (id, email, status, at) =>
    env.DB.raw
      .prepare(
        `INSERT INTO early_access (id, email, lang, role, consent_version, consent_at, status, token_hash, created_at)
         VALUES (?, ?, 'de', 'accountant', 'v1', ?, ?, ?, ?)`,
      )
      .run(id, email, at, status, `thash-${id}`, at);
  seed("e1", "a@x.test", "confirmed", now);
  seed("e2", "b@x.test", "pending", now);
  seed("e3", "c@x.test", "confirmed", now - 2 * DAY);
  seed("e4", "d@x.test", "confirmed", now - 60 * DAY);
  return env;
}
const get = (env, path, headers = {}) =>
  worker.fetch(new Request(`https://einvoice.test${path}`, { headers }), env, { waitUntil() {} });
const audits = (env) => env.DB.raw.prepare("SELECT * FROM admin_audit_log").all();

test("admin: no token 401, wrong token 403, unset token closed, works without SIGNING_SECRET", async () => {
  const env = makeEnv();
  assert.equal((await get(env, "/api/admin/metrics")).status, 401);
  assert.equal(
    (await get(env, "/api/admin/metrics", { Authorization: "Bearer wrong" })).status,
    403,
  );
  assert.equal(
    (await get(makeEnv({ ADMIN_SERVICE_TOKEN: undefined }), "/api/admin/metrics", auth)).status,
    403,
  );
  assert.equal(audits(env).length, 0);
  assert.equal((await get(env, "/api/admin/metrics", auth)).status, 200);
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

test("admin metrics: total, confirmed, by day; bySource empty; audited; no-store", async () => {
  const env = makeEnv();
  const res = await get(env, "/api/admin/metrics?days=7", auth);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const m = await res.json();
  assert.equal(m.total, 4);
  assert.equal(m.confirmed, 3);
  assert.equal(m.unsubscribed, null);
  assert.equal(m.lastWindow, 3);
  assert.equal(m.byDay.length, 7);
  assert.equal(m.byDay.at(-1).total, 2);
  assert.equal(m.byDay.at(-1).verified, 1);
  assert.equal(m.byDay.at(-3).total, 1);
  assert.deepEqual(m.bySource, []);
  assert.equal(audits(env)[0].action, "admin.metrics_read");
  assert.equal(audits(env)[0].actor_id, "admin-console");
});

test("admin accounts: newest first, contract fields only", async () => {
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
  assert.equal(page.items[0].source, null);
  assert.doesNotMatch(JSON.stringify(page), /hash|token|consent|accountant/i);
  assert.equal((await get(env, "/api/admin/accounts?limit=0", auth)).status, 400);
  assert.equal(audits(env)[0].action, "admin.accounts_read");
});

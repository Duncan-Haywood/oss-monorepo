// End to end against a real Postgres (16, as on RDS). Needs PG_SUPERUSER_URL, e.g.
//   PG_SUPERUSER_URL=postgres://postgres:localtest@localhost:5432/postgres node --test test/e2e.test.mjs
// or `docker run -e POSTGRES_PASSWORD=localtest -p 5432:5432 postgres:16`. Skipped when unset.
//
// Mimics RDS: a non-superuser master (CREATEDB CREATEROLE) and an `rds_iam` role. IAM tokens are
// replaced by local passwords set by the superuser, so the grants db-admin writes are what is tested.
//
// Flow: Paddle-signed fixture -> webhook handler (payments) -> queue -> consumer (entitlement_writer)
//       -> product DB -> the hello product's fetch() through the Lambda adapter (app_<product>).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { signPaddle } from "../src/paddle.mjs";
import { makeWebhookHandler } from "../src/webhook.mjs";
import { makeConsumer } from "../src/consumer.mjs";
import { ensureProducts } from "../src/db-admin.mjs";
import { lambdaHandler } from "../src/adapter.mjs";
import { makeEnv } from "../src/env.mjs";
import { getPool, closePools } from "../src/pg.mjs";
import { migrate } from "../src/migrate.mjs";
import hello from "../../examples/hello/app.mjs";

const SU = process.env.PG_SUPERUSER_URL;
const PRODUCT = "hello_e2e";
const SECRET = "pdl_ntfset_e2e_not_a_real_secret";
const USER = "11111111-2222-3333-4444-555555555555";
const fixture = readFileSync(new URL("./fixtures/subscription.created.json", import.meta.url), "utf8");
const url = (user, pw, db) => { const u = new URL(SU); u.username = user; u.password = pw; u.pathname = `/${db}`; return u.toString(); };

async function su(sql, db = "postgres") { const c = new pg.Client({ connectionString: url(new URL(SU).username, new URL(SU).password, db) }); await c.connect(); try { return await c.query(sql); } finally { await c.end(); } }

before(async () => {
  if (!SU) return;
  await su(`DROP DATABASE IF EXISTS ${PRODUCT}`);
  for (const r of [`app_${PRODUCT}`, "entitlement_writer", "rdsmaster_e2e"]) await su(`DROP ROLE IF EXISTS ${r}`);
  await su(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_iam') THEN CREATE ROLE rds_iam NOLOGIN; END IF; END $$`);
  await su(`CREATE ROLE rdsmaster_e2e LOGIN PASSWORD 'm' CREATEDB CREATEROLE`);
  await su(`GRANT rds_iam TO rdsmaster_e2e WITH ADMIN OPTION`);
});

after(async () => { await closePools(); });

const ev = (method, path, { claims, body, headers = {} } = {}) => ({
  rawPath: path, rawQueryString: "", headers: { host: "hello.example", ...headers },
  body, isBase64Encoded: false,
  requestContext: { http: { method }, ...(claims ? { authorizer: { jwt: { claims } } } : {}) },
});

test("e2e: paddle webhook -> entitlement -> product gate", { skip: !SU && "PG_SUPERUSER_URL not set" }, async () => {
  // 1. db-admin as the (non-superuser) master: roles, database, platform schema, grants.
  const connect = async (db) => { const c = new pg.Client({ connectionString: url("rdsmaster_e2e", "m", db) }); await c.connect(); return c; };
  assert.deepEqual(await ensureProducts({ connect, products: [PRODUCT] }), [PRODUCT]);
  assert.deepEqual(await ensureProducts({ connect, products: [PRODUCT] }), [PRODUCT], "idempotent");
  const iamMembers = await su(`SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid WHERE g.rolname = 'rds_iam' ORDER BY 1`);
  assert.ok(iamMembers.rows.some((r) => r.rolname === `app_${PRODUCT}`) && iamMembers.rows.some((r) => r.rolname === "entitlement_writer"));
  await su(`ALTER ROLE app_${PRODUCT} PASSWORD 'a'`); await su(`ALTER ROLE entitlement_writer PASSWORD 'w'`);   // stand-ins for IAM tokens

  // 2. The product applies its own migrations as its app user.
  const appEnv = { DATABASE_URL: url(`app_${PRODUCT}`, "a", PRODUCT), PRODUCT };
  const appPool = await getPool(appEnv, { database: PRODUCT });
  const c = await appPool.connect();
  try { assert.deepEqual(await migrate(c, new URL("../../examples/hello/migrations", import.meta.url).pathname), ["001_notes.sql"]); } finally { c.release(); }

  // 3. Least privilege: the app cannot grant itself a subscription.
  await assert.rejects(appPool.query(`INSERT INTO platform.entitlements (product, user_sub, status, subscription_id, source_occurred_at) VALUES ('x','y','active','s',now())`), /permission denied/);

  // 4. Before paying: signed in, but 402 on the paid route.
  const app = lambdaHandler(hello, (e) => makeEnv(e, { pool: appPool }, appEnv));
  const claims = { sub: USER, email: "buyer@example.com" };
  assert.equal((await app(ev("GET", "/api/me", { claims }))).statusCode, 200);
  assert.equal((await app(ev("POST", "/api/notes", { claims, body: '{"text":"hi"}' }))).statusCode, 402);
  assert.equal((await app(ev("GET", "/api/me"))).statusCode, 401, "no claims, no access");

  // 5. Paddle -> webhook (payments account) -> queue -> consumer (apps account).
  const queue = [];
  const webhook = makeWebhookHandler({ getSecret: async () => SECRET, sendMessage: async (m) => queue.push(JSON.stringify(m)), now: () => 1_795_000_000 });
  const writerEnv = { DATABASE_URL: url("entitlement_writer", "w", "postgres") };
  const consumer = makeConsumer({ products: [PRODUCT], getDb: (p) => getPool(writerEnv, { database: p }) });
  const hook = (body, sig) => webhook({ body, headers: { "paddle-signature": sig }, requestContext: { http: { method: "POST" } } });

  assert.equal((await hook(fixture, signPaddle("forged", fixture, 1_795_000_000))).statusCode, 401);
  assert.equal(queue.length, 0, "a forged event never reaches the queue");
  assert.equal((await hook(fixture, signPaddle(SECRET, fixture, 1_795_000_000))).statusCode, 200);
  assert.equal((await hook(fixture, signPaddle(SECRET, fixture, 1_795_000_000))).statusCode, 200, "Paddle redelivery");
  const r1 = await consumer({ Records: queue.splice(0).map((body, i) => ({ messageId: `m${i}`, body })) });
  assert.deepEqual(r1.batchItemFailures, []);
  assert.equal((await appPool.query(`SELECT count(*)::int AS n FROM platform.entitlements`)).rows[0].n, 1);

  // 6. Paid: the gate opens, the D1-shaped binding writes and reads.
  const me = JSON.parse((await app(ev("GET", "/api/me", { claims }))).body);
  assert.equal(me.plan.entitled, true); assert.equal(me.plan.plan, "pri_01hv8x2a0000000000000000p1");
  assert.equal((await app(ev("POST", "/api/notes", { claims, body: '{"text":"hi"}' }))).statusCode, 201);
  assert.deepEqual(JSON.parse((await app(ev("GET", "/api/notes", { claims }))).body).notes.map((n) => n.text), ["hi"]);

  // 7. Out-of-order delivery: a cancel at 11:00 applies; an older 'active' (10:30) arriving later does not.
  const mk = (id, status, at) => { const e = JSON.parse(fixture); e.event_id = id; e.event_type = "subscription.updated"; e.occurred_at = at; e.data.status = status; return JSON.stringify(e); };
  for (const b of [mk("evt_cancel", "canceled", "2026-11-24T11:00:00Z"), mk("evt_old", "active", "2026-11-24T10:30:00Z")]) {
    assert.equal((await hook(b, signPaddle(SECRET, b, 1_795_000_000))).statusCode, 200);
  }
  const r2 = await consumer({ Records: queue.splice(0).map((body, i) => ({ messageId: `n${i}`, body })) });
  assert.deepEqual(r2.batchItemFailures, []);
  assert.equal(JSON.parse((await app(ev("GET", "/api/me", { claims }))).body).plan.status, "canceled");
  assert.equal((await app(ev("POST", "/api/notes", { claims, body: '{"text":"again"}' }))).statusCode, 402);

  // 8. A message for an unknown product fails alone (to the DLQ), the rest of the batch applies.
  const other = JSON.parse(fixture); other.event_id = "evt_other"; other.data.custom_data.product = "nope";
  const r3 = await consumer({ Records: [{ messageId: "bad", body: JSON.stringify({ event_id: "evt_other", event_type: "subscription.created", occurred_at: other.occurred_at, payload: other, entitlement: { product: "nope" } }) }] });
  assert.deepEqual(r3.batchItemFailures, [{ itemIdentifier: "bad" }]);
  assert.equal((await su(`SELECT count(*)::int AS n FROM platform.paddle_events`, PRODUCT)).rows[0].n, 3, "3 distinct events, the redelivery stored once");
});

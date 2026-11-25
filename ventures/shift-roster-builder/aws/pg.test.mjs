// The hosted hub against a real Postgres 16, through the starter's own db-admin, migrations and Lambda adapter.
// Needs PG_SUPERUSER_URL (e.g. postgres://postgres:localtest@localhost:5432/postgres) and `npm ci` in
// platform/aws/stacks/saas-starter/runtime (for pg). Skipped otherwise, so the venture's plain `node --test` stays
// dependency-free.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUNTIME = new URL("../../../platform/aws/stacks/saas-starter/runtime/", import.meta.url);
const SU = process.env.PG_SUPERUSER_URL;
const ready = SU && existsSync(fileURLToPath(new URL("node_modules/pg", RUNTIME)));
const skip = !ready && "PG_SUPERUSER_URL unset or starter runtime not installed";
const PRODUCT = "roster_hub_e2e";

let pg, rt;
const url = (user, pw, db) => { const u = new URL(SU); u.username = user; u.password = pw; u.pathname = `/${db}`; return u.toString(); };
async function su(sql, db = "postgres") { const c = new pg.Client({ connectionString: url(new URL(SU).username, new URL(SU).password, db) }); await c.connect(); try { return await c.query(sql); } finally { await c.end(); } }

before(async () => {
  if (!ready) return;
  pg = (await import(new URL("node_modules/pg/esm/index.mjs", RUNTIME))).default;
  rt = {
    db: await import(new URL("src/db-admin.mjs", RUNTIME)),
    pg: await import(new URL("src/pg.mjs", RUNTIME)),
    migrate: await import(new URL("src/migrate.mjs", RUNTIME)),
    adapter: await import(new URL("src/adapter.mjs", RUNTIME)),
    env: await import(new URL("src/env.mjs", RUNTIME)),
  };
  await su(`DROP DATABASE IF EXISTS ${PRODUCT}`);
  await su(`DROP ROLE IF EXISTS app_${PRODUCT}`);
  await su(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_iam') THEN CREATE ROLE rds_iam NOLOGIN; END IF; END $$`);
  await su(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'entitlement_writer') THEN CREATE ROLE entitlement_writer NOLOGIN; END IF; END $$`);
  await su(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rdsmaster_hub') THEN CREATE ROLE rdsmaster_hub LOGIN PASSWORD 'm' CREATEDB CREATEROLE; END IF; END $$`);
  await su(`GRANT rds_iam TO rdsmaster_hub WITH ADMIN OPTION`);
  await su(`GRANT entitlement_writer TO rdsmaster_hub WITH ADMIN OPTION`);
});
after(async () => {
  if (!rt) return;
  await rt.pg.closePools();
  // Leave the server as found: the starter's own e2e drops and re-creates entitlement_writer, which a leftover
  // database granting it would block.
  await su(`DROP DATABASE IF EXISTS ${PRODUCT}`);
  await su(`DROP ROLE IF EXISTS app_${PRODUCT}`);
});

test("hosted hub on Postgres: migrations as the app role, many concurrent writes, none lost", { skip }, async () => {
  const connect = async (db) => { const c = new pg.Client({ connectionString: url("rdsmaster_hub", "m", db) }); await c.connect(); return c; };
  await rt.db.ensureProducts({ connect, products: [PRODUCT] });
  await su(`ALTER ROLE app_${PRODUCT} PASSWORD 'a'`);   // stand-in for the IAM token
  const appEnv = { DATABASE_URL: url(`app_${PRODUCT}`, "a", PRODUCT), PRODUCT, APP_VARS: JSON.stringify({ FREE_TEAMS: "1" }) };
  const pool = await rt.pg.getPool(appEnv, { database: PRODUCT });
  const c = await pool.connect();
  try { assert.deepEqual(await rt.migrate.migrate(c, fileURLToPath(new URL("./migrations", import.meta.url))), ["001_hub_teams.sql"]); } finally { c.release(); }

  const { default: app } = await import("./app.mjs");
  const lambda = rt.adapter.lambdaHandler(app, (e) => rt.env.makeEnv(e, { pool }, appEnv));
  const ev = (method, path, { claims, body, form } = {}) => {
    const [rawPath, rawQueryString = ""] = path.split("?");
    return {
      rawPath, rawQueryString, isBase64Encoded: false,
      headers: { host: "hub.example", ...(form ? { "content-type": "application/x-www-form-urlencoded" } : body ? { "content-type": "application/json" } : {}) },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
      requestContext: { http: { method }, ...(claims ? { authorizer: { jwt: { claims } } } : {}) },
    };
  };
  const made = await lambda(ev("POST", "/api/teams", { claims: { sub: "mgr" }, body: { name: "Cafe", settings: { TIMEZONE: "America/Denver" } } }));
  assert.equal(made.statusCode, 201);
  const out = JSON.parse(made.body);
  const t = new URL(out.team_url).searchParams.get("t");
  assert.equal((await lambda(ev("POST", "/api/teams", { claims: { sub: "mgr" }, body: {} }))).statusCode, 402, "second team needs a plan (no entitlement row)");

  // Twenty staff replies at once: the row lock serialises them, as the Durable Object did.
  const posts = Array.from({ length: 20 }, (_, i) => lambda(ev("POST", `/team/reply?t=${encodeURIComponent(t)}`, { form: { line: `P${i} | Mon-Fri 8-18` } })));
  for (const r of await Promise.all(posts)) assert.equal(r.statusCode, 200);
  const { rows } = await pool.query("SELECT jsonb_array_length(state->'replies') AS n, admin_hash, team_hash FROM hub_teams");
  assert.equal(rows[0].n, 20, "no reply lost to a lost update");
  assert.ok(!JSON.stringify(rows).includes(t), "the token is not stored");
  assert.equal((await lambda(ev("GET", `/team?t=${encodeURIComponent(t)}`))).statusCode, 200);
  // The app role cannot touch the platform's entitlement table (least privilege from db-admin).
  await assert.rejects(pool.query(`INSERT INTO platform.entitlements (product, user_sub, status, subscription_id, source_occurred_at) VALUES ('x','y','active','s',now())`), /permission denied/);
});

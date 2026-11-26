// Smoke test of the BUILT Lambda bundle (dist-aws/app-grants/index.mjs, scripts/aws/build-lambda.sh)
// against a real Postgres, with API Gateway v2 events, the way the starter's module invokes it:
// {__migrate}, HTTP requests (static pages, health, Better Auth sign-up, org creation, a
// cross-tenant read), and the per-minute {__scheduled} job tick. No AWS calls: FAKE_EXTERNALS.
//   STARTER_RUNTIME=<starter runtime dir> PG_SUPERUSER_URL=postgres://postgres@localhost:5432/postgres \
//     node scripts/aws/smoke-lambda.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SUPER = process.env.PG_SUPERUSER_URL;
if (!SUPER) throw new Error("set PG_SUPERUSER_URL");
const app = join(import.meta.dirname, "..", "..");
const db = `grants_smoke_${process.pid}`;
const HOST = "grants.example.test";

// The module's Lambda environment (modules/app-service main.tf), minus AWS-only values.
Object.assign(process.env, {
  PRODUCT: "grants",
  DATABASE_URL: SUPER,
  DB_NAME: db,
  BUCKET_NAME: "smoke-bucket-never-called",
  APP_VARS: JSON.stringify({
    APP_ENV: "production",
    APP_URL: `https://${HOST}/grants`,
    BASE_PATH: "/grants",
    FAKE_EXTERNALS: "true",
    AUTH_SECRET: "smoke-only-auth-secret-not-used-anywhere-else-0123456789",
    EMAIL_FROM: "Grant Autopilot <no-reply@example.test>",
    LLM_MODEL: "claude-haiku-5-5",
  }),
});

const { handler } = await import(pathToFileURL(join(app, "dist-aws/app-grants/index.mjs")).href);
const pgMod = await import(
  pathToFileURL(join(process.env.STARTER_RUNTIME, "node_modules/pg/lib/index.js")).href
);
const pg = pgMod.default ?? pgMod;
const admin = new pg.Client({ connectionString: SUPER });
await admin.connect();
await admin.query(`CREATE DATABASE ${db}`);

function event(method, path, { body, cookies, headers = {} } = {}) {
  const [rawPath, rawQueryString = ""] = path.split("?");
  return {
    version: "2.0",
    rawPath,
    rawQueryString,
    cookies,
    headers: {
      host: HOST,
      "x-forwarded-for": "203.0.113.9",
      "x-forwarded-proto": "https",
      ...(body ? { "content-type": "application/json", origin: `https://${HOST}` } : {}),
      ...headers,
    },
    requestContext: { http: { method, sourceIp: "203.0.113.9" }, domainName: HOST },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}
const call = async (...args) => {
  const r = await handler(event(...args));
  const text = r.isBase64Encoded ? Buffer.from(r.body, "base64").toString() : r.body;
  return { ...r, text, json: () => JSON.parse(text) };
};
const cookieOf = (r) =>
  (r.cookies ?? []).map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));

try {
  const migrated = await handler({ __migrate: true });
  assert.deepEqual(migrated.applied, [
    "0000_000_sqlite_compat.sql",
    "0000_001_aws_runtime.sql",
    "0000_init.sql",
    "0001_newsletter.sql",
  ]);
  assert.deepEqual((await handler({ __migrate: true })).applied, [], "migrations are applied once");

  const health = await call("GET", "/grants/api/health");
  assert.equal(health.statusCode, 200, health.text);

  const landing = await call("GET", "/grants/");
  assert.equal(landing.statusCode, 200);
  assert.match(landing.headers["content-security-policy"], /default-src 'self'/);
  assert.match(landing.text, /<html/i);
  assert.equal((await call("GET", "/grants/pricing")).statusCode, 200);
  const spa = await call("GET", "/grants/orgs/whatever/dashboard");
  assert.equal(spa.statusCode, 200);
  assert.match(spa.headers["content-type"], /text\/html/);

  // Production config requires a verified address: sign up, mark it verified (stand-in for the
  // emailed link), then sign in for a session cookie.
  const smokeDb = new pg.Client({
    connectionString: Object.assign(new URL(SUPER), { pathname: `/${db}` }).toString(),
  });
  await smokeDb.connect();
  async function signUp(email) {
    const password = "correct-horse-battery-staple";
    const r = await call("POST", "/grants/api/auth/sign-up/email", {
      body: { email, password, name: "Smoke" },
    });
    assert.equal(r.statusCode, 200, `sign-up: ${r.text}`);
    await smokeDb.query(`UPDATE "user" SET email_verified = 1 WHERE email = $1`, [email]);
    const s = await call("POST", "/grants/api/auth/sign-in/email", { body: { email, password } });
    assert.equal(s.statusCode, 200, `sign-in: ${s.text}`);
    const cookies = cookieOf(s);
    assert.ok(cookies.length > 0, "sign-in sets a session cookie");
    return cookies;
  }
  const ana = await signUp("ana@example.test");
  const created = await call("POST", "/grants/api/orgs", {
    cookies: ana,
    body: {
      name: "Smoke Org",
      legalName: "Smoke Org Inc",
      orgType: "nonprofit_501c3",
      city: "Gallup",
      state: "NM",
      acceptTerms: true,
      policyVersion: "2026-11-24",
    },
  });
  assert.ok(
    [200, 201].includes(created.statusCode),
    `create org: ${created.statusCode} ${created.text}`,
  );
  const { orgId } = created.json();
  const mine = await call("GET", `/grants/api/orgs/${orgId}`, { cookies: ana });
  assert.equal(mine.statusCode, 200, mine.text);
  assert.equal(mine.json().org.id, orgId);

  // Tenant isolation through the whole AWS stack: another user cannot see the org.
  const ben = await signUp("ben@example.test");
  const theirs = await call("GET", `/grants/api/orgs/${orgId}`, { cookies: ben });
  assert.equal(theirs.statusCode, 404, `cross-tenant read must 404, got ${theirs.statusCode}`);
  const facts = await call("GET", `/grants/api/orgs/${orgId}/facts`, { cookies: ben });
  assert.equal(facts.statusCode, 404);

  const tick = await handler({ __scheduled: "rate(1 minute)" });
  assert.deepEqual(tick, { ok: true });
  const half = await handler({ __scheduled: "cron(0/30 * * * ? *)" });
  assert.deepEqual(half, { ok: true });
  await smokeDb.end();
  console.log(
    "smoke ok: migrate, static, health, sign-up, create org, cross-tenant 404, schedules",
  );
} finally {
  // The bundle's idle pool clients see the FORCE disconnect below as an error; that is expected.
  process.on("uncaughtException", (e) => {
    if (!/terminating connection/.test(String(e?.message))) throw e;
  });
  // FORCE closes the bundle's own pool connections; then exit (its pool would keep Node alive).
  await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin.end();
}
process.exit(0);

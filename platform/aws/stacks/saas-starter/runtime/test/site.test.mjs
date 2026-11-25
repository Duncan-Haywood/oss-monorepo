// Static sites on the starter (src/site.mjs): file resolution, the sign-in gate, and the Lambda round trip.
// The Postgres-backed key source runs when PG_SUPERUSER_URL is set (as in e2e.test.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { makeSiteApp, resolveFile, signSession, verifySession, parseEmails, loginScriptHash, dbKeySource, COOKIE } from "../src/site.mjs";
import { lambdaHandler } from "../src/adapter.mjs";

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "site-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "_next/static/chunks"), { recursive: true });
  await writeFile(join(root, "index.html"), "<h1>home</h1>");
  await writeFile(join(root, "docs.html"), "<h1>docs page</h1>");
  await writeFile(join(root, "docs/index.html"), "<h1>docs index</h1>");
  await writeFile(join(root, "404.html"), "<h1>lost</h1>");
  await writeFile(join(root, "_next/static/chunks/app.js"), "console.log(1)");
  await writeFile(join(root, "_headers"), "/*\n  X-Robots-Tag: noindex");
  await writeFile(join(root, ".env"), "SECRET=1");
  await writeFile(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]));
  await writeFile(join(tmpdir(), "outside-secret.txt"), "secret");
});
after(async () => { await rm(root, { recursive: true, force: true }); });

const KEY = new Uint8Array(32).fill(7);
const keySource = async () => KEY;
const ALLOW = "owner@example.com, second@example.com";
const env = (vars = {}, user = null) => ({ VARS: vars, user, AUTH: { domain: "https://pool.auth.us-east-1.amazoncognito.com", webClientId: "cid" } });
const get = (app, path, e, headers = {}) => app.fetch(new Request("https://docs.example" + path, { headers }), e);

test("paths resolve like a static host and never leave the root", async () => {
  assert.equal(await resolveFile(root, "/"), join(root, "index.html"));
  assert.equal(await resolveFile(root, "/docs"), join(root, "docs.html"), "Next export: /docs -> docs.html first");
  assert.equal(await resolveFile(root, "/docs/"), join(root, "docs/index.html"));
  for (const bad of ["/../outside-secret.txt", "/..%2foutside-secret.txt", "/%2e%2e/outside-secret.txt", "/docs/../../outside-secret.txt", "/x%00", "/%E0%A4%A", "/..\\outside-secret.txt", "/_headers", "/.env", "/docs/../.env"]) {
    assert.equal(await resolveFile(root, bad), null, bad);
  }
});

test("public site: types, caching, 404 page, SPA fallback, noindex, HEAD, no writes", async () => {
  const app = makeSiteApp({ root, keySource });
  const home = await get(app, "/", env({ ROBOTS: "noindex" }));
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.equal(home.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(home.headers.get("cache-control"), "no-cache");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal((await get(app, "/_next/static/chunks/app.js", env())).headers.get("cache-control"), "public, max-age=31536000, immutable");
  const lost = await get(app, "/nope", env());
  assert.equal(lost.status, 404);
  assert.equal(await lost.text(), "<h1>lost</h1>");
  assert.equal((await get(app, "/", env({ ROBOTS: "noindex, nofollow, noarchive" }))).headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal((await get(app, "/", env())).headers.get("x-robots-tag"), null);
  const spa = await get(app, "/deep/route", env({ SPA: "index.html" }));
  assert.equal(spa.status, 200);
  assert.equal(await spa.text(), "<h1>home</h1>");
  const head = await app.fetch(new Request("https://docs.example/", { method: "HEAD" }), env());
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await app.fetch(new Request("https://docs.example/", { method: "POST", body: "x" }), env())).status, 405);
  assert.equal((await get(app, "/auth/login", env())).status, 404, "no sign-in page on a public site");
});

test("binary files survive the Lambda round trip (base64)", async () => {
  const h = lambdaHandler(makeSiteApp({ root, keySource }), async () => env());
  const r = await h({ rawPath: "/logo.png", rawQueryString: "", headers: { host: "docs.example" }, requestContext: { http: { method: "GET" } } });
  assert.equal(r.isBase64Encoded, true);
  assert.deepEqual([...Buffer.from(r.body, "base64")], [0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
  assert.equal(r.headers["content-type"], "image/png");
});

test("gated site: redirect to sign-in, session only for a verified listed address, then the files", async () => {
  let clock = 1_800_000_000_000;
  const app = makeSiteApp({ root, keySource, now: () => clock });
  const vars = { GATE_EMAILS: ALLOW };
  const r = await get(app, "/docs?x=1", env(vars));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/auth/login?next=%2Fdocs%3Fx%3D1");
  assert.equal((await get(app, "/logo.png", env(vars))).status, 302, "assets are gated too");

  const login = await get(app, "/auth/login", env(vars));
  assert.equal(login.status, 200);
  const html = await login.text();
  const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];
  assert.ok(login.headers.get("content-security-policy").includes(`'sha256-${createHash("sha256").update(script).digest("base64")}'`), "CSP allows exactly the login script");
  assert.equal(await loginScriptHash(), `'sha256-${createHash("sha256").update(script).digest("base64")}'`);
  assert.match(html, /data-cfg="\{&quot;domain&quot;:&quot;https:\/\/pool\.auth/);

  const session = (user) => app.fetch(new Request("https://docs.example/api/session", { method: "POST" }), env(vars, user));
  assert.equal((await session(null)).status, 403);
  assert.equal((await session({ email: "owner@example.com", email_verified: "false" })).status, 403, "unverified address");
  assert.equal((await session({ email: "stranger@example.com", email_verified: "true" })).status, 403, "not on the list");
  const ok = await session({ email: "Owner@Example.com", email_verified: "true" });
  assert.equal(ok.status, 200);
  const setCookie = ok.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-gate=[^;]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax$/);
  const cookie = setCookie.split(";")[0];

  const page = await get(app, "/docs", env(vars), { cookie: `other=1; ${cookie}` });
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "<h1>docs page</h1>");
  assert.equal(page.headers.get("cache-control"), "private, no-store");

  const [payload, mac] = cookie.split("=")[1].split(".");
  const forged = Buffer.from(JSON.stringify({ e: "stranger@example.com", x: 9e9 })).toString("base64url");
  assert.equal((await get(app, "/docs", env(vars), { cookie: `${COOKIE}=${forged}.${mac}` })).status, 302, "payload swap fails the MAC");
  assert.equal((await get(app, "/docs", env({ GATE_EMAILS: "second@example.com" }), { cookie })).status, 302, "removed from the list: out");
  clock += 12 * 3600 * 1000 + 1000;
  assert.equal((await get(app, "/docs", env(vars), { cookie })).status, 302, "expired after 12 hours");
  assert.ok(payload);
  const out = await get(app, "/auth/logout", env(vars));
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});

test("session tokens: signed, bound to the key and the list", async () => {
  const v = await signSession(KEY, "a@b.c", 1_000_000);
  assert.equal(await verifySession(KEY, v, ["a@b.c"], 1_000_000), "a@b.c");
  assert.equal(await verifySession(new Uint8Array(32), v, ["a@b.c"], 1_000_000), null, "another key");
  assert.equal(await verifySession(KEY, "garbage", ["a@b.c"]), null);
  assert.equal(await verifySession(KEY, "", ["a@b.c"]), null);
  assert.deepEqual(parseEmails(" A@x.org,,bad, b@y.io "), ["a@x.org", "b@y.io"]);
});

const SU = process.env.PG_SUPERUSER_URL;
test("the HMAC key lives in the product database, made once", { skip: !SU && "PG_SUPERUSER_URL not set" }, async () => {
  // Imported here so the rest of this file runs without `npm ci` (the unwired-checks runner has no node_modules).
  const { default: pg } = await import("pg");
  const { migrate } = await import("../src/migrate.mjs");
  const u = new URL(SU); u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS site_gate_test");
  await admin.query("CREATE DATABASE site_gate_test");
  await admin.end();
  u.pathname = "/site_gate_test";
  const pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
  try {
    const c = await pool.connect();
    try { assert.deepEqual(await migrate(c, new URL("../site-migrations", import.meta.url).pathname), ["001_gate_key.sql"]); } finally { c.release(); }
    const a = await dbKeySource(() => pool)({}), b = await dbKeySource(() => pool)({});
    assert.equal(a.length, 32);
    assert.deepEqual(a, b, "two containers read the same key");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM gate_key")).rows[0].n, 1);
  } finally { await pool.end(); }
});

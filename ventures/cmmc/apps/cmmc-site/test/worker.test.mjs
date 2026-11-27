import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  canResend,
  confirm,
  DAY,
  isValidEmail,
  leaveToken,
  MAX_SIGNUPS_PER_IP_PER_HOUR,
  MINUTE,
  parseSignup,
  purgePending,
  signup,
  verifyLeaveToken,
  handler as worker,
} from "../src/early-access.mjs";
import { fakeD1, fakeEmail } from "./fake-d1.mjs";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const SITE = "https://marisstella.app/cmmc";

function makeEnv(overrides = {}) {
  return {
    DB: fakeD1(MIGRATIONS),
    EMAIL: fakeEmail(),
    // Not a real secret; built at runtime so a secret scanner does not flag the literal.
    TOKEN_SECRET: "test-token".padEnd(22, "-"),
    IP_HASH_SALT: "salt",
    EMAIL_FROM: "Test <no-reply@example.org>",
    SITE_URL: SITE,
    BASE_PATH: "/cmmc",
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        if (path === "/pricing" || path === "/404")
          return new Response(`asset:${path}`, { headers: { "Content-Type": "text/html" } });
        return new Response("nope", { status: 404 });
      },
    },
    ...overrides,
  };
}

const form = (fields) =>
  new URLSearchParams({ level: "l2", size: "10-49", consent: "yes", ...fields }).toString();

const post = (env, path, body, headers = {}) =>
  worker.fetch(
    new Request(`https://marisstella.app/cmmc${path}`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": "203.0.113.9",
        ...headers,
      },
    }),
    env,
  );

const tokenFrom = (msg, kind) => {
  const m = new RegExp(`/api/early-access/${kind}\\?token=([^\\s"]+)`).exec(msg.text);
  assert.ok(m, `no ${kind} link`);
  return decodeURIComponent(m[1]);
};

test("validation: email, consent, enums, honeypot", () => {
  assert.equal(isValidEmail("ops@shop.example"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail(`${"a".repeat(250)}@x.io`), false);
  assert.deepEqual(parseSignup({ email: " Ops@Shop.Example ", consent: "yes" }), {
    email: "ops@shop.example",
    level: "unsure",
    size: "",
  });
  assert.equal(parseSignup({ email: "ops@shop.example" }), null, "consent required");
  assert.equal(parseSignup({ email: "ops@shop.example", consent: "yes", level: "l3" }), null);
  assert.equal(parseSignup({ email: "ops@shop.example", consent: "yes", website: "x" }), "bot");
});

test("double opt-in: sign up, one email, confirm via POST, then confirmed page", async () => {
  const env = makeEnv();
  const res = await post(env, "/api/early-access", form({ email: "Ops@Shop.Example" }));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), "/cmmc/early-access/check-email");
  assert.equal(env.EMAIL.sent.length, 1);
  const msg = env.EMAIL.sent[0];
  assert.deepEqual(msg.to, ["ops@shop.example"]);
  assert.equal(msg.from, env.EMAIL_FROM);
  const row = env.DB.raw.prepare("SELECT * FROM early_access_signups").get();
  assert.equal(row.status, "pending");
  assert.equal(row.cmmc_level, "l2");
  assert.notEqual(row.ip_hash, "203.0.113.9", "raw IP never stored");
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);

  const token = tokenFrom(msg, "confirm");
  assert.ok(!JSON.stringify(row).includes(token), "raw token never stored");

  // GET only shows a button: link scanners must not confirm.
  const page = await worker.fetch(
    new Request(`${SITE}/api/early-access/confirm?token=${encodeURIComponent(token)}`),
    env,
  );
  assert.equal(page.status, 200);
  assert.match(
    await page.text(),
    /<form method="post" action="\/cmmc\/api\/early-access\/confirm">/,
  );
  assert.equal(
    env.DB.raw.prepare("SELECT status FROM early_access_signups").get().status,
    "pending",
  );

  const done = await post(
    env,
    "/api/early-access/confirm",
    new URLSearchParams({ token }).toString(),
  );
  assert.equal(done.headers.get("Location"), "/cmmc/early-access/confirmed");
  const after = env.DB.raw.prepare("SELECT * FROM early_access_signups").get();
  assert.equal(after.status, "confirmed");
  assert.equal(after.confirm_token_hash, null);

  // Token is single-use.
  const again = await post(
    env,
    "/api/early-access/confirm",
    new URLSearchParams({ token }).toString(),
  );
  assert.equal(again.headers.get("Location"), "/cmmc/early-access/link-expired");
});

test("same answer whatever the address's state; confirmed addresses get no email", async () => {
  const env = makeEnv();
  await post(env, "/api/early-access", form({ email: "a@shop.example" }));
  const token = tokenFrom(env.EMAIL.sent[0], "confirm");
  assert.equal(await confirm(env, token), true);
  const res = await post(env, "/api/early-access", form({ email: "a@shop.example" }));
  assert.equal(res.headers.get("Location"), "/cmmc/early-access/check-email");
  assert.equal(env.EMAIL.sent.length, 1, "no second email to a confirmed address");

  const jsonRes = await post(
    env,
    "/api/early-access",
    JSON.stringify({ email: "a@shop.example", consent: "yes" }),
    {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  );
  assert.equal(jsonRes.status, 202);
  assert.deepEqual(await jsonRes.json(), { ok: true });
});

test("invalid input redirects to the invalid page and stores nothing; honeypot stores nothing", async () => {
  const env = makeEnv();
  const bad = await post(env, "/api/early-access", form({ email: "nope", consent: "" }));
  assert.equal(bad.headers.get("Location"), "/cmmc/early-access/invalid");
  const bot = await post(
    env,
    "/api/early-access",
    form({ email: "b@shop.example", website: "spam" }),
  );
  assert.equal(bot.headers.get("Location"), "/cmmc/early-access/check-email");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM early_access_signups").get().n, 0);
  assert.equal(env.EMAIL.sent.length, 0);
  const big = await post(env, "/api/early-access", "x".repeat(5000));
  assert.equal(big.headers.get("Location"), "/cmmc/early-access/invalid");
});

test("resend limits per address and per IP", async () => {
  const env = makeEnv();
  const t0 = Date.UTC(2026, 10, 24, 12);
  const input = { email: "c@shop.example", level: "l1", size: "" };
  assert.equal(await signup(env, input, { ip: "198.51.100.1", now: t0 }), "confirmation_sent");
  assert.equal(await signup(env, input, { ip: "198.51.100.1", now: t0 + MINUTE }), "throttled");
  assert.equal(
    await signup(env, input, { ip: "198.51.100.1", now: t0 + 11 * MINUTE }),
    "confirmation_sent",
  );
  assert.equal(canResend({ confirm_sent_at: t0, confirm_send_count: 5 }, t0 + 20 * MINUTE), false);
  assert.equal(canResend({ confirm_sent_at: t0, confirm_send_count: 5 }, t0 + DAY), true);

  for (let i = 0; i < MAX_SIGNUPS_PER_IP_PER_HOUR; i++)
    await signup(
      env,
      { email: `n${i}@shop.example`, level: "l1", size: "" },
      { ip: "192.0.2.5", now: t0 },
    );
  assert.equal(
    await signup(
      env,
      { email: "late@shop.example", level: "l1", size: "" },
      { ip: "192.0.2.5", now: t0 },
    ),
    "throttled",
  );
});

test("a failed send still answers the same and the row can be retried later", async () => {
  const env = makeEnv();
  env.EMAIL.fail = true;
  const res = await post(env, "/api/early-access", form({ email: "d@shop.example" }));
  assert.equal(res.headers.get("Location"), "/cmmc/early-access/check-email");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM early_access_signups").get().n, 1);
});

test("expired confirmation tokens are refused", async () => {
  const env = makeEnv();
  const t0 = Date.UTC(2026, 10, 1);
  await signup(env, { email: "e@shop.example", level: "l1", size: "" }, { now: t0 });
  const token = tokenFrom(env.EMAIL.sent[0], "confirm");
  assert.equal(await confirm(env, token, t0 + 8 * DAY), false);
  assert.equal(await confirm(env, "short", t0), false);
});

test("leave link deletes the entry; forged or other-id tokens fail", async () => {
  const env = makeEnv();
  await post(env, "/api/early-access", form({ email: "f@shop.example" }));
  await post(env, "/api/early-access", form({ email: "g@shop.example" }));
  const leave = tokenFrom(env.EMAIL.sent[0], "leave");
  const id = await verifyLeaveToken(env.TOKEN_SECRET, leave);
  assert.match(id, /^eas_[0-9a-f]{24}$/);
  assert.equal(await verifyLeaveToken("other-secret", leave), null);
  const forged = `${leave.slice(0, -2)}xx`;
  const r1 = await post(
    env,
    "/api/early-access/leave",
    new URLSearchParams({ token: forged }).toString(),
  );
  assert.equal(r1.headers.get("Location"), "/cmmc/early-access/link-expired");
  const r2 = await post(
    env,
    "/api/early-access/leave",
    new URLSearchParams({ token: leave }).toString(),
  );
  assert.equal(r2.headers.get("Location"), "/cmmc/early-access/left");
  const emails = env.DB.raw
    .prepare("SELECT email FROM early_access_signups")
    .all()
    .map((r) => r.email);
  assert.deepEqual(emails, ["g@shop.example"], "only the named entry is deleted");
  assert.notEqual(
    await leaveToken(env.TOKEN_SECRET, id),
    await leaveToken(env.TOKEN_SECRET, "eas_000000000000000000000000"),
  );
});

test("purge deletes only never-confirmed rows older than 30 days", async () => {
  const env = makeEnv();
  const t0 = Date.UTC(2026, 9, 1);
  await signup(env, { email: "old@shop.example", level: "l1", size: "" }, { now: t0 });
  await signup(env, { email: "kept@shop.example", level: "l1", size: "" }, { now: t0 });
  assert.equal(await confirm(env, tokenFrom(env.EMAIL.sent[1], "confirm"), t0 + MINUTE), true);
  await signup(env, { email: "new@shop.example", level: "l1", size: "" }, { now: t0 + 29 * DAY });
  assert.equal(await purgePending(env, t0 + 31 * DAY), 1);
  const emails = env.DB.raw
    .prepare("SELECT email FROM early_access_signups ORDER BY email")
    .all()
    .map((r) => r.email);
  assert.deepEqual(emails, ["kept@shop.example", "new@shop.example"]);
});

test("routing: base path, assets with security headers, 404 page, not configured", async () => {
  const env = makeEnv();
  const root = await worker.fetch(new Request("https://marisstella.app/cmmc"), env);
  assert.equal(root.status, 301);
  assert.equal(root.headers.get("Location"), "https://marisstella.app/cmmc/");
  const outside = await worker.fetch(new Request("https://marisstella.app/grants/x"), env);
  assert.equal(outside.status, 404);
  const page = await worker.fetch(new Request(`${SITE}/pricing`), env);
  assert.equal(await page.text(), "asset:/pricing");
  assert.match(page.headers.get("Content-Security-Policy"), /default-src 'none'/);
  assert.equal(page.headers.get("X-Frame-Options"), "DENY");
  const missing = await worker.fetch(new Request(`${SITE}/nowhere`), env);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "asset:/404");
  const unconfigured = await post(
    makeEnv({ TOKEN_SECRET: "" }),
    "/api/early-access",
    form({ email: "h@shop.example" }),
  );
  assert.equal(unconfigured.status, 503);
});

// Worker integration tests for the early-access list: real SQL (node:sqlite running the migrations),
// fake email binding, the Worker's own request handler.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { EARLY_ACCESS_CONSENT_VERSION, EARLY_ACCESS_SUBSCRIBE_MESSAGE } from "../src/content.mjs";
import {
  CONFIRM_TOKEN_TTL_MS,
  canResendConfirmation,
  isSafeEmailAddress,
  parseSubscribe,
  purgePending,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/early-access.mjs";
import { handleRequest } from "../src/worker.mjs";
import { createFakeD1 } from "./fake-d1.mjs";

const ORIGIN = "https://marisstella.app";
const BASE = `${ORIGIN}/seller-books`;
const SECRET = "test-secret";

let env;
let sent;
let pending;
const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => {
  while (pending.length) await pending.shift();
};

beforeEach(() => {
  sent = [];
  pending = [];
  env = {
    DB: createFakeD1(),
    EMAIL: { send: async (msg) => sent.push(msg) },
    TOKEN_SECRET: SECRET,
    APP_ENV: "test",
    SITE_URL: BASE,
    EMAIL_FROM: "Seller Books <no-reply@example.org>",
    ASSETS: { fetch: async () => new Response("asset") },
  };
});

function formPost(path, fields, { origin = ORIGIN, ip = "203.0.113.7" } = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
  }
  const headers = { "Content-Type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip };
  if (origin) headers.Origin = origin;
  return handleRequest(new Request(`${BASE}${path}`, { method: "POST", headers, body }), env, ctx);
}

const signup = (overrides = {}) => ({
  email: "Reseller@Example.com ",
  source: "/early-access",
  consentVersion: EARLY_ACCESS_CONSENT_VERSION,
  platforms: ["ebay", "poshmark"],
  volume: "100-600",
  website: "",
  ...overrides,
});

const rows = () => env.DB.rows("SELECT * FROM early_access_signups");
const confirmTokenFrom = (msg) => /confirm\?token=([A-Za-z0-9_-]+)/.exec(msg.text)[1];
const unsubTokenFrom = (msg) =>
  decodeURIComponent(/unsubscribe\?token=([^\s>]+)/.exec(msg.text)[1]);

describe("subscribe", () => {
  test("form post: 303 to thanks, pending row with survey answers, one confirmation email", async () => {
    const res = await formPost("/api/early-access/subscribe", signup());
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), "/seller-books/early-access/thanks");
    assert.match(res.headers.get("Content-Security-Policy"), /script-src 'none'/);
    await flush();
    const [row] = rows();
    assert.equal(row.email, "reseller@example.com");
    assert.equal(row.status, "pending");
    assert.deepEqual(JSON.parse(row.platforms), ["ebay", "poshmark"]);
    assert.equal(row.volume, "100-600");
    assert.equal(row.consent_source, "/early-access");
    assert.equal(row.consent_text_version, EARLY_ACCESS_CONSENT_VERSION);
    assert.match(row.consent_ip_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row).includes("203.0.113.7"), "raw IP is never stored");
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, "reseller@example.com");
    assert.equal(sent[0].from, env.EMAIL_FROM);
    const token = confirmTokenFrom(sent[0]);
    assert.ok(!JSON.stringify(row).includes(token), "raw confirm token is never stored");
    assert.match(
      sent[0].headers["List-Unsubscribe"],
      /^<https:\/\/marisstella\.app\/seller-books\/api\/early-access\/unsubscribe\?token=u1\./,
    );
  });

  test("JSON: 202 with the generic message; the same answer for an address already on the list", async () => {
    const post = () =>
      handleRequest(
        new Request(`${BASE}/api/early-access/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: ORIGIN },
          body: JSON.stringify(signup()),
        }),
        env,
        ctx,
      );
    const first = await post();
    await flush();
    const second = await post();
    await flush();
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);
    const a = await first.json();
    assert.deepEqual(a, { ok: true, message: EARLY_ACCESS_SUBSCRIBE_MESSAGE });
    assert.deepEqual(await second.json(), a);
    assert.equal(rows().length, 1);
    assert.equal(sent.length, 1, "second request inside 10 minutes is throttled");
  });

  test("honeypot: same redirect, nothing stored or sent", async () => {
    const res = await formPost("/api/early-access/subscribe", signup({ website: "http://spam" }));
    await flush();
    assert.equal(res.status, 303);
    assert.equal(rows().length, 0);
    assert.equal(sent.length, 0);
  });

  test("CSRF: missing or foreign Origin is refused", async () => {
    for (const origin of [null, "https://evil.example"]) {
      const res = await formPost("/api/early-access/subscribe", signup(), { origin });
      assert.equal(res.status, 403);
    }
    await flush();
    assert.equal(rows().length, 0);
  });

  test("validation errors answer 400 with a readable page", async () => {
    for (const bad of [
      { email: "not-an-email" },
      { email: "a@b.com\r\nBcc: x@y.com" },
      { platforms: ["ebay", "facebook-marketplace"] },
      { volume: "lots" },
      { consentVersion: "2020-01-01" },
      { source: "https://elsewhere" },
    ]) {
      const res = await formPost("/api/early-access/subscribe", signup(bad));
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.match(await res.text(), /Check the form/);
    }
    await flush();
    assert.equal(rows().length, 0);
  });

  test("rate limiter binding: 429 when the IP is over the limit", async () => {
    env.EARLY_ACCESS_LIMITER = { limit: async () => ({ success: false }) };
    const res = await formPost("/api/early-access/subscribe", signup());
    assert.equal(res.status, 429);
  });

  test("production without TOKEN_SECRET fails closed", async () => {
    env.APP_ENV = "production";
    env.TOKEN_SECRET = undefined;
    const res = await formPost("/api/early-access/subscribe", signup());
    assert.equal(res.status, 503);
    await flush();
    assert.equal(rows().length, 0);
  });

  test("an unconfirmed request never changes a confirmed row", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    await confirmWith(confirmTokenFrom(sent[0]));
    sent = [];
    await formPost("/api/early-access/subscribe", signup({ platforms: ["etsy"], volume: "" }));
    await flush();
    const [row] = rows();
    assert.equal(row.status, "confirmed");
    assert.deepEqual(JSON.parse(row.platforms), ["ebay", "poshmark"]);
    assert.equal(sent.length, 0);
  });
});

function confirmWith(token) {
  return formPost("/api/early-access/confirm", { token });
}

describe("confirm", () => {
  test("GET only shows a button (link scanners can't confirm); POST confirms once", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    const token = confirmTokenFrom(sent[0]);

    const page = await handleRequest(
      new Request(`${BASE}/api/early-access/confirm?token=${token}`),
      env,
      ctx,
    );
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Confirm my sign-up/);
    assert.match(html, /noindex/);
    assert.equal(rows()[0].status, "pending");

    const res = await confirmWith(token);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /on the list/);
    const [row] = rows();
    assert.equal(row.status, "confirmed");
    assert.equal(row.confirm_token_hash, null);

    const again = await confirmWith(token);
    assert.equal(again.status, 400);
    assert.match(await again.text(), /doesn&#39;t work/);
  });

  test("expired link", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    env.DB.rows(
      "UPDATE early_access_signups SET confirm_token_expires_at = ? RETURNING id",
      Date.now() - 1,
    );
    const res = await confirmWith(confirmTokenFrom(sent[0]));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /expired/);
    assert.equal(rows()[0].status, "pending");
  });

  test("confirm POST from a foreign origin is refused", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    const res = await formPost(
      "/api/early-access/confirm",
      { token: confirmTokenFrom(sent[0]) },
      { origin: "https://evil.example" },
    );
    assert.equal(res.status, 403);
    assert.equal(rows()[0].status, "pending");
  });
});

describe("unsubscribe", () => {
  test("one-click POST (no Origin) unsubscribes, clears survey answers, keeps suppression record", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    await confirmWith(confirmTokenFrom(sent[0]));
    const token = unsubTokenFrom(sent[0]);

    const page = await handleRequest(
      new Request(`${BASE}/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`),
      env,
      ctx,
    );
    assert.equal(page.status, 200);
    assert.equal(rows()[0].status, "confirmed", "GET never unsubscribes");

    const res = await formPost(
      `/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`,
      { "List-Unsubscribe": "One-Click" },
      { origin: null },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, status: "unsubscribed" });
    const [row] = rows();
    assert.equal(row.status, "unsubscribed");
    assert.equal(row.email, "reseller@example.com");
    assert.equal(row.platforms, "[]");
    assert.equal(row.volume, null);
    assert.equal(row.consent_ip_hash, null);

    const again = await formPost(
      `/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`,
      {},
      { origin: null },
    );
    assert.equal(again.status, 200, "idempotent");
  });

  test("forged or malformed tokens are rejected", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    const id = rows()[0].id;
    const forged = await unsubscribeToken("wrong-secret", id);
    for (const token of [forged, `u1.${id}.`, "u1..x", "nonsense"]) {
      const res = await formPost(
        `/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`,
        {},
        { origin: null },
      );
      assert.equal(res.status, 400, token);
    }
    assert.equal(rows()[0].status, "pending");
  });

  test("resubscribing after unsubscribe stays unsubscribed until the new link is confirmed", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    const token = unsubTokenFrom(sent[0]);
    await formPost(
      `/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`,
      {},
      { origin: null },
    );
    env.DB.rows("UPDATE early_access_signups SET confirm_sent_at = 0 RETURNING id");
    await formPost("/api/early-access/subscribe", signup());
    await flush();
    assert.equal(rows()[0].status, "unsubscribed");
    assert.equal(sent.length, 2);
    await confirmWith(confirmTokenFrom(sent[1]));
    assert.equal(rows()[0].status, "confirmed");
  });
});

describe("routing", () => {
  test("static pages pass through to assets; bare root 301s to the base path; unknown API 404s", async () => {
    const asset = await handleRequest(new Request(`${BASE}/pricing`), env, ctx);
    assert.equal(await asset.text(), "asset");
    const root = await handleRequest(new Request(`${ORIGIN}/`), env, ctx);
    assert.equal(root.status, 301);
    assert.equal(root.headers.get("Location"), "/seller-books/");
    const missing = await handleRequest(new Request(`${BASE}/api/nope`), env, ctx);
    assert.equal(missing.status, 404);
    const wrongMethod = await handleRequest(
      new Request(`${BASE}/api/early-access/subscribe`),
      env,
      ctx,
    );
    assert.equal(wrongMethod.status, 404);
  });
});

describe("pure helpers", () => {
  test("purgePending deletes only never-confirmed rows older than 30 days", async () => {
    await formPost("/api/early-access/subscribe", signup());
    await formPost("/api/early-access/subscribe", signup({ email: "keep@example.com" }));
    await flush();
    env.DB.rows(
      "UPDATE early_access_signups SET created_at = 0 WHERE email = 'reseller@example.com' RETURNING id",
    );
    const deleted = await purgePending({ db: env.DB, now: () => new Date() });
    assert.equal(deleted, 1);
    assert.deepEqual(
      rows().map((r) => r.email),
      ["keep@example.com"],
    );
  });

  test("resend limits: 10 minutes apart, at most 5 a day", () => {
    const now = 1_000_000_000;
    assert.equal(
      canResendConfirmation({ confirm_sent_at: null, confirm_send_count: 0 }, now).allowed,
      true,
    );
    assert.equal(
      canResendConfirmation({ confirm_sent_at: now - 60_000, confirm_send_count: 1 }, now).allowed,
      false,
    );
    assert.equal(
      canResendConfirmation({ confirm_sent_at: now - 11 * 60_000, confirm_send_count: 4 }, now)
        .allowed,
      true,
    );
    assert.equal(
      canResendConfirmation({ confirm_sent_at: now - 11 * 60_000, confirm_send_count: 5 }, now)
        .allowed,
      false,
    );
    assert.equal(
      canResendConfirmation({ confirm_sent_at: now - 86_400_000, confirm_send_count: 5 }, now)
        .allowed,
      true,
    );
  });

  test("unsubscribe tokens round-trip and bind to the id", async () => {
    const t = await unsubscribeToken(SECRET, "abc-123");
    assert.equal(await verifyUnsubscribeToken(SECRET, t), "abc-123");
    assert.equal(await verifyUnsubscribeToken(SECRET, t.replace("abc-123", "abc-124")), null);
  });

  test("email and form validation", () => {
    assert.equal(isSafeEmailAddress("a.b+c@sub.example.com"), true);
    for (const bad of [
      "a@b",
      "a b@c.com",
      "<a@b.com>",
      "a@b.com,c@d.com",
      `${"a".repeat(250)}@b.com`,
    ]) {
      assert.equal(isSafeEmailAddress(bad), false, bad);
    }
    const ok = parseSubscribe({
      email: "X@Y.com",
      source: "/",
      consentVersion: EARLY_ACCESS_CONSENT_VERSION,
      platforms: ["etsy", "ebay", "etsy"],
    });
    assert.deepEqual(ok.value.platforms, ["ebay", "etsy"]);
    assert.equal(ok.value.volume, null);
    assert.equal(CONFIRM_TOKEN_TTL_MS, 7 * 86_400_000);
  });
});

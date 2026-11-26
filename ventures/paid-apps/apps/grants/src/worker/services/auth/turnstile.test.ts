import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_TOKEN_HEADER,
  turnstileActionFor,
  turnstileGuard,
} from "../../middleware/turnstile";
import type { AppEnv } from "../../types";
import { TURNSTILE_SITEVERIFY_URL, turnstileEnabled, verifyTurnstile } from "./turnstile";

const SECRET = "0x4AAAAAAAtest-secret";
const env = { TURNSTILE_SECRET_KEY: SECRET };

function siteverify(body: Record<string, unknown>, status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
}

/** The form fields sent to siteverify by the n-th call of a fetch mock. */
function sentForm(mock: ReturnType<typeof siteverify>, call = 0): URLSearchParams {
  const init = mock.mock.calls[call]?.[1];
  return new URLSearchParams(String(init?.body));
}

describe("verifyTurnstile", () => {
  it("accepts a token siteverify confirms, sending secret, token and IP", async () => {
    const fetch = siteverify({ success: true, hostname: "grants.example.org", action: "login" });
    const res = await verifyTurnstile("tok-123", "203.0.113.7", env, { fetch });
    expect(res).toEqual({
      success: true,
      errorCodes: [],
      hostname: "grants.example.org",
      action: "login",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("POST");
    const form = sentForm(fetch);
    expect(form.get("secret")).toBe(SECRET);
    expect(form.get("response")).toBe("tok-123");
    expect(form.get("remoteip")).toBe("203.0.113.7");
  });

  it("omits an unknown IP", async () => {
    const fetch = siteverify({ success: true });
    await verifyTurnstile("tok", "unknown", env, { fetch });
    expect(sentForm(fetch).has("remoteip")).toBe(false);
  });

  it("rejects a token siteverify refuses, with its error codes", async () => {
    const fetch = siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    const res = await verifyTurnstile("used-token", null, env, { fetch });
    expect(res.success).toBe(false);
    expect(res.errorCodes).toEqual(["timeout-or-duplicate"]);
  });

  it("rejects missing or oversized tokens without calling siteverify", async () => {
    const fetch = siteverify({ success: true });
    expect((await verifyTurnstile("", null, env, { fetch })).errorCodes).toEqual([
      "missing-input-response",
    ]);
    expect((await verifyTurnstile(undefined, null, env, { fetch })).success).toBe(false);
    expect((await verifyTurnstile("x".repeat(2049), null, env, { fetch })).errorCodes).toEqual([
      "invalid-input-response",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails without a secret", async () => {
    const fetch = siteverify({ success: true });
    const res = await verifyTurnstile("tok", null, {}, { fetch });
    expect(res).toEqual({ success: false, errorCodes: ["missing-input-secret"] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify is unreachable or errors", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect((await verifyTurnstile("tok", null, env, { fetch: down })).errorCodes).toEqual([
      "siteverify-unavailable",
    ]);
    const http500 = siteverify({}, 500);
    expect((await verifyTurnstile("tok", null, env, { fetch: http500 })).success).toBe(false);
  });

  it("checks hostname and action when expected", async () => {
    const fetch = siteverify({ success: true, hostname: "evil.example", action: "login" });
    const host = await verifyTurnstile("tok", null, env, {
      fetch,
      expectedHostname: "grants.example.org",
    });
    expect(host.errorCodes).toEqual(["hostname-mismatch"]);
    const action = await verifyTurnstile("tok", null, env, { fetch, expectedAction: "signup" });
    expect(action.errorCodes).toEqual(["action-mismatch"]);
  });
});

describe("turnstileEnabled", () => {
  it("needs a secret and is off in APP_ENV=test", () => {
    expect(turnstileEnabled({ APP_ENV: "production", TURNSTILE_SECRET_KEY: SECRET })).toBe(true);
    expect(turnstileEnabled({ APP_ENV: "production", TURNSTILE_SECRET_KEY: " " })).toBe(false);
    expect(turnstileEnabled({ APP_ENV: "production" })).toBe(false);
    expect(turnstileEnabled({ APP_ENV: "test", TURNSTILE_SECRET_KEY: SECRET })).toBe(false);
  });
});

describe("turnstileActionFor", () => {
  it("covers the bot-prone Better Auth POST endpoints only", () => {
    expect(turnstileActionFor("POST", "/api/auth/sign-up/email")).toBe("signup");
    expect(turnstileActionFor("POST", "/api/auth/sign-in/email")).toBe("login");
    expect(turnstileActionFor("POST", "/api/auth/forget-password")).toBe("forgot-password");
    expect(turnstileActionFor("POST", "/api/auth/request-password-reset")).toBe("forgot-password");
    expect(turnstileActionFor("POST", "/api/auth/send-verification-email")).toBe(
      "resend-verification",
    );
    expect(turnstileActionFor("GET", "/api/auth/sign-in/email")).toBeNull();
    expect(turnstileActionFor("POST", "/api/auth/sign-out")).toBeNull();
    expect(turnstileActionFor("POST", "/api/auth/reset-password")).toBeNull();
    expect(turnstileActionFor("POST", "/api/auth/sign-in/social")).toBeNull();
  });
});

describe("turnstileGuard", () => {
  const app = new Hono<AppEnv>();
  app.use("/api/auth/*", turnstileGuard);
  // Stands in for Better Auth: it must still be able to read the raw body.
  app.post("/api/auth/*", async (c) => c.json({ ok: true, body: await c.req.raw.json() }));

  const prodEnv = {
    APP_ENV: "production",
    APP_URL: "https://grants.example.org",
    TURNSTILE_SECRET_KEY: SECRET,
  };
  const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
        ...headers,
      },
      body: JSON.stringify(body),
    }) satisfies RequestInit;

  let fetchMock: ReturnType<typeof siteverify>;
  beforeEach(() => {
    fetchMock = siteverify({ success: true, hostname: "grants.example.org", action: "login" });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is skipped when no secret is configured", async () => {
    const res = await app.request("/api/auth/sign-in/email", post({ email: "a@b.c" }), {
      APP_ENV: "production",
      APP_URL: "https://grants.example.org",
    });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is skipped in APP_ENV=test", async () => {
    const res = await app.request("/api/auth/sign-in/email", post({ email: "a@b.c" }), {
      ...prodEnv,
      APP_ENV: "test",
    });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a protected request without a token (Better Auth error shape)", async () => {
    const res = await app.request("/api/auth/sign-up/email", post({ email: "a@b.c" }), prodEnv);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string; error: { code: string } };
    expect(body.code).toBe("TURNSTILE_FAILED");
    expect(body.message).toMatch(/security check/i);
    expect(body.error.code).toBe("turnstile_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a valid header token and leaves the body readable for Better Auth", async () => {
    const res = await app.request(
      "/api/auth/sign-in/email",
      post({ email: "a@b.c", password: "pw" }, { [TURNSTILE_TOKEN_HEADER]: "tok-h" }),
      prodEnv,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, body: { email: "a@b.c", password: "pw" } });
    const form = sentForm(fetchMock);
    expect(form.get("response")).toBe("tok-h");
    expect(form.get("remoteip")).toBe("203.0.113.7");
  });

  it("accepts a token in the JSON body", async () => {
    const res = await app.request(
      "/api/auth/sign-in/email",
      post({ email: "a@b.c", turnstileToken: "tok-b" }),
      prodEnv,
    );
    expect(res.status).toBe(200);
    expect(sentForm(fetchMock).get("response")).toBe("tok-b");
  });

  it("rejects a token siteverify refuses, or one minted for another form", async () => {
    vi.stubGlobal(
      "fetch",
      siteverify({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    const bad = await app.request(
      "/api/auth/sign-in/email",
      post({}, { [TURNSTILE_TOKEN_HEADER]: "forged" }),
      prodEnv,
    );
    expect(bad.status).toBe(403);

    // The mock answers action "login"; a sign-up must not accept a login token.
    vi.stubGlobal("fetch", fetchMock);
    const other = await app.request(
      "/api/auth/sign-up/email",
      post({}, { [TURNSTILE_TOKEN_HEADER]: "login-token" }),
      prodEnv,
    );
    expect(other.status).toBe(403);
  });

  it("rejects a token solved on another hostname", async () => {
    vi.stubGlobal(
      "fetch",
      siteverify({ success: true, hostname: "evil.example", action: "login" }),
    );
    const res = await app.request(
      "/api/auth/sign-in/email",
      post({}, { [TURNSTILE_TOKEN_HEADER]: "tok" }),
      prodEnv,
    );
    expect(res.status).toBe(403);
  });

  it("answers 503 when siteverify is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    const res = await app.request(
      "/api/auth/sign-in/email",
      post({}, { [TURNSTILE_TOKEN_HEADER]: "tok" }),
      prodEnv,
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("TURNSTILE_UNAVAILABLE");
  });

  it("leaves other auth endpoints alone", async () => {
    const res = await app.request("/api/auth/sign-out", post({}), prodEnv);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

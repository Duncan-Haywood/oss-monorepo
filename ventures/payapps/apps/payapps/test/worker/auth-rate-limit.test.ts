// Durable auth rate limits (middleware/auth-rate-limit.ts): per IP on every auth POST, and per
// account on failed sign-ins only. Off in APP_ENV=test unless a request sends the opt-in header.
import { verification } from "@worker/db/schema";
import {
  AUTH_ACCOUNT_FAILURES,
  AUTH_IP_RULES,
  AUTH_THROTTLE_PREFIX,
  accountKey,
  TEST_AUTH_RATE_LIMIT_HEADER,
} from "@worker/middleware/auth-rate-limit";
import { like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, testDb } from "./helpers";

const PASSWORD = "correct-horse-battery";
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.test`;
const uniqueIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}-${crypto.randomUUID()}`;

const post = (path: string, json: unknown, headers: Record<string, string> = {}) =>
  api(path, { method: "POST", headers: { Origin: BASE, ...headers }, json });

const limited = (ip: string) => ({ [TEST_AUTH_RATE_LIMIT_HEADER]: "1", "cf-connecting-ip": ip });

async function signUp(email: string) {
  const res = await post("/api/auth/sign-up/email", { email, password: PASSWORD, name: "Sam" });
  expect(res.status).toBe(200);
}

describe("auth rate limits", () => {
  it("per account: failed sign-ins from rotating IPs lock the account for one window, with 429 + Retry-After", async () => {
    const email = uniqueEmail("guess");
    await signUp(email);
    for (let i = 0; i < AUTH_ACCOUNT_FAILURES.limit; i++) {
      const res = await post(
        "/api/auth/sign-in/email",
        { email, password: `wrong-password-${i}` },
        limited(uniqueIp()),
      );
      expect(res.status).toBe(401);
    }
    // Next try, even with the right password, from a fresh IP and with the address re-cased.
    const res = await post(
      "/api/auth/sign-in/email",
      { email: `  ${email.toUpperCase()} `, password: PASSWORD },
      limited(uniqueIp()),
    );
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("Retry-After"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(AUTH_ACCOUNT_FAILURES.windowMs / 1000);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(res.headers.getSetCookie().join(";")).not.toContain("session_token=");

    // Another account is unaffected.
    const other = uniqueEmail("other");
    await signUp(other);
    const ok = await post(
      "/api/auth/sign-in/email",
      { email: other, password: PASSWORD },
      limited(uniqueIp()),
    );
    expect(ok.status).toBe(200);
  });

  it("per account: successful sign-ins never count", async () => {
    const email = uniqueEmail("regular");
    await signUp(email);
    for (let i = 0; i < AUTH_ACCOUNT_FAILURES.limit + 2; i++) {
      const res = await post(
        "/api/auth/sign-in/email",
        { email, password: PASSWORD },
        limited(uniqueIp()),
      );
      expect(res.status).toBe(200);
    }
  });

  it("per IP: sign-ups from one address stop at the limit; another address still works", async () => {
    const ip = uniqueIp();
    const rule = AUTH_IP_RULES["/sign-up/email"];
    if (!rule) throw new Error("no sign-up rule");
    for (let i = 0; i < rule.limit; i++) {
      const res = await post(
        "/api/auth/sign-up/email",
        { email: uniqueEmail("bulk"), password: PASSWORD, name: "Bulk" },
        limited(ip),
      );
      expect(res.status).toBe(200);
    }
    const over = await post(
      "/api/auth/sign-up/email",
      { email: uniqueEmail("bulk"), password: PASSWORD, name: "Bulk" },
      limited(ip),
    );
    expect(over.status).toBe(429);
    const elsewhere = await post(
      "/api/auth/sign-up/email",
      { email: uniqueEmail("elsewhere"), password: PASSWORD, name: "Else" },
      limited(uniqueIp()),
    );
    expect(elsewhere.status).toBe(200);
  });

  it("per IP: each endpoint has its own counter (password-reset requests do not use up sign-ins)", async () => {
    const ip = uniqueIp();
    const rule = AUTH_IP_RULES["/request-password-reset"];
    if (!rule) throw new Error("no reset rule");
    for (let i = 0; i < rule.limit; i++) {
      const res = await post(
        "/api/auth/request-password-reset",
        { email: uniqueEmail("nobody"), redirectTo: `${BASE}/reset-password` },
        limited(ip),
      );
      expect(res.status).toBe(200);
    }
    const over = await post(
      "/api/auth/request-password-reset",
      { email: uniqueEmail("nobody"), redirectTo: `${BASE}/reset-password` },
      limited(ip),
    );
    expect(over.status).toBe(429);
    const email = uniqueEmail("signin");
    await signUp(email);
    const ok = await post("/api/auth/sign-in/email", { email, password: PASSWORD }, limited(ip));
    expect(ok.status).toBe(200);
  });

  it("stores a hash, never the address, and GETs (get-session) are not limited", async () => {
    const email = uniqueEmail("Hashed");
    await signUp(email);
    await post(
      "/api/auth/sign-in/email",
      { email, password: "nope-nope-nope" },
      limited(uniqueIp()),
    );
    const rows = await testDb()
      .select({ identifier: verification.identifier })
      .from(verification)
      .where(like(verification.identifier, `${AUTH_THROTTLE_PREFIX}account:%`))
      .all();
    expect(rows.map((r) => r.identifier)).toContain(
      `${AUTH_THROTTLE_PREFIX}account:${await accountKey(email)}`,
    );
    for (const r of rows) expect(r.identifier).not.toContain("@");

    const ip = uniqueIp();
    for (let i = 0; i < 80; i++) {
      const res = await api("/api/auth/get-session", { headers: limited(ip) });
      expect(res.status).toBe(200);
    }
  });

  it("is off in APP_ENV=test without the opt-in header", async () => {
    const email = uniqueEmail("nolimit");
    await signUp(email);
    for (let i = 0; i < AUTH_ACCOUNT_FAILURES.limit + 2; i++) {
      const res = await post("/api/auth/sign-in/email", { email, password: "wrong-wrong-wrong" });
      expect(res.status).toBe(401);
    }
  });
});

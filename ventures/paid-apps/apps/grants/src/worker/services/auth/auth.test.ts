import { describe, expect, it } from "vitest";
import { authUrls, isHardened } from "./auth";
import { hashPassword, PBKDF2_ITERATIONS, timingSafeEqual, verifyPassword } from "./password";

describe("isHardened (Secure cookies, rate limits, required AUTH_SECRET)", () => {
  it("is on for production and for ANY https deployment, whatever APP_ENV says", () => {
    expect(isHardened({ APP_ENV: "production", APP_URL: "http://localhost:5173" })).toBe(true);
    // wrangler.jsonc ships APP_ENV="development"; a deploy that forgets to override it is still
    // served over https and must not get non-Secure session cookies.
    expect(isHardened({ APP_ENV: "development", APP_URL: "https://grants.example.org" })).toBe(
      true,
    );
    expect(isHardened({ APP_ENV: "staging", APP_URL: "HTTPS://staging.example.org/" })).toBe(true);
  });

  it("is off only for plain-http local dev and tests", () => {
    expect(isHardened({ APP_ENV: "development", APP_URL: "http://localhost:5173" })).toBe(false);
    expect(isHardened({ APP_ENV: "test", APP_URL: "http://localhost:5173" })).toBe(false);
  });
});

describe("authUrls (Better Auth under the base path)", () => {
  it("puts the auth endpoints and session cookies under the base path", () => {
    expect(authUrls({ APP_URL: "https://marisstella.app/grants", BASE_PATH: "/grants" })).toEqual({
      baseURL: "https://marisstella.app/grants/api/auth",
      basePath: "/grants/api/auth",
      origin: "https://marisstella.app",
      cookiePath: "/grants",
    });
    expect(authUrls({ APP_URL: "https://marisstella.app/grants/", BASE_PATH: "grants/" })).toEqual(
      authUrls({ APP_URL: "https://marisstella.app/grants", BASE_PATH: "/grants" }),
    );
  });

  it("keeps the host-root layout for local dev and tests", () => {
    expect(authUrls({ APP_URL: "http://localhost:5173", BASE_PATH: "" })).toEqual({
      baseURL: "http://localhost:5173/api/auth",
      basePath: "/api/auth",
      origin: "http://localhost:5173",
      cookiePath: "/",
    });
  });
});

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords, tampered and over-cost hashes", async () => {
    const h = await hashPassword("correct-horse-battery");
    expect(h.startsWith(`pbkdf2-sha256$${PBKDF2_ITERATIONS}$`)).toBe(true);
    expect(await verifyPassword({ hash: h, password: "correct-horse-battery" })).toBe(true);
    expect(await verifyPassword({ hash: h, password: "correct-horse-batterY" })).toBe(false);
    const parts = h.split("$");
    expect(
      await verifyPassword({
        hash: [parts[0], PBKDF2_ITERATIONS + 1, parts[2], parts[3]].join("$"),
        password: "correct-horse-battery",
      }),
    ).toBe(false);
    expect(await verifyPassword({ hash: "garbage", password: "x" })).toBe(false);
  });

  it("timingSafeEqual compares length and every byte", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([]), new Uint8Array([0]))).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientIpFromHeaders,
  getRateLimiterBucketCountForTests,
  MAX_CLIENT_IP_LENGTH,
  MAX_RATE_LIMIT_BUCKETS,
  resetRateLimiterForTests,
} from "./rate-limit";

const CONFIG = { limit: 3, windowMs: 1_000 };

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  it("allows requests up to the configured limit within a window", () => {
    const key = "route-a:1.2.3.4";
    const first = checkRateLimit(key, CONFIG, 0);
    const second = checkRateLimit(key, CONFIG, 100);
    const third = checkRateLimit(key, CONFIG, 200);

    expect(first).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(third).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  });

  it("rejects the request that exceeds the limit within the window", () => {
    const key = "route-a:1.2.3.4";
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 100);
    checkRateLimit(key, CONFIG, 200);

    const fourth = checkRateLimit(key, CONFIG, 300);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("computes retryAfterSeconds from time remaining in the window", () => {
    const key = "route-a:1.2.3.4";
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);

    // Window is 1000ms; we're 700ms in, so 300ms (0.3s) remain — rounds up to 1s.
    const blocked = checkRateLimit(key, CONFIG, 700);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);

    // 950ms in, 50ms remain — still rounds up to 1s (never reports 0).
    const blockedNearEdge = checkRateLimit(key, CONFIG, 950);
    expect(blockedNearEdge.retryAfterSeconds).toBe(1);
  });

  it("resets the window once windowMs has elapsed since the first request", () => {
    const key = "route-a:1.2.3.4";
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);
    expect(checkRateLimit(key, CONFIG, 500).allowed).toBe(false);

    // Exactly at the window boundary — starts a fresh window.
    const afterWindow = checkRateLimit(key, CONFIG, 1_000);
    expect(afterWindow).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
  });

  it("tracks distinct keys independently", () => {
    const keyA = "route-a:1.1.1.1";
    const keyB = "route-b:1.1.1.1";
    const keyC = "route-a:2.2.2.2";

    checkRateLimit(keyA, CONFIG, 0);
    checkRateLimit(keyA, CONFIG, 0);
    checkRateLimit(keyA, CONFIG, 0);
    expect(checkRateLimit(keyA, CONFIG, 0).allowed).toBe(false);

    // Same IP, different route name — independent bucket.
    expect(checkRateLimit(keyB, CONFIG, 0).allowed).toBe(true);
    // Same route, different IP — independent bucket.
    expect(checkRateLimit(keyC, CONFIG, 0).allowed).toBe(true);
  });

  it("uses the default config when none is supplied", () => {
    const result = checkRateLimit("route-default:9.9.9.9");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("resetRateLimiterForTests clears state across keys", () => {
    const key = "route-a:1.2.3.4";
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);
    checkRateLimit(key, CONFIG, 0);
    expect(checkRateLimit(key, CONFIG, 0).allowed).toBe(false);

    resetRateLimiterForTests();

    expect(checkRateLimit(key, CONFIG, 0).allowed).toBe(true);
  });

  it("evicts expired buckets before admitting a new key", () => {
    checkRateLimit("stale-key", CONFIG, 0);
    checkRateLimit("fresh-key", CONFIG, 1_000);

    // The stale bucket must not remain resident after a later request.
    expect(getRateLimiterBucketCountForTests()).toBe(1);
  });

  it("caps active buckets by evicting the oldest key", () => {
    checkRateLimit("oldest-key", CONFIG, 0);
    for (let i = 0; i < MAX_RATE_LIMIT_BUCKETS - 1; i += 1) {
      checkRateLimit(`active-key-${i}`, CONFIG, 0);
    }

    // Adding a new distinct key at capacity evicts oldest-key, so the old
    // identifier starts a fresh window instead of growing the Map further.
    checkRateLimit("new-key-at-capacity", CONFIG, 0);
    expect(checkRateLimit("oldest-key", CONFIG, 0).allowed).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first entry in x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the first forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("falls back to a fixed placeholder when neither header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });

  it("falls back to the placeholder when x-forwarded-for exceeds MAX_CLIENT_IP_LENGTH", () => {
    const headers = new Headers({
      "x-forwarded-for": "9".repeat(MAX_CLIENT_IP_LENGTH + 1),
    });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });

  it("accepts an x-forwarded-for entry at exactly MAX_CLIENT_IP_LENGTH", () => {
    const value = "9".repeat(MAX_CLIENT_IP_LENGTH);
    const headers = new Headers({ "x-forwarded-for": value });
    expect(clientIpFromHeaders(headers)).toBe(value);
  });

  it("falls through to x-real-ip when x-forwarded-for is oversized", () => {
    const headers = new Headers({
      "x-forwarded-for": "9".repeat(MAX_CLIENT_IP_LENGTH + 1),
      "x-real-ip": "198.51.100.7",
    });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("falls back to the placeholder when x-real-ip exceeds MAX_CLIENT_IP_LENGTH", () => {
    const headers = new Headers({
      "x-real-ip": "8".repeat(MAX_CLIENT_IP_LENGTH + 1),
    });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });
});

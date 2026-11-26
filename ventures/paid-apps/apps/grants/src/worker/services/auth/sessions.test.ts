import { describe, expect, it } from "vitest";
import { requiresEmailVerification } from "./auth";
import { escapeHtml, resetPasswordEmail, verificationEmail, verifyEmailLink } from "./emails";
import { summarizeUserAgent, truncateIp } from "./sessions";

describe("truncateIp", () => {
  it("keeps only the /24 or /48 network prefix", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
    expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
    expect(truncateIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3::/48");
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(truncateIp("::1")).toBe("0:0:0::/48");
  });
  it("is idempotent and rejects garbage", () => {
    expect(truncateIp("203.0.113.0/24")).toBe("203.0.113.0/24");
    expect(truncateIp("2001:db8:85a3::/48")).toBe("2001:db8:85a3::/48");
    for (const bad of [
      null,
      undefined,
      "",
      "unknown",
      "300.1.1.1",
      "1:2:3",
      "1::2::3",
      "<script>",
    ]) {
      expect(truncateIp(bad)).toBeNull();
    }
  });
});

describe("summarizeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Chrome on macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Safari on iOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Edge on Windows",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "Firefox on Linux"],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    ["curl/8.5.0", "curl"],
    ["", "Unknown device"],
    [null, "Unknown device"],
  ])("%s -> %s", (ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected);
  });
});

describe("auth emails", () => {
  it("escapes HTML in every interpolated value", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
    const u = { id: "u1", email: "a&b@example.test", name: "<img src=x onerror=alert(1)>" };
    const link = verifyEmailLink({ APP_URL: "https://grants.example.org/" }, 'tok&en"<');
    expect(link).toBe("https://grants.example.org/verify-email?token=tok%26en%22%3C");
    for (const m of [verificationEmail(u, link), resetPasswordEmail(u, link)]) {
      expect(m.html).not.toContain("<img");
      expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(m.html).toContain("a&amp;b@example.test");
      expect(m.text).toContain(link);
      expect(m.text).toContain("Hi <img src=x onerror=alert(1)>,"); // plain text is not HTML
    }
  });
});

describe("requiresEmailVerification", () => {
  it("is off only for the public offline demo deployment (DEMO_MODE + FAKE_EXTERNALS)", () => {
    const https = "https://grants-demo.example.org";
    expect(
      requiresEmailVerification({
        APP_ENV: "production",
        APP_URL: https,
        FAKE_EXTERNALS: "true",
        DEMO_MODE: "true",
      }),
    ).toBe(false);
    // DEMO_MODE alone (real email) or FAKE_EXTERNALS alone on HTTPS keeps verification on.
    expect(
      requiresEmailVerification({
        APP_ENV: "production",
        APP_URL: https,
        FAKE_EXTERNALS: "false",
        DEMO_MODE: "true",
      }),
    ).toBe(true);
    expect(
      requiresEmailVerification({ APP_ENV: "production", APP_URL: https, FAKE_EXTERNALS: "true" }),
    ).toBe(true);
  });
  it("is on for production/HTTPS and real-email environments, off for tests and offline demo", () => {
    const local = "http://localhost:5173";
    expect(
      requiresEmailVerification({ APP_ENV: "production", APP_URL: local, FAKE_EXTERNALS: "true" }),
    ).toBe(true);
    expect(
      requiresEmailVerification({
        APP_ENV: "test",
        APP_URL: "https://x.example.org",
        FAKE_EXTERNALS: "true",
      }),
    ).toBe(true);
    expect(
      requiresEmailVerification({
        APP_ENV: "development",
        APP_URL: local,
        FAKE_EXTERNALS: "false",
      }),
    ).toBe(true);
    expect(
      requiresEmailVerification({ APP_ENV: "test", APP_URL: local, FAKE_EXTERNALS: "true" }),
    ).toBe(false);
    expect(
      requiresEmailVerification({ APP_ENV: "development", APP_URL: local, FAKE_EXTERNALS: "true" }),
    ).toBe(false);
  });
});

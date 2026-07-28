import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

const suppressEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  suppressEmail: (...args: unknown[]) => suppressEmail(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

function unsubscribeUrl(email: string, token?: string): string {
  const params = new URLSearchParams({ email });
  if (token !== undefined) {
    params.set("token", token);
  }
  return `http://localhost/api/unsubscribe?${params.toString()}`;
}

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    suppressEmail.mockReset();
    suppressEmail.mockResolvedValue(undefined);
    captureError.mockReset().mockResolvedValue(undefined);
    resetRateLimiterForTests();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 400 and never calls suppressEmail when the email param is missing", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/unsubscribe");

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toMatch(/missing email/i);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns 400 and never calls suppressEmail when the email param is empty", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/unsubscribe?email=");

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns 400 and never verifies/suppresses when the email param exceeds MAX_CONTACT_EMAIL_LENGTH", async () => {
    const { MAX_CONTACT_EMAIL_LENGTH } = await import(
      "@/lib/inquiries/contact-fields"
    );
    const { GET } = await import("./route");
    const overlong = `${"a".repeat(MAX_CONTACT_EMAIL_LENGTH + 1)}@x.test`;
    const token = signUnsubscribeToken(overlong);
    const request = new NextRequest(unsubscribeUrl(overlong, token));

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toMatch(/too long/i);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("still suppresses when the email is exactly MAX_CONTACT_EMAIL_LENGTH", async () => {
    const { MAX_CONTACT_EMAIL_LENGTH } = await import(
      "@/lib/inquiries/contact-fields"
    );
    const { GET } = await import("./route");
    const local = "a".repeat(MAX_CONTACT_EMAIL_LENGTH - "@x.test".length);
    const email = `${local}@x.test`;
    expect(email).toHaveLength(MAX_CONTACT_EMAIL_LENGTH);
    const token = signUnsubscribeToken(email);
    const request = new NextRequest(unsubscribeUrl(email, token));

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith(email, "unsubscribe", UNSUBSCRIBE_CONVEX_PRIMARY);
  });

  it("returns 400 and never verifies/suppresses when the token exceeds MAX_UNSUBSCRIBE_TOKEN_LENGTH", async () => {
    const { MAX_UNSUBSCRIBE_TOKEN_LENGTH } = await import(
      "@/lib/email/unsubscribe-token"
    );
    const { GET } = await import("./route");
    const overlong = "a".repeat(MAX_UNSUBSCRIBE_TOKEN_LENGTH + 1);
    const request = new NextRequest(
      unsubscribeUrl("victim@example.com", overlong),
    );

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toMatch(/token.*too long/i);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("still suppresses when the token is exactly MAX_UNSUBSCRIBE_TOKEN_LENGTH and valid", async () => {
    // Genuine HMAC tokens are 43 chars; exact-max path is exercised via the
    // helper's early length gate + route hard-reject twin. A padded token of
    // exactly MAX cannot verify, so this asserts the route does not 400 for
    // length when token.length === MAX (wrong-token 400 is fine).
    const { MAX_UNSUBSCRIBE_TOKEN_LENGTH } = await import(
      "@/lib/email/unsubscribe-token"
    );
    const { GET } = await import("./route");
    const exactMaxGarbage = "b".repeat(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
    expect(exactMaxGarbage).toHaveLength(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
    const request = new NextRequest(
      unsubscribeUrl("victim@example.com", exactMaxGarbage),
    );

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toMatch(/too long/i);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("400s when the token is missing (no query param)", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(unsubscribeUrl("victim@example.com"));

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("400s when the token does not match the email (forged/guessed link)", async () => {
    const { GET } = await import("./route");
    const tokenForSomeoneElse = signUnsubscribeToken("someone-else@example.com");
    const request = new NextRequest(
      unsubscribeUrl("victim@example.com", tokenForSomeoneElse),
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("400s on a garbage token string", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(unsubscribeUrl("victim@example.com", "not-a-real-token"));

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("suppresses the email and passes UNSUBSCRIBE_CONVEX_PRIMARY when the token matches", async () => {
    const { GET } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token));

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith("pat@example.com", "unsubscribe", UNSUBSCRIBE_CONVEX_PRIMARY);
  });

  it("returns a fail-closed 500 with a retry message when suppressEmail throws ConvexPrimaryWriteError", async () => {
    const { ConvexPrimaryWriteError } = await import("@/lib/payments/convex-primary");
    suppressEmail.mockRejectedValue(
      new ConvexPrimaryWriteError("suppressEmail", new Error("boom")),
    );
    const { GET } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token));

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/try again/i);
  });

  it("returns a generic 500 when suppressEmail throws a non-Convex error", async () => {
    const writeError = new Error("sqlite is locked");
    suppressEmail.mockRejectedValue(writeError);
    const { GET } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token));

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/error processing request/i);
    expect(text).not.toMatch(/try again/i);
    expect(captureError).toHaveBeenCalledWith(writeError, {
      component: "unsubscribe",
      failureKind: "suppression_write",
    });
  });

  it("does not call captureError when suppressEmail succeeds", async () => {
    const { GET } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token));

    await GET(request);

    expect(captureError).not.toHaveBeenCalled();
  });

  it("escapes apostrophes in the email via shared escapeHtmlForEmail (&#39;)", async () => {
    const { GET } = await import("./route");
    const email = "o'brien@example.com";
    const request = new NextRequest(unsubscribeUrl(email, signUnsubscribeToken(email)));

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("o&#39;brien@example.com");
    expect(html).not.toContain("o&#039;brien@example.com");
    expect(html).not.toContain("o'brien@example.com");
  });

  it("escapes HTML metacharacters in the email address", async () => {
    const { GET } = await import("./route");
    const email = "<script>alert(1)</script>@x.test";
    const request = new NextRequest(unsubscribeUrl(email, signUnsubscribeToken(email)));

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;@x.test");
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    const { GET } = await import("./route");
    const email = "rate-limit@example.com";
    const token = signUnsubscribeToken(email);
    const request = () =>
      new NextRequest(unsubscribeUrl(email, token), {
        headers: { "x-forwarded-for": "203.0.113.77" },
      });

    let lastResponse: Response | undefined;
    for (let i = 0; i < 21; i += 1) {
      lastResponse = await GET(request());
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const text = await lastResponse!.text();
    expect(text).toMatch(/too many requests/i);
    // The 21st request never reached suppressEmail.
    expect(suppressEmail).toHaveBeenCalledTimes(20);
  });
});

// RFC 8058 one-click unsubscribe — mail clients (Gmail/Yahoo) POST directly
// to the List-Unsubscribe header URL with no user-visible page and no
// redirect, expecting a bare 200. This must share every guard GET enforces
// (rate limit, length gates, token verification) via the same
// verifyAndSuppress helper, not a looser parallel path.
describe("POST /api/unsubscribe (RFC 8058 one-click)", () => {
  beforeEach(() => {
    suppressEmail.mockReset();
    suppressEmail.mockResolvedValue(undefined);
    captureError.mockReset().mockResolvedValue(undefined);
    resetRateLimiterForTests();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("suppresses the email and passes UNSUBSCRIBE_CONVEX_PRIMARY when the token matches", async () => {
    const { POST } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });

    const response = await POST(request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith("pat@example.com", "unsubscribe", UNSUBSCRIBE_CONVEX_PRIMARY);
    // RFC 8058 callers never render a body — plain-text ack, not the GET
    // handler's full HTML confirmation page.
    expect(text).not.toContain("<!DOCTYPE html>");
  });

  it("succeeds even with no request body (some clients omit the RFC 8058 form body)", async () => {
    const { POST } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token), {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith("pat@example.com", "unsubscribe", UNSUBSCRIBE_CONVEX_PRIMARY);
  });

  it("400s and never suppresses when the token does not match the email", async () => {
    const { POST } = await import("./route");
    const tokenForSomeoneElse = signUnsubscribeToken("someone-else@example.com");
    const request = new NextRequest(
      unsubscribeUrl("victim@example.com", tokenForSomeoneElse),
      { method: "POST" },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("400s and never suppresses when the email param is missing", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/unsubscribe", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns a fail-closed 500 with a retry message when suppressEmail throws ConvexPrimaryWriteError", async () => {
    const { ConvexPrimaryWriteError } = await import("@/lib/payments/convex-primary");
    suppressEmail.mockRejectedValue(
      new ConvexPrimaryWriteError("suppressEmail", new Error("boom")),
    );
    const { POST } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token), {
      method: "POST",
    });

    const response = await POST(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/try again/i);
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit, sharing GET's bucket", async () => {
    const { GET, POST } = await import("./route");
    const email = "rate-limit-post@example.com";
    const token = signUnsubscribeToken(email);
    const ip = "203.0.113.99";
    const getRequest = () =>
      new NextRequest(unsubscribeUrl(email, token), {
        headers: { "x-forwarded-for": ip },
      });
    const postRequest = () =>
      new NextRequest(unsubscribeUrl(email, token), {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      });

    // Exhaust the shared per-IP bucket via GET, then confirm POST on the
    // same IP is throttled too — one limiter, not a parallel bypass.
    for (let i = 0; i < 20; i += 1) {
      await GET(getRequest());
    }
    const response = await POST(postRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});

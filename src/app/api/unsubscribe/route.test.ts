import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";

const suppressEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  suppressEmail: (...args: unknown[]) => suppressEmail(...args),
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
    expect(suppressEmail).toHaveBeenCalledWith("pat@example.com", UNSUBSCRIBE_CONVEX_PRIMARY);
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
    suppressEmail.mockRejectedValue(new Error("sqlite is locked"));
    const { GET } = await import("./route");
    const token = signUnsubscribeToken("pat@example.com");
    const request = new NextRequest(unsubscribeUrl("pat@example.com", token));

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/error processing request/i);
    expect(text).not.toMatch(/try again/i);
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

vi.mock("@/lib/db", () => ({
  suppressEmail: vi.fn(async () => undefined),
}));

function unsubscribeUrl(email: string, token?: string): string {
  const params = new URLSearchParams({ email });
  if (token !== undefined) {
    params.set("token", token);
  }
  return `http://localhost/api/unsubscribe?${params.toString()}`;
}

describe("GET /api/unsubscribe — token verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("400s when the token is missing (no query param)", async () => {
    const { GET } = await import("./route");
    const { suppressEmail } = await import("@/lib/db");
    const request = new NextRequest(unsubscribeUrl("victim@example.com"));

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("400s when the token does not match the email (forged/guessed link)", async () => {
    const { GET } = await import("./route");
    const { suppressEmail } = await import("@/lib/db");
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
    const { suppressEmail } = await import("@/lib/db");
    const request = new NextRequest(unsubscribeUrl("victim@example.com", "not-a-real-token"));

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("suppresses the email when the token matches (valid link from a real email)", async () => {
    const { GET } = await import("./route");
    const { suppressEmail } = await import("@/lib/db");
    const token = signUnsubscribeToken("owner@example.com");
    const request = new NextRequest(unsubscribeUrl("owner@example.com", token));

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/unsubscribe — HTML escaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
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

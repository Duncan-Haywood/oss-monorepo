import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";

const suppressEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  suppressEmail: (...args: unknown[]) => suppressEmail(...args),
}));

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    suppressEmail.mockReset();
    suppressEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("escapes apostrophes in the email via shared escapeHtmlForEmail (&#39;)", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/unsubscribe?email=o%27brien%40example.com",
    );

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("o&#39;brien@example.com");
    expect(html).not.toContain("o&#039;brien@example.com");
    expect(html).not.toContain("o'brien@example.com");
  });

  it("escapes HTML metacharacters in the email address", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/unsubscribe?email=%3Cscript%3Ealert(1)%3C%2Fscript%3E%40x.test",
    );

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;@x.test");
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

  it("passes UNSUBSCRIBE_CONVEX_PRIMARY to suppressEmail", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/unsubscribe?email=pat%40example.com",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith(
      "pat@example.com",
      UNSUBSCRIBE_CONVEX_PRIMARY,
    );
  });

  it("returns a fail-closed 500 with a retry message when suppressEmail throws ConvexPrimaryWriteError", async () => {
    const { ConvexPrimaryWriteError } = await import(
      "@/lib/payments/convex-primary"
    );
    suppressEmail.mockRejectedValue(
      new ConvexPrimaryWriteError("suppressEmail", new Error("boom")),
    );
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/unsubscribe?email=pat%40example.com",
    );

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/try again/i);
  });

  it("returns a generic 500 when suppressEmail throws a non-Convex error", async () => {
    suppressEmail.mockRejectedValue(new Error("sqlite is locked"));
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/unsubscribe?email=pat%40example.com",
    );

    const response = await GET(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toMatch(/error processing request/i);
    expect(text).not.toMatch(/try again/i);
  });
});

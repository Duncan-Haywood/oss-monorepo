import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailParams } from "@/lib/email/resend";
import { CONTACT_FORM_CONVEX_PRIMARY } from "@/lib/inquiries/contact-persist";

// Route imports @/lib/db (getLeadBySlug/insertClientInquiry, "server-only") and
// dynamically imports @/lib/email/resend to send the operator notify — stub
// both so this stays a pure test of contact-form route orchestration + HTML escaping.
const getLeadBySlug = vi.fn();
const insertClientInquiry = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  insertClientInquiry: (...args: unknown[]) => insertClientInquiry(...args),
}));

type SendEmailResult = { success: true; mock?: boolean } | { success: false; reason?: string; error?: string };

const sentEmail = vi.fn(async (): Promise<SendEmailResult> => ({ success: true })) as unknown as {
  (params: SendEmailParams): Promise<SendEmailResult>;
  mockResolvedValueOnce: (value: SendEmailResult) => unknown;
  mockRejectedValueOnce: (error: Error) => unknown;
  mock: { calls: [SendEmailParams][] };
  mockClear: () => void;
};
vi.mock("@/lib/email/resend", () => ({
  sendEmail: sentEmail,
}));

const UNSAFE_NAME = `<img src=x onerror=alert(1)>`;
const UNSAFE_MESSAGE = `Hi <script>alert('xss')</script> please call`;

describe("POST /api/contact/[slug]", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    insertClientInquiry.mockReset();
    sentEmail.mockClear();
    getLeadBySlug.mockResolvedValue(null);
    insertClientInquiry.mockResolvedValue({ id: "inq_test_1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("escapes unsanitized visitor input before emailing the operator/business", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/contact/demo-cafe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: UNSAFE_NAME,
        email: "visitor@example.com",
        message: UNSAFE_MESSAGE,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo-cafe" }),
    });
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.notifySent).toBe(true);
    expect(sentEmail).toHaveBeenCalledTimes(1);
    const sentHtml = sentEmail.mock.calls[0]?.[0]?.html ?? "";
    expect(sentHtml).not.toContain("<img src=x onerror=alert(1)>");
    expect(sentHtml).not.toContain("<script>alert('xss')</script>");
    expect(sentHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(sentHtml).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("passes CONTACT_FORM_CONVEX_PRIMARY to insertClientInquiry", async () => {
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      email: "owner@demo.example",
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Pat",
          email: "visitor@example.com",
          message: "Book a table",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.inquiryId).toBe("inq_test_1");
    expect(json.notifySent).toBe(true);
    expect(insertClientInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        name: "Pat",
        email: "visitor@example.com",
        message: "Book a table",
      }),
      CONTACT_FORM_CONVEX_PRIMARY,
    );
  });

  it("returns 400 for an invalid slug", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/bad slug!", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      }),
      { params: Promise.resolve({ slug: "bad slug!" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/invalid slug/i);
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when message, email, and phone are all missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Pat" }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/message, email, or phone/i);
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("returns 503 and skips notify when persist fails without an inquiryId", async () => {
    insertClientInquiry.mockResolvedValue({ id: undefined });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Need a quote",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/could not save/i);
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("returns 503 and skips notify when insertClientInquiry throws ConvexPrimaryWriteError", async () => {
    const { ConvexPrimaryWriteError } = await import(
      "@/lib/payments/convex-primary"
    );
    insertClientInquiry.mockRejectedValue(
      new ConvexPrimaryWriteError("insertClientInquiry", new Error("boom")),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Need a quote",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/could not save/i);
    expect(insertClientInquiry).toHaveBeenCalledWith(
      expect.any(Object),
      CONTACT_FORM_CONVEX_PRIMARY,
    );
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("still returns ok when notify email throws after a durable persist", async () => {
    sentEmail.mockRejectedValueOnce(new Error("resend down"));
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Need a quote",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.inquiryId).toBe("inq_test_1");
    expect(json.notifySent).toBe(false);
    expect(sentEmail).toHaveBeenCalledTimes(1);
  });

  it("still returns ok with notifySent:false when sendEmail resolves success:false (suppressed)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sentEmail.mockResolvedValueOnce({ success: false, reason: "suppressed" });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Need a quote",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.inquiryId).toBe("inq_test_1");
    expect(json.notifySent).toBe(false);
    expect(sentEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("inquiry inq_test_1"),
    );
    errorSpy.mockRestore();
  });

  it("accepts form-urlencoded bodies and emails the lead when present", async () => {
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      email: "owner@demo.example",
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "name=Pat&email=visitor%40example.com&message=Hello",
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.notifySent).toBe(true);
    expect(sentEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@demo.example",
        leadSlug: "demo-cafe",
      }),
    );
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.11",
        },
        body: JSON.stringify({ email: "visitor@example.com", message: "Hi" }),
      });

    let lastResponse;
    for (let i = 0; i < 21; i += 1) {
      lastResponse = await POST(request(), {
        params: Promise.resolve({ slug: "demo-cafe" }),
      });
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const body = await lastResponse!.json();
    expect(body.ok).toBe(false);
    // The 21st request never persisted an inquiry.
    expect(insertClientInquiry).toHaveBeenCalledTimes(20);
  });
});

describe("GET /api/contact/[slug]", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("documents the POST contract", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/contact/demo-cafe"),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      slug: "demo-cafe",
      method: "POST",
      fields: expect.arrayContaining(["name", "email", "phone", "message"]),
    });
  });
});

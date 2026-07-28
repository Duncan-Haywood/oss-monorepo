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

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
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

const KNOWN_LEAD = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  email: "owner@demo.example",
} as const;

describe("POST /api/contact/[slug]", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    insertClientInquiry.mockReset();
    sentEmail.mockClear();
    // Default: known CRM lead. Unknown-slug spam must not persist/notify —
    // contact-form-require-known-lead. Tests that need null override explicitly.
    getLeadBySlug.mockResolvedValue({ ...KNOWN_LEAD });
    insertClientInquiry.mockResolvedValue({ id: "inq_test_1" });
    captureError.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 404 and skips persist/notify for an unknown non-demo slug", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/totally-unknown-lead-xyz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Spam me",
        }),
      }),
      { params: Promise.resolve({ slug: "totally-unknown-lead-xyz" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("unknown_lead");
    expect(json.error).toMatch(/unknown lead/i);
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("accepts curated DEMO_LEADS showcases when the CRM row is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/example-bakery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Love the sourdough",
        }),
      }),
      { params: Promise.resolve({ slug: "example-bakery" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.businessName).toBe("Hearth & Crumb Bakery");
    expect(json.notifySent).toBe(true);
    expect(insertClientInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSlug: "example-bakery",
        businessName: "Hearth & Crumb Bakery",
      }),
      CONTACT_FORM_CONVEX_PRIMARY,
    );
    expect(sentEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "hello@hearthcrumb.example",
        leadSlug: "example-bakery",
        skipSuppression: true,
      }),
    );
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

  it("reports insertClientInquiry failures via captureError (inquiry_persist)", async () => {
    const persistError = new Error("sqlite is locked");
    insertClientInquiry.mockRejectedValue(persistError);
    const { POST } = await import("./route");
    await POST(
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

    expect(captureError).toHaveBeenCalledWith(persistError, {
      component: "contact-form",
      failureKind: "inquiry_persist",
      leadSlug: "demo-cafe",
    });
  });

  it("does not call captureError when insertClientInquiry succeeds", async () => {
    const { POST } = await import("./route");
    await POST(
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

    expect(captureError).not.toHaveBeenCalled();
  });

  it("still returns ok when notify email throws after a durable persist, and reports it via captureError (notify_send)", async () => {
    const notifyError = new Error("resend down");
    sentEmail.mockRejectedValueOnce(notifyError);
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
    expect(captureError).toHaveBeenCalledWith(notifyError, {
      component: "contact-form",
      failureKind: "notify_send",
      leadSlug: "demo-cafe",
    });
  });

  it("still returns ok with notifySent:false when sendEmail resolves success:false (Resend outage), and reports it via captureError (notify_send)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // After skipSuppression, marketing suppress is not a failure path for this
    // route — still assert Resend/API failure surfaces notifySent:false.
    sentEmail.mockResolvedValueOnce({ success: false, error: "resend 500" });
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
    expect(sentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ skipSuppression: true }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("inquiry inq_test_1"),
    );
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "contact-form",
      failureKind: "notify_send",
      leadSlug: "demo-cafe",
    });
    expect(captureError.mock.calls[0][0].message).toBe("resend 500");
    errorSpy.mockRestore();
  });

  it("sets replyTo to the visitor's submitted email so the business can Reply directly", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Book a table",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(sentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "visitor@example.com" }),
    );
  });

  it("passes replyTo: undefined (not an empty string) when the visitor left email blank", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "555-1234",
          message: "Call me back",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    const call = sentEmail.mock.calls[0]?.[0];
    expect(call?.replyTo).toBeUndefined();
  });

  it("links the visitor's email as a mailto: anchor in the notify HTML", async () => {
    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Book a table",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const sentHtml = sentEmail.mock.calls[0]?.[0]?.html ?? "";
    expect(sentHtml).toContain('<a href="mailto:visitor@example.com">visitor@example.com</a>');
  });

  it("passes skipSuppression so a marketing-unsub lead still gets inquiry notify", async () => {
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
          email: "visitor@example.com",
          message: "Book a table",
        }),
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
        skipSuppression: true,
      }),
    );
  });

  it("soft-caps oversize message for both persist and notify (same string)", async () => {
    const { MAX_CONTACT_MESSAGE_LENGTH } = await import(
      "@/lib/inquiries/contact-fields"
    );
    const oversize = "x".repeat(MAX_CONTACT_MESSAGE_LENGTH + 1500);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Pat",
          email: "visitor@example.com",
          message: oversize,
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.notifySent).toBe(true);

    const persisted = insertClientInquiry.mock.calls[0]?.[0] as {
      message: string;
      name: string;
    };
    expect(persisted.message).toHaveLength(MAX_CONTACT_MESSAGE_LENGTH);
    expect(persisted.message).toBe("x".repeat(MAX_CONTACT_MESSAGE_LENGTH));
    expect(persisted.name).toBe("Pat");

    const sentHtml = sentEmail.mock.calls[0]?.[0]?.html ?? "";
    // Escaped body must not contain the uncapped tail — notify uses the same cap.
    expect(sentHtml).not.toContain("x".repeat(MAX_CONTACT_MESSAGE_LENGTH + 1));
    expect(sentHtml).toContain("x".repeat(Math.min(80, MAX_CONTACT_MESSAGE_LENGTH)));
  });

  it("soft-caps oversize name/email/phone/source before persist", async () => {
    const {
      MAX_CONTACT_NAME_LENGTH,
      MAX_CONTACT_EMAIL_LENGTH,
      MAX_CONTACT_PHONE_LENGTH,
      MAX_CONTACT_SOURCE_LENGTH,
    } = await import("@/lib/inquiries/contact-fields");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          referer: "r".repeat(MAX_CONTACT_SOURCE_LENGTH + 50),
        },
        body: JSON.stringify({
          name: "n".repeat(MAX_CONTACT_NAME_LENGTH + 20),
          email: "e".repeat(MAX_CONTACT_EMAIL_LENGTH + 20),
          phone: "1".repeat(MAX_CONTACT_PHONE_LENGTH + 20),
          message: "hi",
        }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );

    expect(response.status).toBe(200);
    const persisted = insertClientInquiry.mock.calls[0]?.[0] as {
      name: string;
      email: string;
      phone: string;
      source: string;
      message: string;
    };
    expect(persisted.name).toHaveLength(MAX_CONTACT_NAME_LENGTH);
    expect(persisted.email).toHaveLength(MAX_CONTACT_EMAIL_LENGTH);
    expect(persisted.phone).toHaveLength(MAX_CONTACT_PHONE_LENGTH);
    expect(persisted.source).toHaveLength(MAX_CONTACT_SOURCE_LENGTH);
    expect(persisted.message).toBe("hi");
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
        skipSuppression: true,
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

  it("returns 400 and skips CRM lookup for over-long path slugs", async () => {
    const { MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH } = await import(
      "@/lib/leads/slug-path"
    );
    const { POST } = await import("./route");
    const tooLong = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);
    const response = await POST(
      new Request(`http://localhost/api/contact/${tooLong}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "Should not persist",
        }),
      }),
      { params: Promise.resolve({ slug: tooLong }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/invalid slug/i);
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("accepts path slugs at the public length ceiling", async () => {
    const { MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH } = await import(
      "@/lib/leads/slug-path"
    );
    const exact = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH);
    getLeadBySlug.mockResolvedValue({
      ...KNOWN_LEAD,
      slug: exact,
      businessName: "Exact Max Cafe",
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request(`http://localhost/api/contact/${exact}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "visitor@example.com",
          message: "At the ceiling",
        }),
      }),
      { params: Promise.resolve({ slug: exact }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(getLeadBySlug).toHaveBeenCalledWith(exact);
  });
});

describe("POST /api/contact/[slug] body size", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    insertClientInquiry.mockReset();
    sentEmail.mockClear();
    getLeadBySlug.mockResolvedValue({ ...KNOWN_LEAD });
    insertClientInquiry.mockResolvedValue({ id: "inq_test_1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES before CRM", async () => {
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      email: "visitor@example.com",
      message: "hi",
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: huge,
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/too large/i);
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when form-urlencoded body exceeds the shared byte ceiling before CRM", async () => {
    const { MAX_PUBLIC_REQUEST_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    // No Content-Length — arrayBuffer bound must still reject (FormData twin).
    const huge = `email=visitor%40example.com&message=${"m".repeat(MAX_PUBLIC_REQUEST_BODY_BYTES)}`;
    const response = await POST(
      new Request("http://localhost/api/contact/demo-cafe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: huge,
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/too large/i);
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(insertClientInquiry).not.toHaveBeenCalled();
    expect(sentEmail).not.toHaveBeenCalled();
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

  it("returns 400 for over-long path slugs instead of echoing them", async () => {
    const { MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH } = await import(
      "@/lib/leads/slug-path"
    );
    const { GET } = await import("./route");
    const tooLong = "b".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);
    const response = await GET(
      new Request(`http://localhost/api/contact/${tooLong}`),
      { params: Promise.resolve({ slug: tooLong }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/invalid slug/i);
    expect(JSON.stringify(json)).not.toContain(tooLong);
  });
});

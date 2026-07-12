import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailParams } from "@/lib/email/resend";

// Route imports @/lib/db (getLeadBySlug/insertClientInquiry, "server-only") and
// dynamically imports @/lib/email/resend to send the operator notify — stub
// both so this stays a pure test of the contact-form HTML escaping.
vi.mock("@/lib/db", () => ({
  getLeadBySlug: vi.fn(async () => null),
  insertClientInquiry: vi.fn(async () => ({ id: "inq_test_1" })),
}));

const sentEmail = vi.fn(async () => undefined) as unknown as {
  (params: SendEmailParams): Promise<undefined>;
  mock: { calls: [SendEmailParams][] };
  mockClear: () => void;
};
vi.mock("@/lib/email/resend", () => ({
  sendEmail: sentEmail,
}));

const UNSAFE_NAME = `<img src=x onerror=alert(1)>`;
const UNSAFE_MESSAGE = `Hi <script>alert('xss')</script> please call`;

describe("POST /api/contact/[slug] — HTML escaping", () => {
  beforeEach(() => {
    sentEmail.mockClear();
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
    expect(sentEmail).toHaveBeenCalledTimes(1);
    const sentHtml = sentEmail.mock.calls[0]?.[0]?.html ?? "";
    expect(sentHtml).not.toContain("<img src=x onerror=alert(1)>");
    expect(sentHtml).not.toContain("<script>alert('xss')</script>");
    expect(sentHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(sentHtml).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });
});

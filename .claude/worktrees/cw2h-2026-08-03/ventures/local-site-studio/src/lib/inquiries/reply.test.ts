import { describe, expect, it } from "vitest";
import {
  escapeHtmlForEmail,
  inquiryCanReceiveReply,
  inquiryShouldAutoMarkRead,
  MAX_INQUIRY_REPLY_LENGTH,
  normalizeInquiryReply,
  plainTextToEmailHtml,
} from "./reply";

describe("normalizeInquiryReply", () => {
  it("rejects empty / whitespace", () => {
    expect(normalizeInquiryReply("").ok).toBe(false);
    expect(normalizeInquiryReply("   ").ok).toBe(false);
    expect(normalizeInquiryReply(null).ok).toBe(false);
  });

  it("trims and accepts a normal reply", () => {
    const result = normalizeInquiryReply("  Thanks for reaching out.  ");
    expect(result).toEqual({ ok: true, body: "Thanks for reaching out." });
  });

  it("rejects over-long replies", () => {
    const result = normalizeInquiryReply("x".repeat(MAX_INQUIRY_REPLY_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("accepts replies at the max length", () => {
    const body = "x".repeat(MAX_INQUIRY_REPLY_LENGTH);
    expect(normalizeInquiryReply(body)).toEqual({ ok: true, body });
  });
});

describe("escapeHtmlForEmail / plainTextToEmailHtml", () => {
  it("escapes HTML entities", () => {
    expect(escapeHtmlForEmail(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("turns blank lines into paragraphs and single newlines into <br />", () => {
    const html = plainTextToEmailHtml("Hello &\nworld\n\nSecond");
    expect(html).toContain("Hello &amp;<br />world");
    expect(html).toContain("Second");
    expect(html.match(/<p /g)?.length).toBe(2);
  });
});

describe("inquiryCanReceiveReply", () => {
  it("requires a non-empty email and non-archived status", () => {
    expect(
      inquiryCanReceiveReply({ email: "a@b.com", status: "new" }),
    ).toBe(true);
    expect(
      inquiryCanReceiveReply({ email: "a@b.com", status: "read" }),
    ).toBe(true);
    expect(
      inquiryCanReceiveReply({ email: "a@b.com", status: "replied" }),
    ).toBe(true);
    expect(
      inquiryCanReceiveReply({ email: "a@b.com", status: "archived" }),
    ).toBe(false);
    expect(inquiryCanReceiveReply({ email: "", status: "new" })).toBe(false);
    expect(inquiryCanReceiveReply({ email: null, status: "new" })).toBe(false);
  });
});

describe("inquiryShouldAutoMarkRead", () => {
  it("marks read only when opening the composer on a brand-new inquiry", () => {
    expect(inquiryShouldAutoMarkRead({ status: "new" }, true)).toBe(true);
  });

  it("never fires when closing the composer", () => {
    expect(inquiryShouldAutoMarkRead({ status: "new" }, false)).toBe(false);
  });

  it("never fires for inquiries already past new", () => {
    expect(inquiryShouldAutoMarkRead({ status: "read" }, true)).toBe(false);
    expect(inquiryShouldAutoMarkRead({ status: "replied" }, true)).toBe(false);
    expect(inquiryShouldAutoMarkRead({ status: "archived" }, true)).toBe(false);
  });
});

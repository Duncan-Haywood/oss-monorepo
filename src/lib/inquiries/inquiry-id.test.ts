import { describe, expect, it } from "vitest";
import {
  MAX_INQUIRY_ID_LENGTH,
  newClientInquiryId,
  parseInquiryId,
} from "@/lib/inquiries/inquiry-id";

describe("parseInquiryId", () => {
  it("rejects non-string / empty / whitespace as missing", () => {
    expect(parseInquiryId(undefined)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseInquiryId(null)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseInquiryId(42)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseInquiryId("")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseInquiryId("   ")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("trims and accepts a genuine inq_* id", () => {
    expect(parseInquiryId("  inq_demo-cafe_1710000000000  ")).toEqual({
      ok: true,
      inquiryId: "inq_demo-cafe_1710000000000",
    });
  });

  it("hard-rejects over MAX_INQUIRY_ID_LENGTH (no soft-cap)", () => {
    const over = `inq_${"a".repeat(MAX_INQUIRY_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_INQUIRY_ID_LENGTH);
    expect(parseInquiryId(over)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts exactly MAX_INQUIRY_ID_LENGTH", () => {
    const exact = "i".repeat(MAX_INQUIRY_ID_LENGTH);
    expect(parseInquiryId(exact)).toEqual({
      ok: true,
      inquiryId: exact,
    });
  });
});

describe("newClientInquiryId", () => {
  it("returns a non-empty string prefixed with inq_<leadSlug>_", () => {
    const id = newClientInquiryId("demo-cafe");
    expect(typeof id).toBe("string");
    expect(id.startsWith("inq_demo-cafe_")).toBe(true);
  });

  it("generates distinct ids across same-millisecond calls (collision guard)", () => {
    // Regression for inquiry-id-collision-guard: the pre-fix generator was
    // `inq_${leadSlug}_${Date.now()}` with no random component, so two
    // inquiries for the same lead created in the same millisecond (a
    // double-submit/retry, or two near-simultaneous commerce_checkout
    // webhook inquiries) produced an identical id — Convex's by_inquiryId
    // `.unique()` lookups then throw on the duplicate, orphaning both rows.
    const ids = new Set(
      Array.from({ length: 50 }, () => newClientInquiryId("demo-cafe")),
    );
    expect(ids.size).toBe(50);
  });

  it("stays under MAX_INQUIRY_ID_LENGTH at the max lead slug length", () => {
    const maxSlug = "a".repeat(63); // MAX_LEAD_SLUG_LENGTH
    const id = newClientInquiryId(maxSlug);
    expect(id.length).toBeLessThanOrEqual(MAX_INQUIRY_ID_LENGTH);
    expect(parseInquiryId(id)).toEqual({ ok: true, inquiryId: id });
  });
});

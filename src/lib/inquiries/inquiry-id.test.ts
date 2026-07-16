import { describe, expect, it } from "vitest";
import {
  MAX_INQUIRY_ID_LENGTH,
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

import { describe, expect, it } from "vitest";
import {
  MAX_PACK_HASHTAG_LENGTH,
  MAX_PACK_VARIANT_BODY_LENGTH,
  MAX_PACK_VARIANT_CTA_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
  softCapOptionalPackField,
  softCapPackBody,
  softCapPackField,
  softCapPackHashtags,
} from "./variant-fields";

describe("softCapPackField", () => {
  it("returns the value when under max", () => {
    expect(softCapPackField("hello", 10)).toBe("hello");
  });

  it("truncates when over max", () => {
    expect(softCapPackField("abcdefghij", 5)).toBe("abcde");
  });
});

describe("softCapOptionalPackField", () => {
  it("returns undefined for non-string / blank", () => {
    expect(softCapOptionalPackField(null, 10)).toBeUndefined();
    expect(softCapOptionalPackField(12, 10)).toBeUndefined();
    expect(softCapOptionalPackField("   ", 10)).toBeUndefined();
  });

  it("trims and soft-caps", () => {
    expect(softCapOptionalPackField("  hi  ", 10)).toBe("hi");
    const over = "x".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 5);
    expect(softCapOptionalPackField(over, MAX_PACK_VARIANT_TITLE_LENGTH)).toBe(
      "x".repeat(MAX_PACK_VARIANT_TITLE_LENGTH),
    );
  });
});

describe("softCapPackBody", () => {
  it("soft-caps at MAX_PACK_VARIANT_BODY_LENGTH", () => {
    const over = "b".repeat(MAX_PACK_VARIANT_BODY_LENGTH + 1);
    expect(softCapPackBody(over)).toHaveLength(MAX_PACK_VARIANT_BODY_LENGTH);
  });
});

describe("softCapPackHashtags", () => {
  it("returns undefined for non-array", () => {
    expect(softCapPackHashtags("nope")).toBeUndefined();
  });

  it("soft-caps each tag, drops blanks, slices count", () => {
    const long = "#".repeat(MAX_PACK_HASHTAG_LENGTH + 10);
    const tags = softCapPackHashtags(
      [long, "  ", "#ok", 1, ...Array.from({ length: 10 }, (_, i) => `#t${i}`)],
      8,
    );
    expect(tags).toHaveLength(8);
    expect(tags?.[0]).toHaveLength(MAX_PACK_HASHTAG_LENGTH);
    expect(tags?.[1]).toBe("#ok");
  });

  it("returns undefined when nothing usable remains", () => {
    expect(softCapPackHashtags(["  ", null, 3])).toBeUndefined();
  });
});

describe("pack variant max constants", () => {
  it("keeps title/cta shorter than body", () => {
    expect(MAX_PACK_VARIANT_TITLE_LENGTH).toBeLessThan(MAX_PACK_VARIANT_BODY_LENGTH);
    expect(MAX_PACK_VARIANT_CTA_LENGTH).toBeLessThan(MAX_PACK_VARIANT_BODY_LENGTH);
    expect(MAX_PACK_HASHTAG_LENGTH).toBeLessThan(MAX_PACK_VARIANT_TITLE_LENGTH);
  });
});

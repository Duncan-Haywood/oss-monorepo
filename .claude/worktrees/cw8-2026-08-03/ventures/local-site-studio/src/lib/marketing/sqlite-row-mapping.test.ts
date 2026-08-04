import { describe, expect, it } from "vitest";
import {
  mapMarketingPackRow,
  parsePackVariants,
  type SqliteMarketingPackRow,
} from "./sqlite-row-mapping";

const baseRow: SqliteMarketingPackRow = {
  id: "mp_acme_2026-01",
  leadSlug: "acme",
  yearMonth: "2026-01",
  variantsJson: JSON.stringify([{ contentType: "gbp_post", body: "Check out our new menu!" }]),
  generatedAt: "2026-01-01T00:00:00.000Z",
  generator: "stub",
  packageTier: "social_email",
};

describe("parsePackVariants", () => {
  it("round-trips well-formed variants", () => {
    const json = JSON.stringify([
      { contentType: "email_campaign", body: "Hello", title: "Subject", hashtags: ["#local"] },
    ]);
    expect(parsePackVariants(json)).toEqual([
      { contentType: "email_campaign", body: "Hello", title: "Subject", hashtags: ["#local"] },
    ]);
  });

  it("degrades malformed JSON to []", () => {
    expect(parsePackVariants("not json")).toEqual([]);
  });

  it("degrades a non-array JSON value to []", () => {
    expect(parsePackVariants(JSON.stringify({ contentType: "gbp_post", body: "x" }))).toEqual([]);
  });

  it("filters out elements missing contentType or body", () => {
    const json = JSON.stringify([
      { contentType: "gbp_post", body: "valid" },
      { contentType: "gbp_post" },
      { body: "no content type" },
      "not-an-object",
    ]);
    expect(parsePackVariants(json)).toEqual([{ contentType: "gbp_post", body: "valid" }]);
  });
});

describe("mapMarketingPackRow", () => {
  it("maps a well-formed row", () => {
    expect(mapMarketingPackRow(baseRow)).toEqual({
      id: "mp_acme_2026-01",
      leadSlug: "acme",
      yearMonth: "2026-01",
      variants: [{ contentType: "gbp_post", body: "Check out our new menu!" }],
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: "stub",
      packageTier: "social_email",
    });
  });

  it("maps generator=anthropic through and defaults an unrecognized generator to stub", () => {
    expect(mapMarketingPackRow({ ...baseRow, generator: "anthropic" }).generator).toBe(
      "anthropic",
    );
    expect(mapMarketingPackRow({ ...baseRow, generator: "gpt5" }).generator).toBe("stub");
  });

  it("defaults an unrecognized or null packageTier to undefined", () => {
    expect(mapMarketingPackRow({ ...baseRow, packageTier: null }).packageTier).toBeUndefined();
    expect(
      mapMarketingPackRow({ ...baseRow, packageTier: "enterprise" }).packageTier,
    ).toBeUndefined();
    expect(mapMarketingPackRow({ ...baseRow, packageTier: "full_marketing" }).packageTier).toBe(
      "full_marketing",
    );
  });

  it("survives a corrupted variantsJson column without throwing", () => {
    const row: SqliteMarketingPackRow = { ...baseRow, variantsJson: "{corrupt" };
    expect(() => mapMarketingPackRow(row)).not.toThrow();
    expect(mapMarketingPackRow(row).variants).toEqual([]);
  });
});

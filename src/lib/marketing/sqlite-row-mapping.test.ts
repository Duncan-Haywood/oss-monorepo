import { describe, expect, it } from "vitest";
import {
  MAX_PACK_VARIANT_BODY_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
} from "@/lib/packs/variant-fields";
import {
  mapMarketingPackRow,
  parsePackVariants,
  softCapMarketingPack,
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

  it("soft-caps over-long title/body on read", () => {
    const json = JSON.stringify([
      {
        contentType: "gbp_post",
        title: "t".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 5),
        body: "b".repeat(MAX_PACK_VARIANT_BODY_LENGTH + 2),
      },
    ]);
    const [variant] = parsePackVariants(json);
    expect(variant?.title).toHaveLength(MAX_PACK_VARIANT_TITLE_LENGTH);
    expect(variant?.body).toHaveLength(MAX_PACK_VARIANT_BODY_LENGTH);
  });
});

describe("softCapMarketingPack", () => {
  it("soft-caps Convex-shaped packs that bypass parsePackVariants", () => {
    const pack = softCapMarketingPack({
      id: "mp_x",
      leadSlug: "x",
      yearMonth: "2026-07",
      generatedAt: "2026-07-01T00:00:00.000Z",
      generator: "stub",
      variants: [
        {
          contentType: "gbp_post",
          title: "t".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 1),
          body: "ok",
        },
      ],
    });
    expect(pack.variants[0]?.title).toHaveLength(MAX_PACK_VARIANT_TITLE_LENGTH);
    expect(pack.variants[0]?.body).toBe("ok");
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

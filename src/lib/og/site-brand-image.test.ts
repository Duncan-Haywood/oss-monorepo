import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BRAND_NAME_FALLBACK } from "@/lib/brand";
import { siteOgImageAlt } from "./site-brand-image";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_BRAND_NAME;
  delete process.env.NEXT_PUBLIC_APP_NAME;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("siteOgImageAlt", () => {
  it("includes the brand fallback name when unconfigured", () => {
    expect(siteOgImageAlt()).toBe(
      `${BRAND_NAME_FALLBACK} — pre-built websites for local businesses`,
    );
  });

  it("includes the configured brand name", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Acme Sites";
    expect(siteOgImageAlt()).toBe(
      "Acme Sites — pre-built websites for local businesses",
    );
  });
});

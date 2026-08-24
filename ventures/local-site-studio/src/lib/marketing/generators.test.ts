import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PACK_HASHTAG_LENGTH,
  MAX_PACK_VARIANT_BODY_LENGTH,
  MAX_PACK_VARIANT_CTA_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
} from "@/lib/packs/variant-fields";

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

import {
  AnthropicMarketingGenerator,
  createDefaultMarketingGenerator,
  getMarketingGenerator,
  resetMarketingGeneratorForTests,
  setMarketingGenerator,
  StubMarketingGenerator,
} from "./generators";
import type { GenerateMarketingRequest, MarketingGenerator } from "./types";

const baseBusiness = {
  businessName: "Pine Cafe",
  category: "restaurant",
  city: "Boulder",
  state: "CO",
  phone: "303-555-0100",
  hours: "7am–3pm",
  services: ["brunch", "coffee", "catering"],
  tagline: "Fresh local plates",
  tone: "friendly" as const,
};

function request(
  overrides: Partial<GenerateMarketingRequest> = {},
): GenerateMarketingRequest {
  return {
    leadId: "pine-cafe",
    contentTypes: ["gbp_post", "instagram_caption", "email_campaign"],
    automationLevel: "generate_only",
    business: { ...baseBusiness },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetMarketingGeneratorForTests();
  delete process.env.ANTHROPIC_API_KEY;
  captureError.mockReset().mockResolvedValue(undefined);
});

describe("StubMarketingGenerator", () => {
  it("returns one variant per content type with business + location", async () => {
    const result = await new StubMarketingGenerator().generate(request());
    expect(result.leadId).toBe("pine-cafe");
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.body).toContain("Pine Cafe");
    expect(result.variants[0]?.body).toContain("Boulder, CO");
    expect(result.variants[0]?.cta).toBe("Call 303-555-0100");
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits state from location, uses Visit us today CTA, and Call for hours when missing", async () => {
    const result = await new StubMarketingGenerator().generate(
      request({
        business: {
          businessName: "Solo Shop",
          category: "retail",
          city: "Denver",
          services: ["gifts"],
        },
      }),
    );
    expect(result.variants[0]?.body).toContain("Denver —");
    expect(result.variants[0]?.body).not.toContain("Denver,");
    expect(result.variants[0]?.body).toContain("Call for hours.");
    expect(result.variants[0]?.cta).toBe("Visit us today");
  });

  it("falls back to our services when services is empty", async () => {
    const result = await new StubMarketingGenerator().generate(
      request({
        contentTypes: ["seasonal_promo"],
        business: { ...baseBusiness, services: [] },
      }),
    );
    expect(result.variants[0]?.body).toContain("our services");
  });

  it("soft-caps over-long title/body/cta/hashtag from create-path-max business fields", async () => {
    const longName = "N".repeat(MAX_PACK_VARIANT_TITLE_LENGTH);
    const longCity = "C".repeat(MAX_PACK_VARIANT_TITLE_LENGTH);
    const longService = "S".repeat(MAX_PACK_VARIANT_TITLE_LENGTH);
    const longHours = "H".repeat(MAX_PACK_VARIANT_BODY_LENGTH);
    const longPhone = "P".repeat(MAX_PACK_VARIANT_CTA_LENGTH + 20);
    const longCategory = "K".repeat(MAX_PACK_HASHTAG_LENGTH + 20);
    const result = await new StubMarketingGenerator().generate(
      request({
        contentTypes: ["local_seo_meta", "instagram_caption"],
        business: {
          businessName: longName,
          category: longCategory,
          city: longCity,
          services: [longService],
          hours: longHours,
          phone: longPhone,
        },
      }),
    );
    expect(result.variants[0]?.title).toHaveLength(MAX_PACK_VARIANT_TITLE_LENGTH);
    expect(result.variants[0]?.body.length).toBeLessThanOrEqual(
      MAX_PACK_VARIANT_BODY_LENGTH,
    );
    expect(result.variants[0]?.cta).toHaveLength(MAX_PACK_VARIANT_CTA_LENGTH);
    expect(result.variants[1]?.hashtags?.[0]?.length).toBeLessThanOrEqual(
      MAX_PACK_HASHTAG_LENGTH,
    );
    expect(result.variants[1]?.hashtags?.[1]?.length).toBeLessThanOrEqual(
      MAX_PACK_HASHTAG_LENGTH,
    );
  });

  it("includes campaignContext only in seasonal_promo/ad_copy bodies, never other content types", async () => {
    const result = await new StubMarketingGenerator().generate(
      request({
        contentTypes: ["seasonal_promo", "ad_copy", "gbp_post"],
        business: { ...baseBusiness, campaignContext: "Labor Day weekend" },
      }),
    );
    expect(result.variants[0]?.body).toContain("Labor Day weekend");
    expect(result.variants[1]?.body).toContain("Labor Day weekend");
    expect(result.variants[2]?.body).not.toContain("Labor Day weekend");
  });

  it("sets titles for local_seo_meta / email_campaign / gbp_post and hashtags for social", async () => {
    const result = await new StubMarketingGenerator().generate(
      request({
        contentTypes: [
          "local_seo_meta",
          "email_campaign",
          "gbp_post",
          "instagram_caption",
          "facebook_caption",
          "ad_copy",
        ],
      }),
    );
    expect(result.variants[0]?.title).toMatch(/Pine Cafe \|/);
    expect(result.variants[1]?.title).toMatch(/Pine Cafe \|/);
    expect(result.variants[2]?.title).toMatch(/— Boulder/);
    expect(result.variants[3]?.hashtags).toEqual([
      "#Boulder",
      "#restaurant",
      "#LocalBusiness",
    ]);
    expect(result.variants[4]?.hashtags).toBeDefined();
    expect(result.variants[5]?.hashtags).toBeUndefined();
    expect(result.variants[5]?.title).toBeUndefined();
  });
});

describe("AnthropicMarketingGenerator", () => {
  it("falls back when apiKey is blank", async () => {
    const fallback: MarketingGenerator = {
      generate: vi.fn(async () => ({
        leadId: "fallback",
        variants: [],
        generatedAt: "2026-07-13T00:00:00.000Z",
      })),
    };
    const gen = new AnthropicMarketingGenerator("   ", fallback);
    const result = await gen.generate(request());
    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(result.leadId).toBe("fallback");
  });

  it("parses Anthropic text JSON and sets packageTier for optimize automation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  contentType: "gbp_post",
                  title: "Brunch this week",
                  body: "Pine Cafe brunch in Boulder",
                  cta: "Call us",
                },
                {
                  contentType: "instagram_caption",
                  body: "Coffee for locals",
                  hashtags: ["#Boulder", 42, "#Cafe", "x", "y", "z", "a", "b", "c", "d"],
                },
                {
                  contentType: "email_campaign",
                  title: "July special",
                  body: "Catering offer",
                },
              ]),
            },
          ],
        }),
      })),
    );

    const gen = new AnthropicMarketingGenerator("sk-test");
    const result = await gen.generate(
      request({ automationLevel: "generate_schedule_optimize" }),
    );

    expect(result.packageTier).toBe("full_marketing");
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]).toMatchObject({
      contentType: "gbp_post",
      title: "Brunch this week",
      body: "Pine Cafe brunch in Boulder",
      cta: "Call us",
    });
    // Non-string hashtags dropped; capped at 8
    expect(result.variants[1]?.hashtags).toEqual([
      "#Boulder",
      "#Cafe",
      "x",
      "y",
      "z",
      "a",
      "b",
      "c",
    ]);
    expect(result.variants[2]?.cta).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
    });
  });

  it("soft-caps over-long title/body/cta/hashtag strings from the model", async () => {
    const longTitle = "T".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 20);
    const longBody = "B".repeat(MAX_PACK_VARIANT_BODY_LENGTH + 20);
    const longCta = "C".repeat(MAX_PACK_VARIANT_CTA_LENGTH + 20);
    const longTag = "#".repeat(MAX_PACK_HASHTAG_LENGTH + 20);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  contentType: "gbp_post",
                  title: longTitle,
                  body: longBody,
                  cta: longCta,
                  hashtags: [longTag, "#ok"],
                },
                { contentType: "instagram_caption", body: "short two" },
                { contentType: "email_campaign", body: "short three" },
              ]),
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicMarketingGenerator("sk-test").generate(
      request(),
    );
    expect(result.variants[0]?.title).toHaveLength(MAX_PACK_VARIANT_TITLE_LENGTH);
    expect(result.variants[0]?.body).toHaveLength(MAX_PACK_VARIANT_BODY_LENGTH);
    expect(result.variants[0]?.cta).toHaveLength(MAX_PACK_VARIANT_CTA_LENGTH);
    expect(result.variants[0]?.hashtags?.[0]).toHaveLength(MAX_PACK_HASHTAG_LENGTH);
    expect(result.variants[0]?.hashtags?.[1]).toBe("#ok");
  });

  it("sets social_email packageTier for non-optimize automation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: '[{"body":"one"},{"body":"two"},{"body":"three"}]',
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicMarketingGenerator("sk-test").generate(
      request({ automationLevel: "generate_schedule" }),
    );
    expect(result.packageTier).toBe("social_email");
  });

  it("falls back when model returns the wrong variant count", async () => {
    const fallback = new StubMarketingGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: '[{"body":"only one"}]' }],
        }),
      })),
    );

    const result = await new AnthropicMarketingGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.body).toContain("[Stub");
  });

  it("falls back on HTTP errors and reports the failure via captureError", async () => {
    const fallback = new StubMarketingGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "boom",
      })),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await new AnthropicMarketingGenerator("sk-test", fallback).generate(request());
    expect(spy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    // Sold-capability degradation: a paid customer's marketing pack silently
    // fell back to generic stub copy — this must be reported, not just logged.
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "marketing-generators",
      failureKind: "anthropic_marketing_generation",
      leadId: "pine-cafe",
    });
  });

  it("passes an AbortSignal request timeout to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify([{ body: "hi" }]) }],
        }),
      })),
    );

    await new AnthropicMarketingGenerator("sk-test").generate(
      request({ contentTypes: ["gbp_post"] }),
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back when the request times out (AbortError)", async () => {
    const fallback = new StubMarketingGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await new AnthropicMarketingGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    expect(result.leadId).toBe(request().leadId);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "marketing-generators",
      failureKind: "anthropic_marketing_generation",
      leadId: "pine-cafe",
    });
  });

  it("falls back when response has no text content", async () => {
    const fallback = new StubMarketingGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [{ type: "tool_use" }] }),
      })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await new AnthropicMarketingGenerator("sk-test", fallback).generate(request());
    expect(spy).toHaveBeenCalledOnce();
  });

  it("falls back when JSON array is missing or a variant body is empty", async () => {
    const fallback = new StubMarketingGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "sorry, no json here" }],
        }),
      })),
    );
    await new AnthropicMarketingGenerator("sk-test", fallback).generate(request());
    expect(spy).toHaveBeenCalledOnce();

    spy.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: '[{"body":"ok"},{"body":"  "},{"body":"ok"}]',
            },
          ],
        }),
      })),
    );
    await new AnthropicMarketingGenerator("sk-test", fallback).generate(request());
    expect(spy).toHaveBeenCalledOnce();
  });

  it("passes campaignContext through to the Anthropic request body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify([{ contentType: "seasonal_promo", body: "Sale copy" }]),
            },
          ],
        }),
      })),
    );

    await new AnthropicMarketingGenerator("sk-test").generate(
      request({
        contentTypes: ["seasonal_promo"],
        business: { ...baseBusiness, campaignContext: "Labor Day weekend" },
      }),
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: Array<{ content: string }>;
    };
    const userPayload = JSON.parse(body.messages[0]!.content) as {
      business: { campaignContext?: string };
    };
    expect(userPayload.business.campaignContext).toBe("Labor Day weekend");
  });

  it("extracts JSON array from prose wrappers and forces expected contentTypes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: 'Here you go:\n[{"contentType":"wrong","body":"A"},{"body":"B"},{"body":"C"}]\nThanks!',
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicMarketingGenerator("sk-test").generate(request());
    expect(result.variants.map((v) => v.contentType)).toEqual([
      "gbp_post",
      "instagram_caption",
      "email_campaign",
    ]);
    expect(result.variants.map((v) => v.body)).toEqual(["A", "B", "C"]);
  });
});

describe("createDefaultMarketingGenerator / getMarketingGenerator", () => {
  it("returns Anthropic when ANTHROPIC_API_KEY is set, stub otherwise", () => {
    process.env.ANTHROPIC_API_KEY = "sk-live";
    expect(createDefaultMarketingGenerator()).toBeInstanceOf(AnthropicMarketingGenerator);

    delete process.env.ANTHROPIC_API_KEY;
    expect(createDefaultMarketingGenerator()).toBeInstanceOf(StubMarketingGenerator);
  });

  it("memoizes getMarketingGenerator until reset; setMarketingGenerator overrides", async () => {
    resetMarketingGeneratorForTests();
    const first = getMarketingGenerator();
    expect(getMarketingGenerator()).toBe(first);

    const custom: MarketingGenerator = {
      generate: async () => ({
        leadId: "custom",
        variants: [],
        generatedAt: "2026-07-13T00:00:00.000Z",
      }),
    };
    setMarketingGenerator(custom);
    expect(getMarketingGenerator()).toBe(custom);
    expect(await getMarketingGenerator().generate(request())).toMatchObject({
      leadId: "custom",
    });

    resetMarketingGeneratorForTests();
    expect(getMarketingGenerator()).not.toBe(custom);
  });
});

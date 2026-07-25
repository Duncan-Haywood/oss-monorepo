import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PACK_VARIANT_BODY_LENGTH,
  MAX_PACK_VARIANT_CTA_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
} from "@/lib/packs/variant-fields";
import {
  AnthropicClientVoiceGenerator,
  createDefaultClientVoiceGenerator,
  getClientVoiceGenerator,
  resetClientVoiceGeneratorForTests,
  setClientVoiceGenerator,
  StubClientVoiceGenerator,
} from "./generators";
import type {
  ClientVoiceGenerator,
  ClientVoiceScriptType,
  GenerateClientVoiceRequest,
} from "./types";
import { CLIENT_VOICE_FAQ_SCRIPT_TYPES } from "./faq-pack";

const baseBusiness = {
  businessName: "Summit Plumbing",
  category: "trades",
  city: "Denver",
  state: "CO",
  phone: "303-555-0199",
  hours: "8am–6pm",
  services: ["drain cleaning", "water heaters", "emergency repair"],
  tagline: "Fast local fixes",
  tone: "friendly" as const,
};

function request(
  overrides: Partial<GenerateClientVoiceRequest> = {},
): GenerateClientVoiceRequest {
  return {
    leadId: "summit-plumbing",
    scriptTypes: ["inbound_greeting", "hours_faq", "booking_cta"],
    business: { ...baseBusiness },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetClientVoiceGeneratorForTests();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("StubClientVoiceGenerator", () => {
  it("returns one variant per script type with business name + automated disclosure", async () => {
    const result = await new StubClientVoiceGenerator().generate(request());
    expect(result.leadId).toBe("summit-plumbing");
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.scriptType).toBe("inbound_greeting");
    expect(result.variants[0]?.body).toMatch(/Summit Plumbing/);
    expect(result.variants[0]?.body).toMatch(/automated assistant/i);
    expect(result.variants[1]?.body).toContain("Denver, CO");
    expect(result.variants[1]?.body).toContain("8am–6pm");
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("covers every sold FAQ script type with stable titles", async () => {
    const result = await new StubClientVoiceGenerator().generate(
      request({ scriptTypes: [...CLIENT_VOICE_FAQ_SCRIPT_TYPES] }),
    );
    expect(result.variants.map((v) => v.scriptType)).toEqual([
      ...CLIENT_VOICE_FAQ_SCRIPT_TYPES,
    ]);
    expect(result.variants.map((v) => v.title)).toEqual([
      "Inbound greeting",
      "Hours",
      "Services",
      "Booking",
      "After hours",
      "Take a message",
    ]);
    expect(result.variants.every((v) => v.body.includes("Summit Plumbing"))).toBe(
      true,
    );
  });

  it("soft-caps services_faq body when services.join exceeds pack body max", async () => {
    // MAX_SERVICES(100) × MAX_SERVICE_ITEM_LENGTH(100) alone exceeds BODY=8000.
    const manyServices = Array.from({ length: 100 }, (_, i) =>
      `service-${String(i).padStart(3, "0")}-${"x".repeat(80)}`,
    );
    const result = await new StubClientVoiceGenerator().generate(
      request({
        scriptTypes: ["services_faq"],
        business: { ...baseBusiness, services: manyServices },
      }),
    );
    expect(result.variants[0]?.body).toHaveLength(MAX_PACK_VARIANT_BODY_LENGTH);
    expect(result.variants[0]?.title).toBe("Services");
  });

  it("omits state from location and falls back when services/hours/phone missing", async () => {
    const result = await new StubClientVoiceGenerator().generate(
      request({
        scriptTypes: ["hours_faq", "services_faq", "booking_cta", "after_hours"],
        business: {
          businessName: "Solo Shop",
          category: "retail",
          city: "Boulder",
          services: [],
        },
      }),
    );
    expect(result.variants[0]?.body).toContain("Boulder");
    expect(result.variants[0]?.body).not.toContain("Boulder,");
    expect(result.variants[0]?.body).toMatch(/by appointment/i);
    expect(result.variants[0]?.body).not.toMatch(/Reach us at|You can also reach us/);
    expect(result.variants[1]?.body).toContain("our services");
    expect(result.variants[2]?.body).toContain("Solo Shop");
    expect(result.variants[3]?.body).toMatch(/currently closed/i);
  });

  it("includes phone CTA bits when phone is present", async () => {
    const result = await new StubClientVoiceGenerator().generate(
      request({ scriptTypes: ["hours_faq", "booking_cta"] }),
    );
    expect(result.variants[0]?.body).toContain("303-555-0199");
    expect(result.variants[1]?.body).toContain("303-555-0199");
  });
});

describe("AnthropicClientVoiceGenerator", () => {
  it("falls back when apiKey is blank", async () => {
    const fallback: ClientVoiceGenerator = {
      generate: vi.fn(async () => ({
        leadId: "fallback",
        variants: [],
        generatedAt: "2026-07-13T00:00:00.000Z",
      })),
    };
    const gen = new AnthropicClientVoiceGenerator("   ", fallback);
    const result = await gen.generate(request());
    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(result.leadId).toBe("fallback");
  });

  it("parses Anthropic text JSON and forces expected scriptTypes", async () => {
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
                  scriptType: "wrong",
                  title: "Hello",
                  body: "Thanks for calling Summit Plumbing.",
                  cta: "Ask how to help",
                },
                {
                  scriptType: "wrong",
                  body: "We are open 8am–6pm.",
                },
                {
                  scriptType: "wrong",
                  title: "Book now",
                  body: "Tell me a preferred day.",
                  cta: "Collect name + number",
                },
              ]),
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicClientVoiceGenerator("sk-test").generate(
      request(),
    );

    expect(result.variants).toHaveLength(3);
    expect(result.variants.map((v) => v.scriptType)).toEqual([
      "inbound_greeting",
      "hours_faq",
      "booking_cta",
    ]);
    expect(result.variants[0]).toMatchObject({
      title: "Hello",
      body: "Thanks for calling Summit Plumbing.",
      cta: "Ask how to help",
    });
    // Missing title falls back to the expected scriptType string
    expect(result.variants[1]?.title).toBe("hours_faq");
    expect(result.variants[1]?.cta).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
    });
  });

  it("soft-caps over-long title/body/cta from the model", async () => {
    const longTitle = "T".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 20);
    const longBody = "B".repeat(MAX_PACK_VARIANT_BODY_LENGTH + 20);
    const longCta = "C".repeat(MAX_PACK_VARIANT_CTA_LENGTH + 20);
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
                  scriptType: "wrong",
                  title: longTitle,
                  body: longBody,
                  cta: longCta,
                },
                { scriptType: "wrong", body: "hours body" },
                { scriptType: "wrong", title: "Book", body: "booking body" },
              ]),
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicClientVoiceGenerator("sk-test").generate(
      request(),
    );
    expect(result.variants[0]?.title).toHaveLength(MAX_PACK_VARIANT_TITLE_LENGTH);
    expect(result.variants[0]?.body).toHaveLength(MAX_PACK_VARIANT_BODY_LENGTH);
    expect(result.variants[0]?.cta).toHaveLength(MAX_PACK_VARIANT_CTA_LENGTH);
  });

  it("falls back when model returns the wrong variant count", async () => {
    const fallback = new StubClientVoiceGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: '[{"body":"only one","title":"x"}]' }],
        }),
      })),
    );

    const result = await new AnthropicClientVoiceGenerator(
      "sk-test",
      fallback,
    ).generate(request());
    expect(spy).toHaveBeenCalledOnce();
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.body).toMatch(/automated assistant/i);
  });

  it("falls back on HTTP errors", async () => {
    const fallback = new StubClientVoiceGenerator();
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

    await new AnthropicClientVoiceGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("passes an AbortSignal request timeout to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            { type: "text", text: JSON.stringify([{ scriptType: "inbound_greeting", title: "t", body: "hi" }]) },
          ],
        }),
      })),
    );

    await new AnthropicClientVoiceGenerator("sk-test").generate(
      request({ scriptTypes: ["inbound_greeting"] }),
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back when the request times out (AbortError)", async () => {
    const fallback = new StubClientVoiceGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await new AnthropicClientVoiceGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    expect(result.leadId).toBe(request().leadId);
  });

  it("falls back when response has no text content", async () => {
    const fallback = new StubClientVoiceGenerator();
    const spy = vi.spyOn(fallback, "generate");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [{ type: "tool_use" }] }),
      })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await new AnthropicClientVoiceGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
  });

  it("falls back when JSON array is missing or a variant body is empty", async () => {
    const fallback = new StubClientVoiceGenerator();
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
    await new AnthropicClientVoiceGenerator("sk-test", fallback).generate(
      request(),
    );
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
              text: '[{"body":"ok","title":"a"},{"body":"  ","title":"b"},{"body":"ok","title":"c"}]',
            },
          ],
        }),
      })),
    );
    await new AnthropicClientVoiceGenerator("sk-test", fallback).generate(
      request(),
    );
    expect(spy).toHaveBeenCalledOnce();
  });

  it("extracts JSON array from prose wrappers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: 'Here you go:\n[{"title":"A","body":"one"},{"title":"B","body":"two"},{"title":"C","body":"three"}]\nThanks!',
            },
          ],
        }),
      })),
    );

    const result = await new AnthropicClientVoiceGenerator("sk-test").generate(
      request(),
    );
    expect(result.variants.map((v) => v.body)).toEqual(["one", "two", "three"]);
    expect(result.variants.map((v) => v.scriptType)).toEqual([
      "inbound_greeting",
      "hours_faq",
      "booking_cta",
    ] satisfies ClientVoiceScriptType[]);
  });
});

describe("createDefaultClientVoiceGenerator / getClientVoiceGenerator", () => {
  it("returns Anthropic when ANTHROPIC_API_KEY is set, stub otherwise", () => {
    process.env.ANTHROPIC_API_KEY = "sk-live";
    expect(createDefaultClientVoiceGenerator()).toBeInstanceOf(
      AnthropicClientVoiceGenerator,
    );

    delete process.env.ANTHROPIC_API_KEY;
    expect(createDefaultClientVoiceGenerator()).toBeInstanceOf(
      StubClientVoiceGenerator,
    );
  });

  it("memoizes getClientVoiceGenerator until reset; setClientVoiceGenerator overrides", async () => {
    resetClientVoiceGeneratorForTests();
    const first = getClientVoiceGenerator();
    expect(getClientVoiceGenerator()).toBe(first);

    const custom: ClientVoiceGenerator = {
      generate: async () => ({
        leadId: "custom",
        variants: [],
        generatedAt: "2026-07-13T00:00:00.000Z",
      }),
    };
    setClientVoiceGenerator(custom);
    expect(getClientVoiceGenerator()).toBe(custom);
    expect(await getClientVoiceGenerator().generate(request())).toMatchObject({
      leadId: "custom",
    });

    resetClientVoiceGeneratorForTests();
    expect(getClientVoiceGenerator()).not.toBe(custom);
  });
});

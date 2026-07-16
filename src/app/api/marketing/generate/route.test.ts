import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * Route-level coverage for POST /api/marketing/generate — operator
 * ad-hoc marketing generation (prefer generateMarketingPackAction for
 * persisted Growth/Complete packs).
 *
 * generators.test.ts locks Stub/Anthropic paths; this suite locks the
 * route's auth gate, client-IP rate-limit 429, JSON/contentTypes/
 * contentTypes size cap / automationLevel/business validation, and
 * stub-vs-LLM response messaging.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const generate = vi.fn();
vi.mock("@/lib/marketing/generators", () => ({
  getMarketingGenerator: () => ({
    generate: (...args: unknown[]) => generate(...args),
  }),
}));

function generateRequest(body: unknown, clientIp = "203.0.113.40") {
  return new Request("http://localhost/api/marketing/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  leadId: "demo-cafe",
  contentTypes: ["gbp_post"],
  automationLevel: "generate_only",
  business: {
    businessName: "Demo Cafe",
    category: "restaurant",
    city: "Austin",
    services: ["coffee", "pastries"],
  },
};

const ENV_KEYS = ["ANTHROPIC_API_KEY"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

describe("POST /api/marketing/generate", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    generate.mockReset().mockResolvedValue({
      variants: [
        {
          type: "gbp_post",
          title: "Weekend special",
          body: "Come by for pour-overs.",
        },
      ],
    });
    resetRateLimiterForTests();
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns 401 when operator auth fails", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { POST } = await import("./route");
    const res = await POST(generateRequest(validBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After after the rate limit is exceeded", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 20; i++) {
      const ok = await POST(generateRequest(validBody, "203.0.113.41"));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(generateRequest(validBody, "203.0.113.41"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(await limited.json()).toEqual({
      error: "Too many requests",
      message: "Please try again shortly.",
    });
    expect(generate).toHaveBeenCalledTimes(20);
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(generateRequest("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES", async () => {
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      ...validBody,
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const res = await POST(generateRequest(huge));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body is too large" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not an object", async () => {
    const { POST } = await import("./route");
    const res = await POST(generateRequest("null"));
    // JSON.parse("null") yields null — treated as missing body.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body required" });
  });

  it("returns 400 when leadId is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({
        contentTypes: validBody.contentTypes,
        automationLevel: validBody.automationLevel,
        business: validBody.business,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "leadId is required" });
  });

  it("returns 400 when contentTypes is empty", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({ ...validBody, contentTypes: [] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "contentTypes must be a non-empty array",
    });
  });

  it("returns 400 when contentTypes exceeds the monthly pack ceiling", async () => {
    const { POST } = await import("./route");
    const { MAX_MARKETING_CONTENT_TYPES_PER_REQUEST } = await import(
      "@/lib/marketing/generate-limits"
    );
    const oversized = Array.from(
      { length: MAX_MARKETING_CONTENT_TYPES_PER_REQUEST + 1 },
      () => "gbp_post",
    );
    const res = await POST(
      generateRequest({ ...validBody, contentTypes: oversized }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: `contentTypes must have at most ${MAX_MARKETING_CONTENT_TYPES_PER_REQUEST} entries (monthly pack ceiling)`,
      max: MAX_MARKETING_CONTENT_TYPES_PER_REQUEST,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 400 when leadId exceeds the length bound", async () => {
    const { POST } = await import("./route");
    const { MAX_MARKETING_GENERATE_LEAD_ID_LENGTH } = await import(
      "@/lib/marketing/generate-limits"
    );
    const res = await POST(
      generateRequest({
        ...validBody,
        leadId: "a".repeat(MAX_MARKETING_GENERATE_LEAD_ID_LENGTH + 1),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: `leadId must be ${MAX_MARKETING_GENERATE_LEAD_ID_LENGTH} characters or fewer`,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("soft-caps oversize business fields before calling the generator", async () => {
    const { POST } = await import("./route");
    const { MAX_BUSINESS_NAME_LENGTH, MAX_SERVICES } = await import(
      "@/lib/leads/create-fields"
    );
    const res = await POST(
      generateRequest({
        ...validBody,
        business: {
          ...validBody.business,
          businessName: "Z".repeat(MAX_BUSINESS_NAME_LENGTH + 25),
          services: Array.from(
            { length: MAX_SERVICES + 8 },
            (_, i) => `svc-${i}`,
          ),
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        business: expect.objectContaining({
          businessName: "Z".repeat(MAX_BUSINESS_NAME_LENGTH),
          services: expect.any(Array),
        }),
      }),
    );
    const passed = generate.mock.calls[0]?.[0] as {
      business: { services: string[] };
    };
    expect(passed.business.services).toHaveLength(MAX_SERVICES);
  });

  it("returns 400 for invalid contentTypes", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({
        ...validBody,
        contentTypes: ["gbp_post", "tiktok_script"],
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid contentTypes",
      invalid: ["tiktok_script"],
    });
  });

  it("returns 400 for an invalid automationLevel", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({ ...validBody, automationLevel: "fully_auto" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/automationLevel must be/);
  });

  it("returns 400 when business context is incomplete", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({
        ...validBody,
        business: { businessName: "Demo Cafe", category: "restaurant" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/business object required/);
  });

  it("returns stub messaging when the generator returns stub bodies and no API key is set", async () => {
    generate.mockResolvedValue({
      variants: [
        {
          type: "gbp_post",
          title: "Stub",
          body: "[Stub] Weekend special for Demo Cafe",
        },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(generateRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
    expect(body.message).toMatch(/Set ANTHROPIC_API_KEY/);
    expect(body.docs).toBe("/docs/marketing-automation");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "demo-cafe",
        contentTypes: ["gbp_post"],
        automationLevel: "generate_only",
      }),
    );
  });

  it("returns LLM-failed messaging when stub bodies arrive despite ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    generate.mockResolvedValue({
      variants: [
        {
          type: "gbp_post",
          title: "Stub",
          body: "[Stub] fallback after HTTP error",
        },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(generateRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
    expect(body.message).toMatch(/LLM call failed/);
  });

  it("returns Anthropic success messaging when variants are non-stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { POST } = await import("./route");
    const res = await POST(
      generateRequest({
        ...validBody,
        approvalMode: "required",
        contentTypes: ["email_campaign", "gbp_post"],
        automationLevel: "generate_schedule_optimize",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(false);
    expect(body.message).toBe("Generated via Anthropic");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "demo-cafe",
        contentTypes: ["email_campaign", "gbp_post"],
        automationLevel: "generate_schedule_optimize",
        approvalMode: "required",
      }),
    );
  });
});

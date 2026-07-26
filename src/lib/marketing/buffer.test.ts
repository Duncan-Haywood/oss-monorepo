import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bufferServiceContentType,
  createBufferUpdate,
  formatMarketingVariantForBuffer,
  listBufferProfiles,
  listLeadsMissingBufferProfileMapping,
  listMarketingPacksMissingBufferPost,
  oldestBufferProfileMappingMissingAgeHours,
  oldestMarketingPackMissingBufferPostAgeHours,
  resolveBufferSelection,
} from "./buffer";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("listBufferProfiles", () => {
  it("maps Buffer's snake_case profile shape to camelCase", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: "p1", service: "facebook", formatted_username: "Demo Cafe" },
        { id: "p2", service: "instagram" },
      ],
    });

    const profiles = await listBufferProfiles("tok_x");
    expect(profiles).toEqual([
      { id: "p1", service: "facebook", formattedUsername: "Demo Cafe" },
      { id: "p2", service: "instagram", formattedUsername: undefined },
    ]);
    const [calledUrl, calledInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).not.toContain("access_token");
    expect(calledUrl).not.toContain("tok_x");
    expect(calledInit).toEqual({ headers: { Authorization: "Bearer tok_x" } });
  });

  it("throws on a non-ok response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => "invalid token" });

    await expect(listBufferProfiles("bad")).rejects.toThrow(/401/);
  });
});

describe("createBufferUpdate", () => {
  it("returns success with update ids on a 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, updates: [{ id: "u1" }] }),
    });

    const result = await createBufferUpdate("tok_x", {
      profileIds: ["p1"],
      text: "Hello world",
    });
    expect(result).toEqual({ success: true, updateIds: ["u1"] });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/updates/create.json");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toContain("profile_ids%5B%5D=p1");
    expect(call[1].body).toContain("text=Hello");
  });

  it("returns failure when Buffer resolves success: false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, message: "Profile not found" }),
    });

    const result = await createBufferUpdate("tok_x", { profileIds: ["bad"], text: "x" });
    expect(result).toEqual({ success: false, error: "Profile not found" });
  });

  it("returns failure on a non-ok HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => null,
    });

    const result = await createBufferUpdate("tok_x", { profileIds: ["p1"], text: "x" });
    expect(result.success).toBe(false);
  });

  it("never throws on a network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await createBufferUpdate("tok_x", { profileIds: ["p1"], text: "x" });
    expect(result).toEqual({ success: false, error: "ECONNRESET" });
  });
});

describe("bufferServiceContentType", () => {
  it("maps facebook/instagram to their pack content types", () => {
    expect(bufferServiceContentType("facebook")).toBe("facebook_caption");
    expect(bufferServiceContentType("instagram")).toBe("instagram_caption");
  });

  it("returns null for services with no matching pack content type", () => {
    expect(bufferServiceContentType("twitter")).toBeNull();
    expect(bufferServiceContentType("linkedin")).toBeNull();
    expect(bufferServiceContentType("google")).toBeNull();
  });
});

describe("formatMarketingVariantForBuffer", () => {
  it("joins title, body, cta, and hashtags", () => {
    const text = formatMarketingVariantForBuffer({
      contentType: "facebook_caption",
      title: "Grand reopening",
      body: "Come see us this weekend.",
      cta: "Book now",
      hashtags: ["#local", "#coffee"],
    });
    expect(text).toBe(
      "Grand reopening\n\nCome see us this weekend.\n\nCTA: Book now\n\n#local #coffee",
    );
  });

  it("skips absent optional fields", () => {
    const text = formatMarketingVariantForBuffer({
      contentType: "instagram_caption",
      body: "Just the body.",
    });
    expect(text).toBe("Just the body.");
  });
});

describe("resolveBufferSelection", () => {
  it("uses the in-memory draft once the operator has toggled a checkbox for this lead", () => {
    expect(resolveBufferSelection({ "lead-1": ["p1"] }, "lead-1", ["p1", "p2"])).toEqual(["p1"]);
  });

  it("falls back to the lead's saved mapping when no draft exists yet for this lead", () => {
    expect(resolveBufferSelection({}, "lead-1", ["p1", "p2"])).toEqual(["p1", "p2"]);
  });

  it("returns an empty selection when neither a draft nor a saved mapping exists", () => {
    expect(resolveBufferSelection({}, "lead-1", undefined)).toEqual([]);
  });

  it("does not fall back to another lead's draft or saved mapping", () => {
    expect(resolveBufferSelection({ "lead-2": ["p9"] }, "lead-1", undefined)).toEqual([]);
  });

  it("honors an explicit empty draft as 'operator deselected everything', not a missing draft", () => {
    expect(resolveBufferSelection({ "lead-1": [] }, "lead-1", ["p1", "p2"])).toEqual([]);
  });
});

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

describe("listLeadsMissingBufferProfileMapping", () => {
  it("includes an eligible Growth/Complete lead with no saved profile mapping", () => {
    const leads = [
      { slug: "no-mapping", stage: "paid" as const },
      { slug: "already-mapped", stage: "live" as const, bufferProfileIds: ["p1"] },
      { slug: "not-eligible", stage: "site_built" as const },
    ];
    const orders = [
      { leadSlug: "no-mapping", tier: "growth" },
      { leadSlug: "already-mapped", tier: "complete" },
      { leadSlug: "not-eligible", tier: "growth" },
    ];
    expect(listLeadsMissingBufferProfileMapping(leads, orders)).toEqual([
      leads[0],
    ]);
  });

  it("excludes a lead whose saved mapping is an empty array (never mapped, but explicitly saved empty)", () => {
    const leads = [
      { slug: "empty-mapping", stage: "paid" as const, bufferProfileIds: [] },
    ];
    const orders = [{ leadSlug: "empty-mapping", tier: "growth" }];
    expect(listLeadsMissingBufferProfileMapping(leads, orders)).toEqual(leads);
  });

  it("sorts results by slug", () => {
    const leads = [
      { slug: "zeta", stage: "paid" as const },
      { slug: "alpha", stage: "paid" as const },
    ];
    const orders = [
      { leadSlug: "zeta", tier: "growth" },
      { leadSlug: "alpha", tier: "growth" },
    ];
    expect(listLeadsMissingBufferProfileMapping(leads, orders).map((l) => l.slug)).toEqual([
      "alpha",
      "zeta",
    ]);
  });
});

describe("oldestBufferProfileMappingMissingAgeHours", () => {
  it("returns null when there are no candidates", () => {
    expect(oldestBufferProfileMappingMissingAgeHours([], [], NOW)).toBeNull();
  });

  it("returns null when no candidate has a qualifying, parseable order", () => {
    const result = oldestBufferProfileMappingMissingAgeHours(
      [{ slug: "no-order" }],
      [],
      NOW,
    );
    expect(result).toBeNull();
  });

  it("anchors on the oldest qualifying order's createdAt", () => {
    const candidates = [{ slug: "a" }, { slug: "b" }];
    const orders = [
      {
        leadSlug: "a",
        tier: "growth",
        createdAt: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        leadSlug: "b",
        tier: "complete",
        createdAt: new Date(NOW - 20 * 60 * 60 * 1000).toISOString(),
      },
    ];
    expect(oldestBufferProfileMappingMissingAgeHours(candidates, orders, NOW)).toBe(20);
  });

  it("ignores a refunded/disputed order even if older than a genuinely active one", () => {
    const candidates = [{ slug: "a" }];
    const orders = [
      {
        leadSlug: "a",
        tier: "growth",
        refundedAt: new Date(NOW - 100 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(NOW - 100 * 60 * 60 * 1000).toISOString(),
      },
      {
        leadSlug: "a",
        tier: "growth",
        createdAt: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      },
    ];
    expect(oldestBufferProfileMappingMissingAgeHours(candidates, orders, NOW)).toBe(4);
  });
});

describe("listMarketingPacksMissingBufferPost", () => {
  it("flags a generated pack for a Buffer-mapped lead with no posted keys", () => {
    const leads = [{ slug: "mapped", stage: "paid" as const, bufferProfileIds: ["p1"] }];
    const orders = [{ leadSlug: "mapped", tier: "growth" }];
    const packs = [
      { leadSlug: "mapped", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(
      listMarketingPacksMissingBufferPost(packs, leads, orders).map((p) => p.leadSlug),
    ).toEqual(["mapped"]);
  });

  it("excludes a lead who never mapped Buffer profiles", () => {
    const leads = [{ slug: "unmapped", stage: "paid" as const }];
    const orders = [{ leadSlug: "unmapped", tier: "growth" }];
    const packs = [
      { leadSlug: "unmapped", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(listMarketingPacksMissingBufferPost(packs, leads, orders)).toEqual([]);
  });

  it("excludes a pack already posted to Buffer this generation", () => {
    const leads = [
      {
        slug: "posted",
        stage: "paid" as const,
        bufferProfileIds: ["p1"],
        bufferPostedVariantKeys: ["2026-07-01T00:00:00.000Z|p1|facebook_caption|0"],
      },
    ];
    const orders = [{ leadSlug: "posted", tier: "growth" }];
    const packs = [
      { leadSlug: "posted", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(listMarketingPacksMissingBufferPost(packs, leads, orders)).toEqual([]);
  });

  it("still flags a mid-month regenerate whose posted keys belong to the prior generation", () => {
    const leads = [
      {
        slug: "regenerated",
        stage: "paid" as const,
        bufferProfileIds: ["p1"],
        // Posted against an earlier generatedAt, before this month's regenerate.
        bufferPostedVariantKeys: ["2026-07-01T00:00:00.000Z|p1|facebook_caption|0"],
      },
    ];
    const orders = [{ leadSlug: "regenerated", tier: "growth" }];
    const packs = [
      { leadSlug: "regenerated", yearMonth: "2026-07", generatedAt: "2026-07-15T00:00:00.000Z" },
    ];
    expect(
      listMarketingPacksMissingBufferPost(packs, leads, orders).map((p) => p.leadSlug),
    ).toEqual(["regenerated"]);
  });

  it("excludes a pack whose lead is no longer eligible (e.g. Starter-only)", () => {
    const leads = [{ slug: "starter-only", stage: "paid" as const, bufferProfileIds: ["p1"] }];
    const orders = [{ leadSlug: "starter-only", tier: "starter" }];
    const packs = [
      { leadSlug: "starter-only", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(listMarketingPacksMissingBufferPost(packs, leads, orders)).toEqual([]);
  });

  it("sorts results by leadSlug", () => {
    const leads = [
      { slug: "zeta", stage: "paid" as const, bufferProfileIds: ["p1"] },
      { slug: "alpha", stage: "paid" as const, bufferProfileIds: ["p1"] },
    ];
    const orders = [
      { leadSlug: "zeta", tier: "growth" },
      { leadSlug: "alpha", tier: "growth" },
    ];
    const packs = [
      { leadSlug: "zeta", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
      { leadSlug: "alpha", yearMonth: "2026-07", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(
      listMarketingPacksMissingBufferPost(packs, leads, orders).map((p) => p.leadSlug),
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("oldestMarketingPackMissingBufferPostAgeHours", () => {
  it("returns null when there are no candidates", () => {
    expect(oldestMarketingPackMissingBufferPostAgeHours([], NOW)).toBeNull();
  });

  it("computes hours since the oldest candidate's generatedAt", () => {
    const nowMs = Date.parse("2026-07-10T00:00:00.000Z");
    const candidates = [
      { generatedAt: "2026-07-05T00:00:00.000Z" },
      { generatedAt: "2026-07-08T00:00:00.000Z" },
    ];
    expect(oldestMarketingPackMissingBufferPostAgeHours(candidates, nowMs)).toBe(5 * 24);
  });

  it("skips a candidate with no parseable generatedAt", () => {
    const nowMs = Date.parse("2026-07-10T00:00:00.000Z");
    expect(
      oldestMarketingPackMissingBufferPostAgeHours(
        [{ generatedAt: undefined }, { generatedAt: "not-a-date" }],
        nowMs,
      ),
    ).toBeNull();
  });
});

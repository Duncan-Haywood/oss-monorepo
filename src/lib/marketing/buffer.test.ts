import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bufferServiceContentType,
  createBufferUpdate,
  formatMarketingVariantForBuffer,
  listBufferProfiles,
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
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("access_token=tok_x"),
    );
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

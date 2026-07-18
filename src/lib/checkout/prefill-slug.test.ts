import { describe, expect, it, vi } from "vitest";
import { MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH } from "@/lib/leads/slug-path";
import type { Lead } from "@/lib/leads/types";
import {
  loadCheckoutPrefillLead,
  resolveCheckoutPrefillSlug,
} from "./prefill-slug";

function stubLead(slug: string): Lead {
  return {
    slug,
    businessName: "Stub Biz",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    address: "",
    tagline: "",
    description: "",
    phone: "",
    email: "owner@example.com",
    services: [],
    hours: { weekday: "", weekend: "" },
    stage: "discovered",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  };
}

describe("resolveCheckoutPrefillSlug", () => {
  it("returns undefined for missing / blank", () => {
    expect(resolveCheckoutPrefillSlug(undefined)).toBeUndefined();
    expect(resolveCheckoutPrefillSlug(null)).toBeUndefined();
    expect(resolveCheckoutPrefillSlug("")).toBeUndefined();
    expect(resolveCheckoutPrefillSlug("   ")).toBeUndefined();
  });

  it("returns undefined for over-long (treat as missing)", () => {
    const tooLong = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);
    expect(resolveCheckoutPrefillSlug(tooLong)).toBeUndefined();
  });

  it("accepts exact-max and trims", () => {
    const exact = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH);
    expect(resolveCheckoutPrefillSlug(exact)).toBe(exact);
    expect(resolveCheckoutPrefillSlug("  serene-salon  ")).toBe("serene-salon");
  });
});

describe("loadCheckoutPrefillLead", () => {
  it("skips CRM for over-long slug and returns empty prefill", async () => {
    const getLeadBySlug = vi.fn(async () => stubLead("x"));
    const tooLong = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);

    await expect(
      loadCheckoutPrefillLead(tooLong, { getLeadBySlug }),
    ).resolves.toEqual({ slug: undefined, lead: null });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("skips CRM for empty slug", async () => {
    const getLeadBySlug = vi.fn(async () => stubLead("x"));

    await expect(
      loadCheckoutPrefillLead("  ", { getLeadBySlug }),
    ).resolves.toEqual({ slug: undefined, lead: null });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("prefers CRM canonical slug when found", async () => {
    const crm = stubLead("serene-salon");
    const getLeadBySlug = vi.fn(async () => crm);

    await expect(
      loadCheckoutPrefillLead("serene-salon", { getLeadBySlug }),
    ).resolves.toEqual({ slug: "serene-salon", lead: crm });
    expect(getLeadBySlug).toHaveBeenCalledWith("serene-salon");
  });

  it("keeps accepted query slug when CRM misses (attribution without identity)", async () => {
    const getLeadBySlug = vi.fn(async () => null);

    await expect(
      loadCheckoutPrefillLead("unknown-cafe", { getLeadBySlug }),
    ).resolves.toEqual({ slug: "unknown-cafe", lead: null });
  });

  it("accepts exact-max length before CRM", async () => {
    const exact = "b".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH);
    const crm = stubLead(exact);
    const getLeadBySlug = vi.fn(async () => crm);

    await expect(
      loadCheckoutPrefillLead(exact, { getLeadBySlug }),
    ).resolves.toEqual({ slug: exact, lead: crm });
    expect(getLeadBySlug).toHaveBeenCalledWith(exact);
  });
});

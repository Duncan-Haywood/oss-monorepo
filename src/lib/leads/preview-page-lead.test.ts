import { describe, expect, it, vi } from "vitest";
import { MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH } from "@/lib/leads/slug-path";
import type { Lead } from "@/lib/leads/types";
import { loadPreviewPageLead } from "./preview-page-lead";

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
    email: "",
    services: [],
    hours: { weekday: "", weekend: "" },
    stage: "new",
    recommendedTier: "starter",
    dataSource: "demo_catalog",
  };
}

describe("loadPreviewPageLead", () => {
  it("returns null and skips CRM/demo for over-long path slugs", async () => {
    const getLeadBySlug = vi.fn(async () => stubLead("x"));
    const resolvePreviewLead = vi.fn(() => stubLead("x"));
    const tooLong = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);

    await expect(
      loadPreviewPageLead(tooLong, { getLeadBySlug, resolvePreviewLead }),
    ).resolves.toBeNull();
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(resolvePreviewLead).not.toHaveBeenCalled();
  });

  it("returns null for empty slug without calling deps", async () => {
    const getLeadBySlug = vi.fn(async () => stubLead("x"));
    const resolvePreviewLead = vi.fn(() => stubLead("x"));

    await expect(
      loadPreviewPageLead("", { getLeadBySlug, resolvePreviewLead }),
    ).resolves.toBeNull();
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(resolvePreviewLead).not.toHaveBeenCalled();
  });

  it("accepts exact-max length and prefers CRM over demo mint", async () => {
    const exact = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH);
    const crm = stubLead(exact);
    const getLeadBySlug = vi.fn(async () => crm);
    const resolvePreviewLead = vi.fn(() => stubLead("minted"));

    await expect(
      loadPreviewPageLead(exact, { getLeadBySlug, resolvePreviewLead }),
    ).resolves.toBe(crm);
    expect(getLeadBySlug).toHaveBeenCalledWith(exact);
    expect(resolvePreviewLead).not.toHaveBeenCalled();
  });

  it("falls through to resolvePreviewLead when CRM misses", async () => {
    const minted = stubLead("unknown-cafe");
    const getLeadBySlug = vi.fn(async () => null);
    const resolvePreviewLead = vi.fn(() => minted);

    await expect(
      loadPreviewPageLead("unknown-cafe", { getLeadBySlug, resolvePreviewLead }),
    ).resolves.toBe(minted);
    expect(resolvePreviewLead).toHaveBeenCalledWith("unknown-cafe");
  });
});

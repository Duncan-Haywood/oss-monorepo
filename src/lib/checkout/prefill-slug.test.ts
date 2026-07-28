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
    const listOrdersByLeadSlug = vi.fn(async () => []);
    const tooLong = "a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1);

    await expect(
      loadCheckoutPrefillLead(tooLong, { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: undefined, lead: null, hasExistingOrder: false });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
  });

  it("skips CRM for empty slug", async () => {
    const getLeadBySlug = vi.fn(async () => stubLead("x"));
    const listOrdersByLeadSlug = vi.fn(async () => []);

    await expect(
      loadCheckoutPrefillLead("  ", { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: undefined, lead: null, hasExistingOrder: false });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("prefers CRM canonical slug when found, and reports no existing order when the lead has none", async () => {
    const crm = stubLead("serene-salon");
    const getLeadBySlug = vi.fn(async () => crm);
    const listOrdersByLeadSlug = vi.fn(async () => []);

    await expect(
      loadCheckoutPrefillLead("serene-salon", { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: "serene-salon", lead: crm, hasExistingOrder: false });
    expect(getLeadBySlug).toHaveBeenCalledWith("serene-salon");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("serene-salon");
  });

  it("reports hasExistingOrder: true when the lead already has a prior bundle order (checkout-setup-fee-skip-on-upgrade)", async () => {
    const crm = stubLead("serene-salon");
    const getLeadBySlug = vi.fn(async () => crm);
    const listOrdersByLeadSlug = vi.fn(async () => [
      {
        id: "order_1",
        leadSlug: "serene-salon",
        stripeSessionId: "cs_1",
        tier: "starter",
        commerceAddon: false,
        amountPaid: 500,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await expect(
      loadCheckoutPrefillLead("serene-salon", { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: "serene-salon", lead: crm, hasExistingOrder: true });
  });

  it("keeps accepted query slug when CRM misses (attribution without identity), and never looks up orders for a slug with no CRM lead", async () => {
    const getLeadBySlug = vi.fn(async () => null);
    const listOrdersByLeadSlug = vi.fn(async () => []);

    await expect(
      loadCheckoutPrefillLead("unknown-cafe", { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: "unknown-cafe", lead: null, hasExistingOrder: false });
    expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
  });

  it("accepts exact-max length before CRM", async () => {
    const exact = "b".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH);
    const crm = stubLead(exact);
    const getLeadBySlug = vi.fn(async () => crm);
    const listOrdersByLeadSlug = vi.fn(async () => []);

    await expect(
      loadCheckoutPrefillLead(exact, { getLeadBySlug, listOrdersByLeadSlug }),
    ).resolves.toEqual({ slug: exact, lead: crm, hasExistingOrder: false });
    expect(getLeadBySlug).toHaveBeenCalledWith(exact);
  });
});

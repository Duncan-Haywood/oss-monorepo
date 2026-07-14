import { describe, expect, it } from "vitest";
import type { Lead } from "./types";
import {
  revertSingleLeadOptimisticUpdate,
  upsertSavedLeadBySlug,
} from "./optimistic-updates";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "joes-diner",
    businessName: "Joe's Diner",
    category: "restaurant",
    city: "Denver",
    state: "CO",
    tagline: "Great food",
    description: "A diner",
    phone: "555-1234",
    services: ["Dine-in"],
    hours: { weekday: "Mon-Fri 8am-5pm", weekend: "Closed" },
    stage: "discovered",
    recommendedTier: "starter",
    ...overrides,
  };
}

describe("upsertSavedLeadBySlug", () => {
  it("appends a new lead when its slug isn't already in the list", () => {
    const existing = [makeLead({ slug: "a-diner" })];
    const saved = makeLead({ slug: "brand-new-cafe", businessName: "Brand New Cafe" });
    const result = upsertSavedLeadBySlug(existing, saved);
    expect(result).toEqual([existing[0], saved]);
  });

  it("replaces the existing row in place when the slug already exists", () => {
    const existing = [
      makeLead({ slug: "a-diner", businessName: "Old Name" }),
      makeLead({ slug: "b-cafe" }),
    ];
    const saved = makeLead({ slug: "a-diner", businessName: "New Name" });
    const result = upsertSavedLeadBySlug(existing, saved);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(saved);
    expect(result[1]).toEqual(existing[1]);
  });

  it("keys on the server-normalized slug, not any client-typed variant", () => {
    // Regression for leads-client-optimistic-state-desync: the caller must
    // pass the addLeadAction-returned (normalized) slug on savedLead, never
    // the raw formSlug input — this helper just proves it keys off whatever
    // slug it's given, so normalization has to happen before calling it.
    const existing: Lead[] = [];
    const saved = makeLead({ slug: "joes-pizza" }); // already normalized by the caller
    const result = upsertSavedLeadBySlug(existing, saved);
    expect(result).toEqual([saved]);
  });
});

describe("revertSingleLeadOptimisticUpdate", () => {
  it("reverts only the matching row, leaving every other row untouched", () => {
    const untouched = makeLead({ slug: "untouched-lead", stage: "paid" });
    const optimisticallyUpdated = makeLead({ slug: "target-lead", stage: "outreach_sent" });
    const previous = makeLead({ slug: "target-lead", stage: "discovered" });
    const current = [untouched, optimisticallyUpdated];

    const result = revertSingleLeadOptimisticUpdate(current, "target-lead", previous);

    expect(result).toEqual([untouched, previous]);
    // The untouched row must be the exact same reference — never rebuilt.
    expect(result[0]).toBe(untouched);
  });

  it("does not wipe unrelated in-session optimistic edits", () => {
    // Regression for leads-client-optimistic-state-desync bug 2: reverting a
    // failed stage change must not reset the whole list back to the
    // page-load snapshot, which would also undo an unrelated edit made
    // earlier in the same session (e.g. a lead added after page load).
    const addedThisSession = makeLead({ slug: "added-this-session" });
    const previous = makeLead({ slug: "target-lead", stage: "discovered" });
    const current = [
      makeLead({ slug: "target-lead", stage: "outreach_sent" }),
      addedThisSession,
    ];

    const result = revertSingleLeadOptimisticUpdate(current, "target-lead", previous);

    expect(result).toContainEqual(addedThisSession);
    expect(result).toContainEqual(previous);
  });

  it("is a no-op when there is no previous snapshot for the slug", () => {
    const current = [makeLead({ slug: "target-lead" })];
    const result = revertSingleLeadOptimisticUpdate(current, "target-lead", undefined);
    expect(result).toBe(current);
  });
});

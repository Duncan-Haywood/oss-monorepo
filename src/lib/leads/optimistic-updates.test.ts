import { describe, expect, it } from "vitest";
import type { Lead } from "./types";
import {
  mergeFreshLeadsPreservingInFlightEdits,
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

  it("reverts when the row still holds the exact optimistic object this call applied", () => {
    // Regression for stage-change-optimistic-revert-race: the common case
    // (no overlapping call) must keep working once a 4th expectedOptimistic
    // argument is threaded through.
    const previous = makeLead({ slug: "target-lead", stage: "discovered" });
    const optimisticLead = makeLead({ slug: "target-lead", stage: "outreach_sent" });
    const current = [optimisticLead];

    const result = revertSingleLeadOptimisticUpdate(
      current,
      "target-lead",
      previous,
      optimisticLead,
    );

    expect(result).toEqual([previous]);
  });

  it("does not revert when a later, overlapping call already changed the row", () => {
    // Regression for stage-change-optimistic-revert-race: operator changes
    // stage A -> B (call 1, snapshot = A), then B -> C (call 2, snapshot =
    // B) before call 1's response lands. Call 2 succeeds and persists C.
    // Call 1 then fails and tries to revert to A — its expectedOptimistic
    // (B) no longer matches the row (now C), so the revert must be a no-op
    // instead of clobbering the newer, already-committed stage.
    const staleOptimisticB = makeLead({ slug: "target-lead", stage: "outreach_sent" });
    const newerOptimisticC = makeLead({ slug: "target-lead", stage: "paid" });
    const current = [newerOptimisticC];
    const previousA = makeLead({ slug: "target-lead", stage: "discovered" });

    const result = revertSingleLeadOptimisticUpdate(
      current,
      "target-lead",
      previousA,
      staleOptimisticB,
    );

    expect(result[0]).toBe(newerOptimisticC);
    expect(result).toEqual([newerOptimisticC]);
  });

  it("still reverts unconditionally when expectedOptimistic is omitted (back-compat)", () => {
    const previous = makeLead({ slug: "target-lead", stage: "discovered" });
    const current = [makeLead({ slug: "target-lead", stage: "outreach_sent" })];

    const result = revertSingleLeadOptimisticUpdate(current, "target-lead", previous);

    expect(result).toEqual([previous]);
  });
});

describe("mergeFreshLeadsPreservingInFlightEdits", () => {
  it("adopts the fresh list verbatim when nothing is in flight", () => {
    // Regression for leads-client-stale-prop-resync: a lead changed by
    // something other than this component's own handlers (another tab, a
    // webhook, an unrelated action's revalidatePath) must show up here, not
    // stay frozen at whatever `leads` held before.
    const current = [makeLead({ slug: "a-diner", stage: "discovered" })];
    const fresh = [makeLead({ slug: "a-diner", stage: "paid" })];

    const result = mergeFreshLeadsPreservingInFlightEdits(current, fresh, new Set());

    expect(result).toBe(fresh);
  });

  it("keeps the current local row for a slug still mid optimistic edit", () => {
    const inFlightLocal = makeLead({ slug: "target-lead", stage: "outreach_sent" });
    const staleFresh = makeLead({ slug: "target-lead", stage: "discovered" });
    const current = [inFlightLocal];
    const fresh = [staleFresh];

    const result = mergeFreshLeadsPreservingInFlightEdits(
      current,
      fresh,
      new Set(["target-lead"]),
    );

    expect(result).toEqual([inFlightLocal]);
    expect(result[0]).toBe(inFlightLocal);
  });

  it("merges per-row: refreshes untouched rows while preserving the one in-flight row", () => {
    const untouchedStaleLocal = makeLead({ slug: "other-lead", stage: "discovered" });
    const untouchedFresh = makeLead({ slug: "other-lead", stage: "paid" });
    const inFlightLocal = makeLead({ slug: "target-lead", stage: "outreach_sent" });
    const inFlightFresh = makeLead({ slug: "target-lead", stage: "discovered" });
    const current = [untouchedStaleLocal, inFlightLocal];
    const fresh = [untouchedFresh, inFlightFresh];

    const result = mergeFreshLeadsPreservingInFlightEdits(
      current,
      fresh,
      new Set(["target-lead"]),
    );

    expect(result).toEqual([untouchedFresh, inFlightLocal]);
  });

  it("keeps a locally-added in-flight row that hasn't round-tripped into fresh yet", () => {
    const addedLocally = makeLead({ slug: "brand-new-lead" });
    const current = [addedLocally];
    const fresh: Lead[] = [];

    const result = mergeFreshLeadsPreservingInFlightEdits(
      current,
      fresh,
      new Set(["brand-new-lead"]),
    );

    expect(result).toEqual([addedLocally]);
  });

  it("does not drop an in-flight row's local value even though it's absent from a non-empty fresh list", () => {
    const addedLocally = makeLead({ slug: "brand-new-lead" });
    const existingFresh = makeLead({ slug: "existing-lead" });
    const current = [existingFresh, addedLocally];
    const fresh = [existingFresh];

    const result = mergeFreshLeadsPreservingInFlightEdits(
      current,
      fresh,
      new Set(["brand-new-lead"]),
    );

    expect(result).toEqual([existingFresh, addedLocally]);
  });
});

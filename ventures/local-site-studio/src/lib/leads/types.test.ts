import { describe, expect, it } from "vitest";
import { newLeadId } from "./types";

describe("newLeadId", () => {
  it("returns a non-empty string prefixed with lead_", () => {
    const id = newLeadId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("lead_")).toBe(true);
  });

  it("generates distinct ids across same-millisecond calls (collision guard)", () => {
    // Regression for leads-sqlite-id-collision-guard: the pre-fix generator
    // was `lead_${Date.now()}` with no random component, so two leads
    // created in the same millisecond (a CSV bulk-import loop inserting many
    // fresh rows synchronously, or two near-simultaneous Stripe webhook
    // payment-stub creates) produced an identical id — leads.id is a SQLite
    // PRIMARY KEY, so the second INSERT throws a constraint-violation error
    // instead of the row landing safely.
    const ids = new Set(Array.from({ length: 50 }, () => newLeadId()));
    expect(ids.size).toBe(50);
  });
});

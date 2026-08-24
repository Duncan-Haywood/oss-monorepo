import { describe, expect, it } from "vitest";
import { newCheckoutSessionId } from "./types";

describe("newCheckoutSessionId", () => {
  it("returns a non-empty string prefixed with chk_", () => {
    const id = newCheckoutSessionId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("chk_")).toBe(true);
  });

  it("generates distinct ids across same-millisecond calls (collision guard)", () => {
    // Regression for leads-sqlite-id-collision-guard: the pre-fix generator
    // was `chk_${Date.now()}` with no random component, so two checkout
    // sessions created in the same millisecond (two shoppers starting
    // checkout at once) produced an identical id — checkout_sessions.id is a
    // SQLite PRIMARY KEY, and the row's `ON CONFLICT(stripeSessionId) DO
    // NOTHING` only de-dupes on the Stripe session id column, so a colliding
    // `id` from a different stripeSessionId still throws a
    // constraint-violation error on INSERT.
    const ids = new Set(Array.from({ length: 50 }, () => newCheckoutSessionId()));
    expect(ids.size).toBe(50);
  });
});

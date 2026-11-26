import { describe, expect, it } from "vitest";
import { isPastValidity, isRevisable, quoteFileLabel, quoteLabel } from "./quote-label";

describe("quote labels", () => {
  it("names the original without a suffix and revisions with Rev N", () => {
    expect(quoteLabel(1001)).toBe("Q-1001");
    expect(quoteLabel(1001, 1)).toBe("Q-1001");
    expect(quoteLabel(1001, 2)).toBe("Q-1001 Rev 2");
    expect(quoteFileLabel(1001, 1)).toBe("Q-1001");
    expect(quoteFileLabel(1001, 3)).toBe("Q-1001-R3");
  });

  it("revises only sent, lost or expired quotes", () => {
    expect(["draft", "sent", "won", "lost", "expired", "superseded"].filter(isRevisable)).toEqual([
      "sent",
      "lost",
      "expired",
    ]);
  });

  it("expires the day after the valid-until date, never on it", () => {
    expect(isPastValidity("2026-11-25", "2026-11-25")).toBe(false);
    expect(isPastValidity("2026-11-25", "2026-11-26")).toBe(true);
    expect(isPastValidity("2026-11-26", "2026-11-25")).toBe(false);
    expect(isPastValidity(null, "2026-11-25")).toBe(false);
    // A malformed date is never treated as past (nothing expires on a typo).
    expect(isPastValidity("next week", "2026-11-25")).toBe(false);
  });
});

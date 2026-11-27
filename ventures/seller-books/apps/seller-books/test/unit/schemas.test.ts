import { describe, expect, it } from "vitest";
import { isoDate } from "../../src/worker/routes/org/schemas";

describe("isoDate", () => {
  it("accepts real calendar dates, leap days included", () => {
    for (const d of ["2026-01-31", "2024-02-29", "2026-12-31"])
      expect(isoDate.safeParse(d).success).toBe(true);
  });
  it("rejects days a month does not have instead of rolling them over", () => {
    for (const d of [
      "2026-02-30",
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-01-00",
    ]) {
      expect(isoDate.safeParse(d).success).toBe(false);
    }
  });
});

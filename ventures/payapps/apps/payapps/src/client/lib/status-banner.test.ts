import { describe, expect, it } from "vitest";
import { CHECK_FIGURES, statusBanner } from "./status-banner";

describe("statusBanner", () => {
  it("says paid plans are not on sale while checkout is off, loading or unknown", () => {
    for (const checkout of [false, undefined]) {
      const text = statusBanner(checkout);
      expect(text).toContain("not on sale yet");
      expect(text).toContain("free on one job");
      expect(text).not.toMatch(/in development/i);
    }
  });

  it("drops the not-on-sale line once checkout is on", () => {
    const text = statusBanner(true);
    expect(text).not.toContain("not on sale");
    expect(text).toContain("paid plans for more");
  });

  it("always carries the check-every-figure disclaimer", () => {
    for (const checkout of [true, false, undefined])
      expect(statusBanner(checkout)).toContain(CHECK_FIGURES);
  });
});

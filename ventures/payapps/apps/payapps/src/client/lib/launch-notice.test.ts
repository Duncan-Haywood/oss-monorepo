import { describe, expect, it } from "vitest";
import { CHECK_FIGURES, launchNotice } from "./launch-notice";

describe("launchNotice", () => {
  it("makes no claim until the plan list has loaded, or from an older worker without the flag", () => {
    expect(launchNotice(undefined)).toBe(CHECK_FIGURES);
    expect(launchNotice(null)).toBe(CHECK_FIGURES);
    expect(launchNotice({})).toBe(CHECK_FIGURES);
  });

  it("says paid plans are not on sale while checkout is dark", () => {
    const text = launchNotice({ checkoutAvailable: false });
    expect(text).toContain("open on the Free plan");
    expect(text).toContain("not on sale yet");
    expect(text).toContain(CHECK_FIGURES);
  });

  it("drops 'not on sale' once checkout is available", () => {
    const text = launchNotice({ checkoutAvailable: true });
    expect(text).not.toContain("not on sale");
    expect(text).toContain("paid plans for more jobs");
  });
});

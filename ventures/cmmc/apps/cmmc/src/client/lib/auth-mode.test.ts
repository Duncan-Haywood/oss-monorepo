import { describe, expect, it } from "vitest";
import { initialAuthMode } from "./auth-mode";

describe("initialAuthMode", () => {
  it("opens sign-in by default", () => {
    expect(initialAuthMode("")).toBe("in");
    expect(initialAuthMode("?tab=poam")).toBe("in");
  });
  it("opens sign-up for ?signup with or without a value", () => {
    expect(initialAuthMode("?signup")).toBe("up");
    expect(initialAuthMode("?signup=1")).toBe("up");
    expect(initialAuthMode("?signup&from=machine-shop-guides/sprs-score-calculator")).toBe("up");
  });
  it("keeps sign-in when the flag is turned off", () => {
    expect(initialAuthMode("?signup=0")).toBe("in");
    expect(initialAuthMode("?signup=false")).toBe("in");
    expect(initialAuthMode("?signup=NO")).toBe("in");
  });
});

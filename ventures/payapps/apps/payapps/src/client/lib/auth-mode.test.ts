import { describe, expect, it } from "vitest";
import { initialAuthMode } from "./auth-mode";

describe("initialAuthMode", () => {
  it("opens sign-in by default", () => {
    expect(initialAuthMode("")).toBe("sign-in");
    expect(initialAuthMode("?checkout=done")).toBe("sign-in");
  });
  it("opens sign-up for ?signup with or without a value", () => {
    expect(initialAuthMode("?signup")).toBe("sign-up");
    expect(initialAuthMode("?signup=1")).toBe("sign-up");
    expect(initialAuthMode("?from=retainage-explained&signup=")).toBe("sign-up");
  });
  it("keeps sign-in when the flag is turned off", () => {
    expect(initialAuthMode("?signup=0")).toBe("sign-in");
    expect(initialAuthMode("?signup=false")).toBe("sign-in");
    expect(initialAuthMode("?signup=NO")).toBe("sign-in");
  });
});

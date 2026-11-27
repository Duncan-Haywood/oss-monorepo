import { describe, expect, it } from "vitest";
import { authModeFromLocation } from "./auth-mode";

describe("authModeFromLocation", () => {
  it("opens sign-up on /signup, with or without a trailing slash or a from tag", () => {
    expect(authModeFromLocation("/signup")).toBe("up");
    expect(authModeFromLocation("/signup/", "?from=cmmc-site%2Fhome")).toBe("up");
    expect(authModeFromLocation("/sign-up")).toBe("up");
  });
  it("opens sign-up on ?mode=signup", () => {
    expect(authModeFromLocation("/", "?mode=signup")).toBe("up");
  });
  it("opens sign-in everywhere else", () => {
    expect(authModeFromLocation("/")).toBe("in");
    expect(authModeFromLocation("/login")).toBe("in");
    expect(authModeFromLocation("/signups")).toBe("in");
    expect(authModeFromLocation("/x/signup")).toBe("in");
    expect(authModeFromLocation("/", "?mode=other")).toBe("in");
  });
});

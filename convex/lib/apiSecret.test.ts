import { afterEach, describe, expect, it } from "vitest";
import { requireApiSecret } from "./apiSecret";

describe("requireApiSecret", () => {
  afterEach(() => {
    delete process.env.CONVEX_API_SECRET;
  });

  it("throws when CONVEX_API_SECRET is unset, regardless of the provided secret", () => {
    delete process.env.CONVEX_API_SECRET;
    expect(() => requireApiSecret("")).toThrow(/Unauthorized/);
    expect(() => requireApiSecret("anything")).toThrow(/Unauthorized/);
  });

  it("throws when CONVEX_API_SECRET is set but the provided secret does not match", () => {
    process.env.CONVEX_API_SECRET = "correct-secret";
    expect(() => requireApiSecret("wrong-secret")).toThrow(/Unauthorized/);
    expect(() => requireApiSecret("")).toThrow(/Unauthorized/);
  });

  it("does not throw when the provided secret matches CONVEX_API_SECRET exactly", () => {
    process.env.CONVEX_API_SECRET = "correct-secret";
    expect(() => requireApiSecret("correct-secret")).not.toThrow();
  });

  it("treats an empty-string CONVEX_API_SECRET as unset (fails closed, never matches an empty caller secret)", () => {
    process.env.CONVEX_API_SECRET = "";
    expect(() => requireApiSecret("")).toThrow(/Unauthorized/);
  });

  it("rejects a same-length secret that differs only in its last character", () => {
    process.env.CONVEX_API_SECRET = "correct-secret";
    expect(() => requireApiSecret("correct-secreT")).toThrow(/Unauthorized/);
  });

  it("rejects a provided secret that is a strict prefix of the expected one", () => {
    process.env.CONVEX_API_SECRET = "correct-secret";
    expect(() => requireApiSecret("correct-secre")).toThrow(/Unauthorized/);
  });

  it("rejects a provided secret longer than the expected one", () => {
    process.env.CONVEX_API_SECRET = "correct-secret";
    expect(() => requireApiSecret("correct-secret-extra")).toThrow(/Unauthorized/);
  });
});
